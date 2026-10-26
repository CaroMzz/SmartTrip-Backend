const pool = require("../src/database/pool");
const catalogo = require("../services/catalogoDestinos");
const AppError = require("../services/appError");

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

// Guarda la ficha de una ciudad del catálogo (RF16) y reemplaza sus puntos de interés.
const guardarFicha = async (ciudad, ficha) => {
    const cliente = await pool.connect();
    // Si Supabase corta la conexión a mitad de la transacción, la consulta en curso falla y el
    // error se maneja abajo; sin este listener, el evento "error" terminaría el proceso.
    let conexionPerdida = null;
    const alPerderConexion = (error) => { conexionPerdida = error; };
    cliente.on("error", alPerderConexion);
    try {
        await cliente.query("BEGIN");
        const pais = await obtenerPaisId(cliente, ciudad.pais);
        const destinoId = await obtenerDestinoId(cliente, ciudad, pais);
        await cliente.query(`
            UPDATE smarttrip.destino SET
                descripcion = $2, fotografia_url = $3, dias_sugeridos = $4, puntaje_turistico = $5,
                proveedor = $6, actualizado_fuente_en = now()
            WHERE id = $1
        `, [destinoId, ficha.descripcion, ficha.fotografiaUrl, ficha.diasSugeridos, ficha.puntajeTuristico, ficha.proveedor]);
        await cliente.query('DELETE FROM smarttrip.punto_interes WHERE "FK_destino_id" = $1', [destinoId]);
        for (const punto of ficha.puntos) {
            await cliente.query(`
                INSERT INTO smarttrip.punto_interes (
                    "FK_destino_id", nombre, tipo, descripcion, fotografia_url, proveedor,
                    identificador_externo, actualizado_fuente_en
                ) VALUES ($1, $2, $3, $4, $5, 'Wikidata', $6, now())
            `, [destinoId, punto.nombre.slice(0, 200), punto.tipo, punto.descripcion, punto.fotografiaUrl, punto.idExterno]);
        }
        await cliente.query("COMMIT");
        return destinoId;
    } catch (error) {
        if (!conexionPerdida) await cliente.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        cliente.off("error", alPerderConexion);
        // Con una conexión cortada, release(true) la descarta en vez de devolverla al pool.
        cliente.release(Boolean(conexionPerdida));
    }
};

// Devuelve la ficha guardada por el batch, o null si la ciudad todavía no se procesó.
const obtenerFicha = async (nombre, codigoPais) => {
    const destino = await pool.query(`
        SELECT d.id, d.descripcion, d.fotografia_url, d.dias_sugeridos, d.puntaje_turistico,
               d.proveedor, d.actualizado_fuente_en
        FROM smarttrip.destino d
        JOIN smarttrip.pais p ON p.id = d."FK_pais_id"
        WHERE p.codigo_iso = $1 AND lower(d.nombre) = lower($2) AND d.puntaje_turistico IS NOT NULL
        LIMIT 1
    `, [codigoPais, nombre]);
    const fila = destino.rows[0];
    if (!fila) return null;
    const puntos = await pool.query(`
        SELECT nombre, tipo, descripcion, fotografia_url, identificador_externo
        FROM smarttrip.punto_interes WHERE "FK_destino_id" = $1 ORDER BY id
    `, [fila.id]);
    return {
        descripcion: fila.descripcion,
        fotografiaUrl: fila.fotografia_url,
        diasSugeridos: fila.dias_sugeridos,
        puntajeTuristico: fila.puntaje_turistico,
        proveedor: fila.proveedor,
        actualizadoEn: fila.actualizado_fuente_en,
        puntos: puntos.rows.map((punto) => ({
            idExterno: punto.identificador_externo,
            tipo: punto.tipo,
            nombre: punto.nombre,
            descripcion: punto.descripcion,
            fotografiaUrl: punto.fotografia_url,
            urlFuente: punto.identificador_externo ? `https://www.wikidata.org/wiki/${punto.identificador_externo}` : null
        }))
    };
};

// Registro de cada corrida del batch en smarttrip.ejecucion_batch (estados: iniciado, completado, fallido).
const iniciarEjecucion = async () => {
    const resultado = await pool.query("INSERT INTO smarttrip.ejecucion_batch (estado) VALUES ('iniciado') RETURNING id");
    return resultado.rows[0].id;
};

const finalizarEjecucion = (id, estado, registrosActualizados, errorResumen) => pool.query(`
    UPDATE smarttrip.ejecucion_batch
    SET fin_en = now(), estado = $2, registros_actualizados = $3, error_resumen = $4
    WHERE id = $1
`, [id, estado, registrosActualizados, errorResumen]);

module.exports = { obtenerPaisId, obtenerDestinoId, guardarFicha, obtenerFicha, iniciarEjecucion, finalizarEjecucion };
