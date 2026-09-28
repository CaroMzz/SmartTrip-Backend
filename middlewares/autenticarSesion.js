const usuarioService = require("../services/usuarioService");

const autenticarSesion = async (req, res, next) => {
    const authorization = req.headers.authorization || "";
    const coincidencia = /^Bearer\s+(\S+)$/i.exec(authorization);

    if (!coincidencia) {
        return res.status(401).json({ mensaje: "Se requiere un token Bearer válido" });
    }

    const token = coincidencia[1];
    const usuario = await usuarioService.obtenerUsuarioDeSesion(token);
    if (!usuario) {
        return res.status(401).json({ mensaje: "La sesión no existe o venció" });
    }

    req.usuario = usuario;
    req.tokenSesion = token;
    return next();
};

module.exports = autenticarSesion;
