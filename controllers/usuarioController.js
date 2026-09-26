const usuarioService = require("../services/usuarioService");
const config = require("../config");

const cuerpoJson = (req, res) => {
    const datos = req.body;
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        res.status(400).json({ mensaje: "El cuerpo debe ser un objeto JSON" });
        return null;
    }
    return datos;
};

const registrarUsuario = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;

    const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
    const correo = typeof datos.email === "string" ? datos.email.trim().toLowerCase() : "";
    const contrasena = typeof datos["contraseña"] === "string" ? datos["contraseña"] : "";
    const errores = {};

    if (!nombre || nombre.length > 150) {
        errores.nombre = "El nombre es obligatorio y debe tener hasta 150 caracteres";
    }
    if (!correo || correo.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        errores.email = "Ingresá un email válido de hasta 320 caracteres";
    }

    const cantidadCaracteres = [...contrasena].length;
    const cantidadBytes = Buffer.byteLength(contrasena, "utf8");
    if (cantidadCaracteres < 15) {
        errores.contraseña = "Usá al menos 15 caracteres; podés incluir espacios y símbolos";
    } else if (cantidadBytes > 72) {
        errores.contraseña = "La contraseña no puede superar 72 bytes en UTF-8 por el límite de bcrypt";
    }

    if (Object.keys(errores).length) {
        return res.status(400).json({ mensaje: "Hay errores en los datos enviados", errores });
    }

    try {
        const { usuario, token } = await usuarioService.registrarUsuario(nombre, correo, contrasena);

        // Permite probar el flujo local sin exponer el token en respuestas HTTP.
        if (config.imprimirTokensVerificacion) {
            console.info(`[DESARROLLO] Token de confirmación para ${usuario.correo}: ${token}`);
        }

        return res.status(201).json({
            mensaje: "Registro creado. En desarrollo, habilitá PRINT_VERIFICATION_TOKENS para probar la confirmación.",
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.correo }
        });
    } catch (error) {
        if (error.codigo === "CORREO_DUPLICADO") {
            return res.status(409).json({ mensaje: error.message });
        }
        console.error("Error al registrar usuario:", error);
        return res.status(500).json({ mensaje: "No se pudo completar el registro" });
    }
};

const iniciarSesion = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;

    const correo = typeof datos.email === "string" ? datos.email.trim().toLowerCase() : "";
    const contrasena = typeof datos["contraseña"] === "string" ? datos["contraseña"] : "";
    if (!correo || !contrasena) {
        return res.status(400).json({ mensaje: "Email y contraseña son obligatorios" });
    }

    try {
        const resultado = await usuarioService.iniciarSesion(correo, contrasena);
        return res.status(200).json({
            mensaje: "Sesión iniciada",
            token: resultado.token,
            tipo: "Bearer",
            usuario: resultado.usuario
        });
    } catch (error) {
        if (error.codigo === "CREDENCIALES_INVALIDAS") {
            return res.status(401).json({ mensaje: error.message });
        }
        if (error.codigo === "CORREO_NO_VERIFICADO") {
            return res.status(403).json({ mensaje: error.message });
        }
        console.error("Error al iniciar sesión:", error);
        return res.status(500).json({ mensaje: "No se pudo iniciar sesión" });
    }
};

const confirmarCorreo = (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;

    const token = typeof datos.token === "string" ? datos.token : "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ mensaje: "El token de confirmación no tiene un formato válido" });
    }

    try {
        const usuario = usuarioService.confirmarCorreo(token);
        return res.status(200).json({
            mensaje: "Correo confirmado correctamente",
            usuario
        });
    } catch (error) {
        if (error.codigo === "TOKEN_INVALIDO") {
            return res.status(400).json({ mensaje: error.message });
        }
        console.error("Error al confirmar correo:", error);
        return res.status(500).json({ mensaje: "No se pudo confirmar el correo" });
    }
};

const obtenerPerfil = (req, res) => {
    return res.status(200).json({ usuario: req.usuario });
};

module.exports = { registrarUsuario, iniciarSesion, confirmarCorreo, obtenerPerfil };
