const destinoService = require("../services/destinoService");
const AppError = require("../services/appError");

const buscar = async (req, res) => {
    const consulta = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (consulta.length < 2 || consulta.length > 100) {
        throw new AppError(400, "La búsqueda debe tener entre 2 y 100 caracteres");
    }
    const paises = typeof req.query.paises === "string"
        ? req.query.paises.split(",").map((pais) => pais.trim().toUpperCase()).filter(Boolean)
        : [];
    if (paises.length > 10 || paises.some((pais) => !/^[A-Z]{2}$/.test(pais))) {
        throw new AppError(400, "Los países deben ser códigos ISO de dos letras, separados por coma");
    }
    const resultados = await destinoService.buscar(consulta, paises);
    return res.json({ resultados, fuente: "Catálogo local SmartTrip" });
};

const listarPaises = async (req, res) => {
    const consulta = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (consulta.length < 2 || consulta.length > 100) {
        throw new AppError(400, "La búsqueda de países debe tener entre 2 y 100 caracteres");
    }
    const resultados = await destinoService.listarPaises(consulta);
    return res.json({ resultados, fuente: "Catálogo local SmartTrip" });
};

const obtener = async (req, res) => {
    const nombre = typeof req.query.nombre === "string" ? req.query.nombre.trim() : "";
    const pais = typeof req.query.pais === "string" ? req.query.pais.trim() : null;
    const destino = await destinoService.obtener(req.params.id, nombre, pais);
    return res.json({ destino });
};

module.exports = { buscar, listarPaises, obtener };
