const viajeService = require("../services/viajeService");
const itinerarioService = require("../services/itinerarioService");

const validarCuerpo = (req) => {
    const datos = req.body;
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        const error = new Error("El cuerpo debe ser un objeto JSON");
        error.status = 400;
        throw error;
    }
    return datos;
};

const listar = (req, res) => res.json({ viajes: viajeService.listar(req.usuario.id) });

const obtener = (req, res) => res.json({ viaje: viajeService.obtener(req.usuario.id, req.params.id) });

const crear = (req, res) => {
    const viaje = viajeService.crear(req.usuario.id, validarCuerpo(req));
    return res.status(201).json({ mensaje: "Viaje creado", viaje });
};

const actualizar = (req, res) => {
    const viaje = viajeService.actualizar(req.usuario.id, req.params.id, validarCuerpo(req));
    return res.json({ mensaje: "Viaje actualizado", viaje });
};

const configurar = (req, res) => {
    const viaje = viajeService.configurar(req.usuario.id, req.params.id, validarCuerpo(req));
    return res.json({ mensaje: "Preferencias guardadas", viaje });
};

const borrar = (req, res) => {
    viajeService.borrar(req.usuario.id, req.params.id);
    return res.status(204).end();
};

const listarItinerarios = (req, res) =>
    res.json({ itinerarios: itinerarioService.listar(req.usuario.id, req.params.id) });

const generarItinerarios = async (req, res) => {
    const itinerarios = await itinerarioService.generar(req.usuario.id, req.params.id);
    return res.status(201).json({ mensaje: "Alternativas generadas", itinerarios });
};

const seleccionarItinerario = (req, res) => {
    const datos = validarCuerpo(req);
    const itinerario = itinerarioService.seleccionar(req.usuario.id, req.params.id, datos.itinerarioId);
    return res.json({ mensaje: "Itinerario seleccionado", itinerario });
};

const obtenerItinerarioSeleccionado = (req, res) => {
    const itinerario = itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
    return res.json({ itinerario, geometria: itinerario.geometria });
};

const obtenerCalendario = (req, res) => {
    const itinerario = itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
    return res.json({ calendario: itinerario.calendario, ciudades: itinerario.ciudades });
};

const obtenerPresupuesto = (req, res) => {
    const itinerario = itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
    return res.json({ presupuesto: itinerario.presupuesto, esEstimacion: itinerario.esEstimacion, notas: itinerario.notas });
};

module.exports = {
    listar,
    obtener,
    crear,
    actualizar,
    configurar,
    borrar,
    listarItinerarios,
    generarItinerarios,
    seleccionarItinerario,
    obtenerItinerarioSeleccionado,
    obtenerCalendario,
    obtenerPresupuesto
};
