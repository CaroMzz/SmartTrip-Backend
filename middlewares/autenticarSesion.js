const usuarioService = require("../services/usuarioService");

const autenticarSesion = (req, res, next) => {
    const authorization = req.headers.authorization || "";
    const [esquema, token] = authorization.split(" ");

    if (esquema !== "Bearer" || !token) {
        return res.status(401).json({ mensaje: "Se requiere un token Bearer válido" });
    }

    const usuario = usuarioService.obtenerUsuarioDeSesion(token);
    if (!usuario) {
        return res.status(401).json({ mensaje: "La sesión no existe o venció" });
    }

    req.usuario = usuario;
    return next();
};

module.exports = autenticarSesion;
