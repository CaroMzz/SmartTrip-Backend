/*logica de cuentas : registra usuarios, compara contraseñas , inocia sesion
y verifica correos y actualiza*/

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
        usuario = await repository.crearUsuario({
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
    await repository.guardarVerificacion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionTokenVerificacionMs,
        usadoEn: null
    });
    return { usuario, token };
};

const iniciarSesion = async (correo, contrasena) => {
    const usuario = await repository.buscarPorCorreo(correo.trim().toLowerCase());
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
    await repository.guardarSesion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionSesionMs
    });
    return { token, usuario: perfilPublico(usuario) };
};

const obtenerUsuarioDeSesion = async (token) => {
    const hash = hashToken(token);
    const sesion = await repository.buscarSesion(hash);
    if (!sesion || sesion.venceEn <= Date.now()) {
        if (sesion) await repository.eliminarSesion(hash);
        return null;
    }
    const usuario = await repository.buscarPorId(sesion.usuarioId);
    if (!usuario || !usuario.correo_verificado_en) return null;
    return perfilPublico(usuario);
};

const confirmarCorreo = async (token) => {
    const confirmado = await repository.confirmarVerificacion(hashToken(token));
    if (!confirmado) {
        const error = new Error("El token no es válido, ya fue usado o venció");
        error.codigo = "TOKEN_INVALIDO";
        throw error;
    }
    return confirmado;
};

const reenviarVerificacion = async (correo) => {
    const usuario = await repository.buscarPorCorreo(correo.trim().toLowerCase());
    if (!usuario || usuario.correo_verificado_en) return null;
    await repository.revocarVerificacionesUsuario(usuario.id);
    const token = randomBytes(32).toString("hex");
    await repository.guardarVerificacion(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionTokenVerificacionMs,
        usadoEn: null
    });
    return { usuario, token };
};

// El cambio de correo exige la contraseña actual y cierra las demás sesiones, igual que el cambio
// de contraseña. La sesión en uso sigue activa para que un error de tipeo se pueda corregir.
const actualizarPerfil = async (usuarioId, cambios, tokenSesion) => {
    const usuario = await repository.buscarPorId(usuarioId);
    if (!usuario || !usuario.correo_verificado_en) {
        const error = new Error("No se encontró el usuario");
        error.codigo = "USUARIO_NO_ENCONTRADO";
        throw error;
    }
    const cambiaCorreo = cambios.correo !== undefined && cambios.correo !== usuario.correo;
    if (cambiaCorreo) {
        if (!(await bcrypt.compare(cambios.contrasenaActual || "", usuario.contrasena_hash))) {
            const error = new Error("La contraseña actual es incorrecta");
            error.codigo = "CONTRASENA_ACTUAL_INCORRECTA";
            throw error;
        }
        usuario.correo = cambios.correo;
    }
    if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
    usuario.preferencias = {
        ...usuario.preferencias,
        ...(cambios.transportePreferido !== undefined
            ? { transportePreferido: cambios.transportePreferido } : {}),
        ...(cambios.prioridades !== undefined ? { prioridades: cambios.prioridades } : {})
    };
    if (cambios.transportePreferido !== undefined) usuario.transporte_preferido = cambios.transportePreferido;
    await repository.guardarUsuario(usuario);
    if (cambiaCorreo && tokenSesion) await repository.revocarSesionesUsuario(usuarioId, hashToken(tokenSesion));
    return perfilPublico(usuario);
};

const cambiarContrasena = async (usuarioId, actual, nueva, tokenSesion) => {
    const usuario = await repository.buscarPorId(usuarioId);
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
    await repository.guardarUsuario(usuario);
    await repository.revocarSesionesUsuario(usuarioId, hashToken(tokenSesion));
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
