const pool = require("../src/database/pool");

const prioridadesDesdeFila = (fila) => ({
    ahorro: Number(fila?.minimizar_costo ?? 60),
    atractivos: Number(fila?.maximizar_turismo ?? 40)
});

const mapearUsuario = (fila) => fila ? ({
    id: String(fila.id),
    nombre: fila.nombre,
    correo: fila.correo,
    contrasena_hash: fila.contrasena_hash,
    correo_verificado_en: fila.correo_verificado_en,
    transporte_preferido: fila.transporte_preferido || null,
    preferencias: {
        transportePreferido: fila.transporte_preferido || null,
        prioridades: prioridadesDesdeFila(fila)
    }
}) : null;

const consultarUsuario = async (columna, valor) => {
    const resultado = await pool.query(`
        SELECT u.*, p.minimizar_costo, p.maximizar_turismo
        FROM smarttrip.usuario u
        LEFT JOIN smarttrip.preferencia p
          ON p."FK_usuario_id" = u.id AND p."FK_viaje_id" IS NULL
        WHERE u.${columna} = $1
        LIMIT 1
    `, [valor]);
    return mapearUsuario(resultado.rows[0]);
};

const crearUsuario = async (datos) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const insertado = await cliente.query(`
            INSERT INTO smarttrip.usuario (nombre, correo, contrasena_hash, correo_verificado_en)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [datos.nombre, datos.correo, datos.contrasena_hash, datos.correo_verificado_en]);
        const usuario = insertado.rows[0];
        const preferencias = datos.preferencias?.prioridades || { ahorro: 60, atractivos: 40 };
        await cliente.query(`
            INSERT INTO smarttrip.preferencia (
                "FK_usuario_id", minimizar_costo, maximizar_turismo
            ) VALUES ($1, $2, $3)
        `, [usuario.id, preferencias.ahorro, preferencias.atractivos]);
        await cliente.query("COMMIT");
        return mapearUsuario({ ...usuario, minimizar_costo: preferencias.ahorro, maximizar_turismo: preferencias.atractivos });
    } catch (error) {
        await cliente.query("ROLLBACK");
        if (error.code === "23505") {
            const duplicado = new Error("Ya existe una cuenta con ese correo");
            duplicado.codigo = "CORREO_DUPLICADO";
            throw duplicado;
        }
        throw error;
    } finally {
        cliente.release();
    }
};

const buscarPorCorreo = (correo) => consultarUsuario("correo", correo);
const buscarPorId = (id) => consultarUsuario("id", id);

const guardarUsuario = async (usuario) => {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const actualizado = await cliente.query(`
            UPDATE smarttrip.usuario
            SET nombre = $2,
                contrasena_hash = $3,
                correo_verificado_en = $4,
                transporte_preferido = $5,
                actualizado_en = now()
            WHERE id = $1
            RETURNING *
        `, [usuario.id, usuario.nombre, usuario.contrasena_hash, usuario.correo_verificado_en, usuario.transporte_preferido || null]);
        if (!actualizado.rowCount) {
            await cliente.query("ROLLBACK");
            return null;
        }
        const prioridades = usuario.preferencias?.prioridades || { ahorro: 60, atractivos: 40 };
        const preferenciaActualizada = await cliente.query(`
            UPDATE smarttrip.preferencia
            SET minimizar_costo = $2,
                maximizar_turismo = $3,
                reducir_distancia = 0,
                minimizar_cambios_alojamiento = 0,
                priorizar_tren = 0,
                priorizar_rutas_panoramicas = 0
            WHERE "FK_usuario_id" = $1 AND "FK_viaje_id" IS NULL
        `, [usuario.id, prioridades.ahorro, prioridades.atractivos]);
        if (!preferenciaActualizada.rowCount) {
            await cliente.query(`
                INSERT INTO smarttrip.preferencia ("FK_usuario_id", minimizar_costo, maximizar_turismo)
                VALUES ($1, $2, $3)
            `, [usuario.id, prioridades.ahorro, prioridades.atractivos]);
        }
        await cliente.query("COMMIT");
        return mapearUsuario({ ...actualizado.rows[0], minimizar_costo: prioridades.ahorro, maximizar_turismo: prioridades.atractivos });
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
};

const guardarVerificacion = async (hash, registro) => {
    const resultado = await pool.query(`
        INSERT INTO smarttrip.verificacion_correo ("FK_usuario_id", token_hash, vence_en, usado_en)
        VALUES ($1, $2, to_timestamp($3 / 1000.0), CASE WHEN $4 IS NULL THEN NULL ELSE to_timestamp($4 / 1000.0) END)
        ON CONFLICT (token_hash) DO UPDATE
        SET "FK_usuario_id" = EXCLUDED."FK_usuario_id", vence_en = EXCLUDED.vence_en, usado_en = EXCLUDED.usado_en
        RETURNING id
    `, [registro.usuarioId, hash, registro.venceEn, registro.usadoEn]);
    return resultado.rowCount > 0;
};

const buscarVerificacion = async (hash) => {
    const resultado = await pool.query(`
        SELECT "FK_usuario_id" AS usuario_id,
               extract(epoch FROM vence_en) * 1000 AS vence_ms,
               extract(epoch FROM usado_en) * 1000 AS usado_ms
        FROM smarttrip.verificacion_correo
        WHERE token_hash = $1
    `, [hash]);
    const fila = resultado.rows[0];
    return fila ? {
        usuarioId: String(fila.usuario_id),
        venceEn: Number(fila.vence_ms),
        usadoEn: fila.usado_ms === null ? null : Number(fila.usado_ms)
    } : null;
};

const revocarVerificacionesUsuario = async (usuarioId) => {
    await pool.query(`
        UPDATE smarttrip.verificacion_correo
        SET usado_en = now()
        WHERE "FK_usuario_id" = $1 AND usado_en IS NULL
    `, [usuarioId]);
};

const guardarSesion = async (hash, sesion) => {
    await pool.query(`
        INSERT INTO smarttrip.sesion ("FK_usuario_id", token_hash, vence_en)
        VALUES ($1, $2, to_timestamp($3 / 1000.0))
        ON CONFLICT (token_hash) DO UPDATE
        SET "FK_usuario_id" = EXCLUDED."FK_usuario_id", vence_en = EXCLUDED.vence_en
    `, [sesion.usuarioId, hash, sesion.venceEn]);
};

const buscarSesion = async (hash) => {
    const resultado = await pool.query(`
        SELECT "FK_usuario_id" AS usuario_id, extract(epoch FROM vence_en) * 1000 AS vence_ms
        FROM smarttrip.sesion
        WHERE token_hash = $1 AND vence_en > now()
    `, [hash]);
    const fila = resultado.rows[0];
    return fila ? { usuarioId: String(fila.usuario_id), venceEn: Number(fila.vence_ms) } : null;
};

const eliminarSesion = async (hash) => {
    const resultado = await pool.query("DELETE FROM smarttrip.sesion WHERE token_hash = $1", [hash]);
    return resultado.rowCount > 0;
};

const revocarSesionesUsuario = async (usuarioId, conservarHash = null) => {
    await pool.query(`
        DELETE FROM smarttrip.sesion
        WHERE "FK_usuario_id" = $1 AND ($2::char(64) IS NULL OR token_hash <> $2)
    `, [usuarioId, conservarHash]);
};

module.exports = {
    crearUsuario,
    buscarPorCorreo,
    buscarPorId,
    guardarUsuario,
    guardarVerificacion,
    buscarVerificacion,
    revocarVerificacionesUsuario,
    guardarSesion,
    buscarSesion,
    eliminarSesion,
    revocarSesionesUsuario
};
