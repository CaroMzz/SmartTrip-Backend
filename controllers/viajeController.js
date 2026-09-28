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

const listar = async (req, res) => res.json({ viajes: await viajeService.listar(req.usuario.id) });

const obtener = async (req, res) => res.json({ viaje: await viajeService.obtener(req.usuario.id, req.params.id) });

const crear = async (req, res) => {
    const viaje = await viajeService.crear(req.usuario.id, validarCuerpo(req));
    return res.status(201).json({ mensaje: "Viaje creado", viaje });
};

const actualizar = async (req, res) => {
    const viaje = await viajeService.actualizar(req.usuario.id, req.params.id, validarCuerpo(req));
    return res.json({ mensaje: "Viaje actualizado", viaje });
};

const configurar = async (req, res) => {
    const viaje = await viajeService.configurar(req.usuario.id, req.params.id, validarCuerpo(req));
    return res.json({ mensaje: "Preferencias guardadas", viaje });
};

const borrar = async (req, res) => {
    await viajeService.borrar(req.usuario.id, req.params.id);
    return res.status(204).end();
};

const listarItinerarios = async (req, res) =>
    res.json({ itinerarios: await itinerarioService.listar(req.usuario.id, req.params.id) });

const generarItinerarios = async (req, res) => {
    const itinerarios = await itinerarioService.generar(req.usuario.id, req.params.id);
    return res.status(201).json({ mensaje: "Alternativas generadas", itinerarios });
};

const seleccionarItinerario = async (req, res) => {
    const datos = validarCuerpo(req);
    const itinerario = await itinerarioService.seleccionar(req.usuario.id, req.params.id, datos.itinerarioId);
    return res.json({ mensaje: "Itinerario seleccionado", itinerario });
};

const obtenerItinerarioSeleccionado = async (req, res) => {
    const itinerario = await itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
    return res.json({ itinerario, geometria: itinerario.geometria });
};

const obtenerCalendario = async (req, res) => {
    const itinerario = await itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
    return res.json({ calendario: itinerario.calendario, ciudades: itinerario.ciudades });
};

const obtenerPresupuesto = async (req, res) => {
    const itinerario = await itinerarioService.obtenerSeleccionado(req.usuario.id, req.params.id);
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
