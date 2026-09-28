// Adaptador temporal; se sustituye por PostgreSQL sin cambiar las reglas del servicio.
const usuariosPorId = new Map();
const idPorCorreo = new Map();
const verificaciones = new Map();
const sesiones = new Map();
let siguienteId = 1;

const crearUsuario = (datos) => {
    if (idPorCorreo.has(datos.correo)) {
        const error = new Error("Ya existe una cuenta con ese correo");
        error.codigo = "CORREO_DUPLICADO";
        throw error;
    }
    const usuario = { ...datos, id: siguienteId++ };
    usuariosPorId.set(usuario.id, usuario);
    idPorCorreo.set(usuario.correo, usuario.id);
    return usuario;
};

const buscarPorCorreo = (correo) => {
    const id = idPorCorreo.get(correo);
    return id === undefined ? null : usuariosPorId.get(id) || null;
};

const buscarPorId = (id) => usuariosPorId.get(Number(id)) || null;
const guardarUsuario = (usuario) => usuariosPorId.set(usuario.id, usuario);
const guardarVerificacion = (hash, registro) => verificaciones.set(hash, registro);
const buscarVerificacion = (hash) => verificaciones.get(hash) || null;
const revocarVerificacionesUsuario = (usuarioId) => {
    for (const [hash, registro] of verificaciones) {
        if (registro.usuarioId === usuarioId && !registro.usadoEn) verificaciones.delete(hash);
    }
};
const guardarSesion = (hash, sesion) => sesiones.set(hash, sesion);
const buscarSesion = (hash) => sesiones.get(hash) || null;
const eliminarSesion = (hash) => sesiones.delete(hash);
const revocarSesionesUsuario = (usuarioId, conservarHash = null) => {
    for (const [hash, sesion] of sesiones) {
        if (sesion.usuarioId === usuarioId && hash !== conservarHash) sesiones.delete(hash);
    }
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
