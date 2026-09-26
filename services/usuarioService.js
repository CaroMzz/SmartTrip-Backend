const bcrypt = require("bcryptjs");
const { createHash, randomBytes } = require("node:crypto");
const config = require("../config");

// Adaptador temporal en memoria. Se reemplazará por consultas a PostgreSQL.
const usuarios = new Map();
const verificaciones = new Map();
const sesiones = new Map();
let siguienteId = 1;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const registrarUsuario = async (nombre, correo, contrasena) => {
    const correoNormalizado = correo.trim().toLowerCase();

    if ([...usuarios.values()].some((usuario) => usuario.correo === correoNormalizado)) {
        const error = new Error("Ya existe una cuenta con ese correo");
        error.codigo = "CORREO_DUPLICADO";
        throw error;
    }

    const contrasenaHash = await bcrypt.hash(contrasena, config.rondasBcrypt);
    // La verificación posterior al hash evita duplicados en solicitudes simultáneas.
    if ([...usuarios.values()].some((usuario) => usuario.correo === correoNormalizado)) {
        const error = new Error("Ya existe una cuenta con ese correo");
        error.codigo = "CORREO_DUPLICADO";
        throw error;
    }
    const usuario = {
        id: siguienteId++,
        nombre: nombre.trim(),
        correo: correoNormalizado,
        contrasena_hash: contrasenaHash,
        correo_verificado_en: null
    };

    usuarios.set(usuario.id, usuario);

    const token = randomBytes(32).toString("hex");
    verificaciones.set(hashToken(token), {
        usuarioId: usuario.id,
        venceEn: Date.now() + config.duracionTokenVerificacionMs,
        usadoEn: null
    });

    return { usuario, token };
};

const iniciarSesion = async (correo, contrasena) => {
    const correoNormalizado = correo.trim().toLowerCase();
    const usuario = [...usuarios.values()].find((item) => item.correo === correoNormalizado);

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

    // Token opaco temporal. En producción se debe persistir una sesión o usar JWT.
    const tokenSesion = randomBytes(32).toString("hex");
    sesiones.set(tokenSesion, { usuarioId: usuario.id, venceEn: Date.now() + config.duracionSesionMs });

    return {
        token: tokenSesion,
        usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo }
    };
};

const obtenerUsuarioDeSesion = (token) => {
    const sesion = sesiones.get(token);
    if (!sesion || sesion.venceEn <= Date.now()) {
        sesiones.delete(token);
        return null;
    }

    const usuario = usuarios.get(sesion.usuarioId);
    if (!usuario || !usuario.correo_verificado_en) return null;

    return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
};

const confirmarCorreo = (token) => {
    const registro = verificaciones.get(hashToken(token));

    if (!registro || registro.usadoEn || registro.venceEn <= Date.now()) {
        const error = new Error("El token no es válido, ya fue usado o venció");
        error.codigo = "TOKEN_INVALIDO";
        throw error;
    }

    const usuario = usuarios.get(registro.usuarioId);
    if (!usuario) {
        const error = new Error("No se encontró el usuario asociado al token");
        error.codigo = "TOKEN_INVALIDO";
        throw error;
    }

    registro.usadoEn = Date.now();
    usuario.correo_verificado_en = new Date().toISOString();

    return { id: usuario.id, correo: usuario.correo };
};

module.exports = {
    registrarUsuario,
    iniciarSesion,
    confirmarCorreo,
    obtenerUsuarioDeSesion
};
