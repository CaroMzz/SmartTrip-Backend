const pool = require("../src/database/pool");
const catalogo = require("../services/catalogoDestinos");
const AppError = require("../services/appError");

const prioridadesDesdeFila = (fila) => ({
    ahorro: Number(fila?.minimizar_costo ?? 60),
    atractivos: Number(fila?.maximizar_turismo ?? 40)
});

const codigoPais = (nombre) => catalogo.obtenerPais(nombre)?.codigo || null;

const obtenerPaisId = async (cliente, nombre) => {
    const pais = catalogo.obtenerPais(nombre);
    if (!pais) throw new AppError(422, `El país "${nombre}" no está en el catálogo local. Elegí uno de los países sugeridos.`);
    const resultado = await cliente.query(`
        INSERT INTO smarttrip.pais (codigo_iso, nombre, proveedor, actualizado_fuente_en)
        VALUES ($1, $2, 'Catálogo local SmartTrip', now())
        ON CONFLICT (codigo_iso) DO UPDATE
        SET nombre = EXCLUDED.nombre, proveedor = EXCLUDED.proveedor, actualizado_fuente_en = now()
        RETURNING id
    `, [pais.codigo, pais.nombre]);
    return { id: resultado.rows[0].id, ...pais };
};

const obtenerDestinoId = async (cliente, ciudad, pais) => {
    const nombre = ciudad.nombre.trim();
    const resultado = await cliente.query(`
        INSERT INTO smarttrip.destino AS d (
            "FK_pais_id", nombre, identificador_externo, latitud, longitud, proveedor, actualizado_fuente_en
        ) VALUES ($1, $2, $3, $4, $5, 'Catálogo local SmartTrip', now())
        ON CONFLICT ("FK_pais_id", nombre) DO UPDATE SET
            identificador_externo = COALESCE(EXCLUDED.identificador_externo, d.identificador_externo),
            latitud = COALESCE(EXCLUDED.latitud, d.latitud),
            longitud = COALESCE(EXCLUDED.longitud, d.longitud),
            actualizado_fuente_en = now()
        RETURNING id
    `, [pais.id, nombre, ciudad.idExterno || null, ciudad.latitud, ciudad.longitud]);
    return resultado.rows[0].id;
};

const obtenerTransporteId = async (cliente, tipo) => {
    if (!tipo) return null;
    const resultado = await cliente.query(
        "SELECT id FROM smarttrip.transporte WHERE tipo = $1 AND activo = true",
        [tipo]
    );
    if (!resultado.rowCount) throw new AppError(422, `El transporte "${tipo}" no está disponible en la base de datos`);
    return resultado.rows[0].id;
};

const persistirPaisesYDestinos = async (cliente, viaje) => {
    const paises = new Map();
    for (const nombre of viaje.paises || []) {
        const pais = await obtenerPaisId(cliente, nombre);
        paises.set(pais.codigo, pais);
    }
    const destinos = [];
    for (let indice = 0; indice < viaje.ciudades.length; indice++) {
        const ciudad = viaje.ciudades[indice];
        const nombrePais = ciudad.pais || (paises.size === 1 ? [...paises.values()][0].nombre : null);
        const paisCatalogo = nombrePais ? catalogo.obtenerPais(nombrePais) : null;
        if (!paisCatalogo) {
            throw new AppError(422, `No pude asociar "${ciudad.nombre}" con un país del catálogo. Seleccioná el país correspondiente.`);
        }
        let pais = paises.get(paisCatalogo.codigo);
        if (!pais) {
            pais = await obtenerPaisId(cliente, paisCatalogo.nombre);
            paises.set(pais.codigo, pais);
        }
        const destinoId = await obtenerDestinoId(cliente, ciudad, pais);
        destinos.push({ id: destinoId, ciudad: { ...ciudad, pais: pais.nombre }, pais, orden: indice + 1 });
    }

    for (const pais of paises.values()) {
        await cliente.query(`
            INSERT INTO smarttrip.viaje_pais ("FK_viaje_id", "FK_pais_id")
            VALUES ($1, $2) ON CONFLICT ("FK_viaje_id", "FK_pais_id") DO NOTHING
        `, [viaje.id, pais.id]);
    }
    for (const destino of destinos) {
        await cliente.query(`
            INSERT INTO smarttrip.viaje_destino ("FK_viaje_id", "FK_destino_id", "FK_pais_id", orden)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT ("FK_viaje_id", "FK_destino_id") DO UPDATE SET orden = EXCLUDED.orden
        `, [viaje.id, destino.id, destino.pais.id, destino.orden]);
    }
    return destinos;
};

const guardarPreferenciasViaje = async (cliente, viaje) => {
    const prioridades = viaje.prioridades || { ahorro: 60, atractivos: 40 };
    await cliente.query("DELETE FROM smarttrip.preferencia WHERE \"FK_viaje_id\" = $1", [viaje.id]);
    await cliente.query(`
        INSERT INTO smarttrip.preferencia (
            "FK_viaje_id", minimizar_costo, reducir_distancia, maximizar_turismo,
            minimizar_cambios_alojamiento, priorizar_tren, priorizar_rutas_panoramicas
        ) VALUES ($1, $2, 0, $3, 0, 0, 0)
    `, [viaje.id, prioridades.ahorro, prioridades.atractivos]);
};

const armarViaje = async (cliente, id, usuarioId) => {
    const cabecera = await cliente.query(`
        SELECT v.*, t.tipo AS transporte_tipo, pu.minimizar_costo AS perfil_ahorro,
               pu.maximizar_turismo AS perfil_turismo, pv.minimizar_costo AS viaje_ahorro,
               pv.maximizar_turismo AS viaje_turismo,
               (SELECT i.id FROM smarttrip.itinerario i
                WHERE i."FK_viaje_id" = v.id AND i.seleccionado = true LIMIT 1) AS itinerario_seleccionado_id
        FROM smarttrip.viaje v
        LEFT JOIN smarttrip.transporte t ON t.id = v."FK_transporte_id"
        LEFT JOIN smarttrip.preferencia pu ON pu."FK_usuario_id" = v."FK_usuario_id" AND pu."FK_viaje_id" IS NULL
        LEFT JOIN smarttrip.preferencia pv ON pv."FK_viaje_id" = v.id
        WHERE v.id = $1 AND v."FK_usuario_id" = $2
    `, [id, usuarioId]);
    const fila = cabecera.rows[0];
    if (!fila) return null;

    const [paises, destinos, itinerarios] = await Promise.all([
        cliente.query(`
            SELECT p.nombre FROM smarttrip.viaje_pais vp
            JOIN smarttrip.pais p ON p.id = vp."FK_pais_id"
            WHERE vp."FK_viaje_id" = $1 ORDER BY p.nombre
        `, [id]),
        cliente.query(`
            SELECT d.id, d.nombre, d.identificador_externo, d.latitud, d.longitud, d."FK_pais_id",
                   p.nombre AS pais, d.proveedor
            FROM smarttrip.viaje_destino vd
            JOIN smarttrip.destino d ON d.id = vd."FK_destino_id"
            JOIN smarttrip.pais p ON p.id = vd."FK_pais_id"
            WHERE vd."FK_viaje_id" = $1 ORDER BY vd.orden
        `, [id]),
        cliente.query(`
            SELECT id, detalle_json FROM smarttrip.itinerario
            WHERE "FK_viaje_id" = $1 ORDER BY generacion, id
        `, [id])
    ]);

    const preferenciasViaje = fila.viaje_ahorro === null || fila.viaje_ahorro === undefined
        ? prioridadesDesdeFila({ minimizar_costo: fila.perfil_ahorro, maximizar_turismo: fila.perfil_turismo })
        : prioridadesDesdeFila({ minimizar_costo: fila.viaje_ahorro, maximizar_turismo: fila.viaje_turismo });
    const alternativas = itinerarios.rows.map((item) => {
        const detalle = item.detalle_json || {};
        return { ...detalle, id: String(item.id) };
    });
    const seleccionado = itinerarios.rows.find((item) => String(item.id) === String(fila.itinerario_seleccionado_id));

    return {
        id: String(fila.id),
        usuarioId: String(fila.FK_usuario_id),
        nombre: fila.nombre,
        paises: paises.rows.map((pais) => pais.nombre),
        ciudades: destinos.rows.map((destino, indice) => ({
            idExterno: destino.identificador_externo,
            nombre: destino.nombre,
            pais: destino.pais,
            latitud: destino.latitud === null ? null : Number(destino.latitud),
            longitud: destino.longitud === null ? null : Number(destino.longitud),
            puntajeTuristico: null,
            orden: indice
        })),
        fechaInicio: fila.fecha_inicio.toISOString ? fila.fecha_inicio.toISOString().slice(0, 10) : String(fila.fecha_inicio).slice(0, 10),
        duracionDias: Number(fila.cantidad_dias),
        cantidadPersonas: Number(fila.cantidad_personas),
        presupuestoTotal: fila.presupuesto_usd === null ? null : Number(fila.presupuesto_usd),
        moneda: "USD",
        transportePreferido: fila.transporte_tipo || null,
        prioridades: preferenciasViaje,
        estado: fila.estado || (seleccionado ? "itinerario_seleccionado" : (alternativas.length ? "alternativas_generadas" : "borrador")),
        itinerarios: alternativas,
        itinerarioSeleccionadoId: seleccionado ? String(seleccionado.id) : null,
        creadoEn: fila.creado_en.toISOString ? fila.creado_en.toISOString() : fila.creado_en,
        actualizadoEn: fila.actualizado_en.toISOString ? fila.actualizado_en.toISOString() : fila.actualizado_en
    };
};

const crear = async (viaje) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const transporteId = await obtenerTransporteId(cliente, viaje.transportePreferido);
        const resultado = await cliente.query(`
            INSERT INTO smarttrip.viaje (
                "FK_usuario_id", "FK_transporte_id", nombre, fecha_inicio, cantidad_dias,
                presupuesto_usd, cantidad_personas, estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `, [viaje.usuarioId, transporteId, viaje.nombre, viaje.fechaInicio, viaje.duracionDias,
            viaje.presupuestoTotal ?? null, viaje.cantidadPersonas, viaje.estado || "borrador"]);
        viaje.id = String(resultado.rows[0].id);
        await persistirPaisesYDestinos(cliente, viaje);
        await guardarPreferenciasViaje(cliente, viaje);
        const guardado = await armarViaje(cliente, viaje.id, viaje.usuarioId);
        await cliente.query("COMMIT");
        return guardado;
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
};

const listarPorUsuario = async (usuarioId) => {
    const ids = await pool.query(`
        SELECT id FROM smarttrip.viaje WHERE "FK_usuario_id" = $1 ORDER BY actualizado_en DESC
    `, [usuarioId]);
    return Promise.all(ids.rows.map((fila) => armarViaje(pool, fila.id, usuarioId)));
};

const buscarPorUsuario = (id, usuarioId) => armarViaje(pool, id, usuarioId);

const guardar = async (viaje) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const transporteId = await obtenerTransporteId(cliente, viaje.transportePreferido);
        const actualizado = await cliente.query(`
            UPDATE smarttrip.viaje SET
                "FK_transporte_id" = $3, nombre = $4, fecha_inicio = $5, cantidad_dias = $6,
                presupuesto_usd = $7, cantidad_personas = $8, estado = $9, actualizado_en = now()
            WHERE id = $1 AND "FK_usuario_id" = $2
            RETURNING id
        `, [viaje.id, viaje.usuarioId, transporteId, viaje.nombre, viaje.fechaInicio, viaje.duracionDias,
            viaje.presupuestoTotal ?? null, viaje.cantidadPersonas, viaje.estado || "borrador"]);
        if (!actualizado.rowCount) {
            await cliente.query("ROLLBACK");
            return null;
        }
        await cliente.query("DELETE FROM smarttrip.itinerario WHERE \"FK_viaje_id\" = $1", [viaje.id]);
        await cliente.query("DELETE FROM smarttrip.viaje_destino WHERE \"FK_viaje_id\" = $1", [viaje.id]);
        await cliente.query("DELETE FROM smarttrip.viaje_pais WHERE \"FK_viaje_id\" = $1", [viaje.id]);
        await persistirPaisesYDestinos(cliente, viaje);
        await guardarPreferenciasViaje(cliente, viaje);
        const guardado = await armarViaje(cliente, viaje.id, viaje.usuarioId);
        await cliente.query("COMMIT");
        return guardado;
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
};

const eliminar = async (id, usuarioId) => {
    const resultado = await pool.query(
        'DELETE FROM smarttrip.viaje WHERE id = $1 AND "FK_usuario_id" = $2', [id, usuarioId]
    );
    return resultado.rowCount > 0;
};

const distanciaKm = (a, b) => {
    if (a.latitud === null || b.latitud === null || a.longitud === null || b.longitud === null) return 0;
    const rad = (valor) => valor * Math.PI / 180;
    const deltaLat = rad(b.latitud - a.latitud);
    const deltaLon = rad(b.longitud - a.longitud);
    const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const guardarItinerarios = async (id, usuarioId, itinerarios) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const viaje = await armarViaje(cliente, id, usuarioId);
        if (!viaje) {
            await cliente.query("ROLLBACK");
            return null;
        }
        const transporteId = await obtenerTransporteId(cliente, viaje.transportePreferido);
        const destinoIds = new Map();
        const destinos = await cliente.query(`
            SELECT d.id, d.nombre, p.nombre AS pais
            FROM smarttrip.viaje_destino vd
            JOIN smarttrip.destino d ON d.id = vd."FK_destino_id"
            JOIN smarttrip.pais p ON p.id = vd."FK_pais_id"
            WHERE vd."FK_viaje_id" = $1
        `, [id]);
        for (const destino of destinos.rows) {
            destinoIds.set(`${catalogo.normalizar(destino.nombre)}|${catalogo.normalizar(destino.pais)}`, destino.id);
        }
        await cliente.query("DELETE FROM smarttrip.itinerario WHERE \"FK_viaje_id\" = $1", [id]);

        const guardadas = [];
        for (let indice = 0; indice < itinerarios.length; indice++) {
            const alternativa = itinerarios[indice];
            const nombre = String(alternativa.titulo || alternativa.tipo || `Alternativa ${indice + 1}`).slice(0, 120);
            const destinosRuta = alternativa.ciudades || [];
            const fila = await cliente.query(`
                INSERT INTO smarttrip.itinerario (
                    "FK_viaje_id", generacion, nombre, puntaje, puntaje_turistico,
                    cambios_alojamiento, seleccionado
                ) VALUES ($1, 1, $2, $3, $4, $5, false) RETURNING id
            `, [id, nombre, alternativa.puntaje ?? null, alternativa.metricas?.puntajeTuristico ?? null,
                Math.max(0, destinosRuta.length - 1)]);
            const itinerarioId = String(fila.rows[0].id);
            const detalle = { ...alternativa, id: itinerarioId };
            await cliente.query("UPDATE smarttrip.itinerario SET detalle_json = $2::jsonb WHERE id = $1", [itinerarioId, JSON.stringify(detalle)]);

            let totalHaversine = 0;
            const distancias = destinosRuta.slice(1).map((destino, i) => {
                const distancia = distanciaKm(destinosRuta[i], destino);
                totalHaversine += distancia;
                return distancia;
            });
            for (let orden = 0; orden < destinosRuta.length; orden++) {
                const destino = destinosRuta[orden];
                const clave = `${catalogo.normalizar(destino.nombre)}|${catalogo.normalizar(destino.pais)}`;
                const destinoId = destinoIds.get(clave);
                if (!destinoId) throw new AppError(500, `No se encontró el destino persistido "${destino.nombre}"`);
                await cliente.query(`
                    INSERT INTO smarttrip.itinerario_destino ("FK_itinerario_id", "FK_destino_id", orden)
                    VALUES ($1, $2, $3)
                `, [itinerarioId, destinoId, orden + 1]);
            }

            const inicio = destinosRuta[0]?.fechaInicio || viaje.fechaInicio;
            const fin = destinosRuta.at(-1)?.fechaFin || viaje.fechaInicio;
            const calendario = await cliente.query(`
                INSERT INTO smarttrip.calendario ("FK_itinerario_id", fecha_inicio, fecha_fin)
                VALUES ($1, $2, $3) RETURNING id
            `, [itinerarioId, inicio, fin]);
            for (let orden = 0; orden < destinosRuta.length; orden++) {
                const destino = destinosRuta[orden];
                const destinoId = destinoIds.get(`${catalogo.normalizar(destino.nombre)}|${catalogo.normalizar(destino.pais)}`);
                await cliente.query(`
                    INSERT INTO smarttrip.estadia (
                        "FK_calendario_id", "FK_destino_id", orden, fecha_inicio, fecha_fin
                    ) VALUES ($1, $2, $3, $4, $5)
                `, [calendario.rows[0].id, destinoId, orden + 1, destino.fechaInicio, destino.fechaFin]);
            }

            const metricas = alternativa.metricas || {};
            const totalTiempoMinutos = Math.max(0, Math.round((metricas.tiempoTrasladosHoras || 0) * 60));
            for (let orden = 0; orden < destinosRuta.length - 1; orden++) {
                const distancia = distancias[orden] || 0;
                const proporcion = totalHaversine ? distancia / totalHaversine : 1 / (destinosRuta.length - 1);
                const origenKey = `${catalogo.normalizar(destinosRuta[orden].nombre)}|${catalogo.normalizar(destinosRuta[orden].pais)}`;
                const finKey = `${catalogo.normalizar(destinosRuta[orden + 1].nombre)}|${catalogo.normalizar(destinosRuta[orden + 1].pais)}`;
                const costoTransporte = Number(alternativa.presupuesto?.categorias?.transporte || 0) / Math.max(1, destinosRuta.length - 1);
                await cliente.query(`
                    INSERT INTO smarttrip.tramo (
                        "FK_itinerario_id", "FK_destino_origen_id", "FK_destino_fin_id",
                        "FK_transporte_id", orden, distancia_km, tiempo_minutos, costo_usd, geometria_geojson
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
                `, [itinerarioId, destinoIds.get(origenKey), destinoIds.get(finKey), transporteId,
                    orden + 1, distancia, Math.round(totalTiempoMinutos * proporcion), costoTransporte]);
            }

            const categorias = alternativa.presupuesto?.categorias || {};
            await cliente.query(`
                INSERT INTO smarttrip.costo (
                    "FK_itinerario_id", transporte_usd, hospedaje_usd, alimentacion_usd, atracciones_usd, total_usd
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [itinerarioId, categorias.transporte || 0, categorias.hospedaje || 0,
                categorias.alimentacion || 0, categorias.actividades || 0,
                alternativa.presupuesto?.totalEstimado ?? null]);
            guardadas.push(detalle);
        }
        await cliente.query('UPDATE smarttrip.viaje SET estado = $2, actualizado_en = now() WHERE id = $1', [id, "alternativas_generadas"]);
        await cliente.query("COMMIT");
        return await armarViaje(pool, id, usuarioId);
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
};

const seleccionarItinerario = async (id, usuarioId, itinerarioId) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const viaje = await cliente.query('SELECT id FROM smarttrip.viaje WHERE id=$1 AND "FK_usuario_id"=$2 FOR UPDATE', [id, usuarioId]);
        if (!viaje.rowCount) {
            await cliente.query("ROLLBACK");
            return null;
        }
        const existente = await cliente.query('SELECT id FROM smarttrip.itinerario WHERE id=$1 AND "FK_viaje_id"=$2', [itinerarioId, id]);
        if (!existente.rowCount) {
            await cliente.query("ROLLBACK");
            return null;
        }
        await cliente.query('UPDATE smarttrip.itinerario SET seleccionado = (id = $2) WHERE "FK_viaje_id" = $1', [id, itinerarioId]);
        await cliente.query('UPDATE smarttrip.viaje SET estado = $2, actualizado_en = now() WHERE id = $1', [id, "itinerario_seleccionado"]);
        await cliente.query("COMMIT");
        return await armarViaje(pool, id, usuarioId);
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
};

module.exports = { crear, listarPorUsuario, buscarPorUsuario, guardar, eliminar, guardarItinerarios, seleccionarItinerario };
