const usuarioService = require("../services/usuarioService");
const emailService = require("../services/emailService");
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

        let correoEnviado = false;
        try {
            correoEnviado = await emailService.enviarVerificacion({ correo: usuario.correo, nombre: usuario.nombre, token });
        } catch (errorEnvio) {
            console.error("No se pudo enviar el correo de verificación");
        }

        // Permite probar el flujo local sin exponer tokens en producción.
        if (process.env.NODE_ENV !== "production" && config.imprimirTokensVerificacion) {
            console.info(`[DESARROLLO] Token de confirmación para ${usuario.correo}: ${token}`);
        }

        const respuesta = {
            mensaje: correoEnviado
                ? "Registro creado. Revisá tu correo para confirmar la cuenta."
                : "Registro creado. El envío de correo todavía no está configurado; podrás reenviar la confirmación cuando esté disponible.",
            correoEnviado,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.correo }
        };
        if (process.env.NODE_ENV !== "production" && config.devolverTokenVerificacion) respuesta.tokenVerificacion = token;

        return res.status(201).json(respuesta);
    } catch (error) {
        if (error.codigo === "CORREO_DUPLICADO") {
            return res.status(409).json({ mensaje: error.message });
        }
        console.error("Error al registrar usuario:", error);
        return res.status(500).json({ mensaje: "No se pudo completar el registro" });
    }
};

const reenviarVerificacion = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;
    const correo = typeof datos.email === "string" ? datos.email.trim().toLowerCase() : "";
    if (!correo || correo.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return res.status(400).json({ mensaje: "Ingresá un email válido" });
    }

    const cuenta = emailService.estaConfigurado() ? await usuarioService.reenviarVerificacion(correo) : null;
    if (cuenta) {
        try {
            await emailService.enviarVerificacion({ correo: cuenta.usuario.correo, nombre: cuenta.usuario.nombre, token: cuenta.token });
            if (process.env.NODE_ENV !== "production" && config.imprimirTokensVerificacion) {
                console.info(`[DESARROLLO] Token de confirmación para ${cuenta.usuario.correo}: ${cuenta.token}`);
            }
        } catch (errorEnvio) {
            console.error("No se pudo reenviar el correo de verificación");
        }
    }
    return res.status(200).json({ mensaje: "Si existe una cuenta pendiente para ese email, enviaremos un nuevo enlace." });
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

const confirmarCorreo = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;

    const token = typeof datos.token === "string" ? datos.token : "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ mensaje: "El token de confirmación no tiene un formato válido" });
    }

    try {
        const usuario = await usuarioService.confirmarCorreo(token);
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

const actualizarPerfil = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;
    const permitidos = ["nombre", "transportePreferido", "prioridades"];
    const desconocidos = Object.keys(datos).filter((campo) => !permitidos.includes(campo));
    if (desconocidos.length) {
        return res.status(400).json({ mensaje: "El perfil contiene campos no permitidos", errores: desconocidos });
    }

    const cambios = {};
    if (Object.hasOwn(datos, "nombre")) {
        if (typeof datos.nombre !== "string" || !datos.nombre.trim() || datos.nombre.trim().length > 150) {
            return res.status(400).json({ mensaje: "El nombre debe tener entre 1 y 150 caracteres" });
        }
        cambios.nombre = datos.nombre.trim();
    }
    if (Object.hasOwn(datos, "transportePreferido")) {
        if (!["tren", "avion", "auto"].includes(datos.transportePreferido)) {
            return res.status(400).json({ mensaje: "El transporte debe ser tren, avion o auto" });
        }
        cambios.transportePreferido = datos.transportePreferido;
    }
    if (Object.hasOwn(datos, "prioridades")) {
        const { ahorro, atractivos } = datos.prioridades || {};
        if (!Number.isInteger(ahorro) || !Number.isInteger(atractivos)
            || ahorro < 0 || ahorro > 100 || atractivos < 0 || atractivos > 100
            || ahorro + atractivos !== 100) {
            return res.status(400).json({ mensaje: "Las prioridades de ahorro y atractivos deben sumar 100" });
        }
        cambios.prioridades = { ahorro, atractivos };
    }
    if (!Object.keys(cambios).length) {
        return res.status(400).json({ mensaje: "Indicá al menos un campo para actualizar" });
    }

    const usuario = await usuarioService.actualizarPerfil(req.usuario.id, cambios);
    return res.json({ mensaje: "Perfil actualizado", usuario });
};

const cerrarSesion = async (req, res) => {
    await usuarioService.cerrarSesion(req.tokenSesion);
    return res.status(204).end();
};

const cambiarContrasena = async (req, res) => {
    const datos = cuerpoJson(req, res);
    if (!datos) return;
    const permitidos = ["contrasenaActual", "nuevaContrasena"];
    if (Object.keys(datos).some((campo) => !permitidos.includes(campo))) {
        return res.status(400).json({ mensaje: "El cuerpo contiene campos no permitidos" });
    }
    const actual = typeof datos.contrasenaActual === "string" ? datos.contrasenaActual : "";
    const nueva = typeof datos.nuevaContrasena === "string" ? datos.nuevaContrasena : "";
    if (!actual) return res.status(400).json({ mensaje: "Ingresá tu contraseña actual" });
    const caracteres = [...nueva].length;
    if (caracteres < 15 || Buffer.byteLength(nueva, "utf8") > 72) {
        return res.status(400).json({ mensaje: "La nueva contraseña debe tener al menos 15 caracteres y no superar 72 bytes en UTF-8" });
    }
    try {
        await usuarioService.cambiarContrasena(req.usuario.id, actual, nueva, req.tokenSesion);
        return res.status(200).json({ mensaje: "Contraseña actualizada" });
    } catch (error) {
        if (error.codigo === "CONTRASENA_ACTUAL_INCORRECTA") return res.status(401).json({ mensaje: error.message });
        if (error.codigo === "USUARIO_NO_ENCONTRADO") return res.status(404).json({ mensaje: error.message });
        console.error("Error al cambiar la contraseña:", error.message);
        return res.status(500).json({ mensaje: "No se pudo actualizar la contraseña" });
    }
};

module.exports = {
    registrarUsuario,
    reenviarVerificacion,
    iniciarSesion,
    confirmarCorreo,
    obtenerPerfil,
    actualizarPerfil,
    cambiarContrasena,
    cerrarSesion
};
