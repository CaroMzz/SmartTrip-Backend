const bcrypt = require("bcryptjs");
const { createHash, randomBytes } = require("node:crypto");
const config = require("../config");
const repository = require("../repositories/usuarioRepository");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const perfilPublico = (usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    preferencias: usuario.preferencias
});

const registrarUsuario = async (nombre, correo, contrasena) => {
    const correoNormalizado = correo.trim().toLowerCase();
    const contrasenaHash = await bcrypt.hash(contrasena, config.rondasBcrypt);
    let usuario;
    try {
        usuario = repository.crearUsuario({
            nombre: nombre.trim(),
            correo: correoNormalizado,
            contrasena_hash: contrasenaHash,
            correo_verificado_en: null,
            preferencias: { transportePreferido: null, prioridades: { ahorro: 60, atractivos: 40 } }
        });
    } catch (error) {
        if (error.codigo === "CORREO_DUPLICADO") throw error;
        throw error;
    }

    const token = randomBytes(32).toString("hex");
    repository.guardarVerificacion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionTokenVerificacionMs,
        usadoEn: null
    });
    return { usuario, token };
};

const iniciarSesion = async (correo, contrasena) => {
    const usuario = repository.buscarPorCorreo(correo.trim().toLowerCase());
    if (!usuario || !(await bcrypt.compare(contrasena, usuario.contrasena_hash))) {
        const error = new Error("Correo o contraseña incorrectos");
        error.codigo = "CREDENCIALES_INVALIDAS";
        throw error;
    }
    if (!usuario.correo_verificado_en) {
        const error = new Error("Confirmá tu correo antes de iniciar sesión");
        error.codigo = "CORREO_NO_VERIFICADO";
        throw error;
    }

    const token = randomBytes(32).toString("hex");
    repository.guardarSesion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionSesionMs
    });
    return { token, usuario: perfilPublico(usuario) };
};

const obtenerUsuarioDeSesion = (token) => {
    const hash = hashToken(token);
    const sesion = repository.buscarSesion(hash);
    if (!sesion || sesion.venceEn <= Date.now()) {
        if (sesion) repository.eliminarSesion(hash);
        return null;
    }
    const usuario = repository.buscarPorId(sesion.usuarioId);
    if (!usuario || !usuario.correo_verificado_en) return null;
    return perfilPublico(usuario);
};

const confirmarCorreo = (token) => {
    const hash = hashToken(token);
    const registro = repository.buscarVerificacion(hash);
    if (!registro || registro.usadoEn || registro.venceEn <= Date.now()) {
        const error = new Error("El token no es válido, ya fue usado o venció");
        error.codigo = "TOKEN_INVALIDO";
        throw error;
    }
    const usuario = repository.buscarPorId(registro.usuarioId);
    if (!usuario) {
        const error = new Error("No se encontró el usuario asociado al token");
        error.codigo = "TOKEN_INVALIDO";
        throw error;
    }
    registro.usadoEn = Date.now();
    usuario.correo_verificado_en = new Date().toISOString();
    repository.guardarUsuario(usuario);
    repository.guardarVerificacion(hash, registro);
    return { id: usuario.id, correo: usuario.correo };
};

const reenviarVerificacion = (correo) => {
    const usuario = repository.buscarPorCorreo(correo.trim().toLowerCase());
    if (!usuario || usuario.correo_verificado_en) return null;
    repository.revocarVerificacionesUsuario(usuario.id);
    const token = randomBytes(32).toString("hex");
    repository.guardarVerificacion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionTokenVerificacionMs,
        usadoEn: null
    });
    return { usuario, token };
};

const actualizarPerfil = (usuarioId, cambios) => {
    const usuario = repository.buscarPorId(usuarioId);
    if (!usuario || !usuario.correo_verificado_en) {
        const error = new Error("No se encontró el usuario");
        error.codigo = "USUARIO_NO_ENCONTRADO";
        throw error;
    }
    if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
    usuario.preferencias = {
        ...usuario.preferencias,
        ...(cambios.transportePreferido !== undefined
            ? { transportePreferido: cambios.transportePreferido } : {}),
        ...(cambios.prioridades !== undefined ? { prioridades: cambios.prioridades } : {})
    };
    repository.guardarUsuario(usuario);
    return perfilPublico(usuario);
};

const cambiarContrasena = async (usuarioId, actual, nueva, tokenSesion) => {
    const usuario = repository.buscarPorId(usuarioId);
    if (!usuario || !usuario.correo_verificado_en) {
        const error = new Error("No se encontró el usuario");
        error.codigo = "USUARIO_NO_ENCONTRADO";
        throw error;
    }
    if (!(await bcrypt.compare(actual, usuario.contrasena_hash))) {
        const error = new Error("La contraseña actual es incorrecta");
        error.codigo = "CONTRASENA_ACTUAL_INCORRECTA";
        throw error;
    }
    usuario.contrasena_hash = await bcrypt.hash(nueva, config.rondasBcrypt);
    repository.guardarUsuario(usuario);
    repository.revocarSesionesUsuario(usuarioId, hashToken(tokenSesion));
};

const cerrarSesion = (token) => repository.eliminarSesion(hashToken(token));

module.exports = {
    registrarUsuario,
    iniciarSesion,
    confirmarCorreo,
    reenviarVerificacion,
    obtenerUsuarioDeSesion,
    actualizarPerfil,
    cambiarContrasena,
    cerrarSesion
};
