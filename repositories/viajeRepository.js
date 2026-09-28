// Adaptador temporal. La interfaz se mantiene al reemplazarlo por PostgreSQL.
const viajes = new Map();
let siguienteId = 1;

const copiar = (valor) => JSON.parse(JSON.stringify(valor));

const crear = (viaje) => {
    const guardado = { ...viaje, id: String(siguienteId++) };
    viajes.set(guardado.id, guardado);
    return copiar(guardado);
};

const listarPorUsuario = (usuarioId) =>
    [...viajes.values()]
        .filter((viaje) => String(viaje.usuarioId) === String(usuarioId))
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
        .map(copiar);

const buscarPorUsuario = (id, usuarioId) => {
    const viaje = viajes.get(String(id));
    if (!viaje || String(viaje.usuarioId) !== String(usuarioId)) return null;
    return copiar(viaje);
};

const guardar = (viaje) => {
    viajes.set(String(viaje.id), copiar(viaje));
    return copiar(viaje);
};

const eliminar = (id, usuarioId) => {
    const viaje = viajes.get(String(id));
    if (!viaje || String(viaje.usuarioId) !== String(usuarioId)) return false;
    return viajes.delete(String(id));
};

const guardarItinerarios = (id, usuarioId, itinerarios) => {
    const viaje = viajes.get(String(id));
    if (!viaje || String(viaje.usuarioId) !== String(usuarioId)) return null;
    const actualizado = {
        ...viaje,
        itinerarios: copiar(itinerarios),
        itinerarioSeleccionadoId: null,
        estado: "alternativas_generadas",
        actualizadoEn: new Date().toISOString()
    };
    viajes.set(String(id), actualizado);
    return copiar(actualizado);
};

const seleccionarItinerario = (id, usuarioId, itinerarioId) => {
    const viaje = viajes.get(String(id));
    if (!viaje || String(viaje.usuarioId) !== String(usuarioId)) return null;
    if (!viaje.itinerarios.some((item) => item.id === itinerarioId)) return null;
    const actualizado = {
        ...viaje,
        itinerarioSeleccionadoId: itinerarioId,
        estado: "itinerario_seleccionado",
        actualizadoEn: new Date().toISOString()
    };
    viajes.set(String(id), actualizado);
    return copiar(actualizado);
};

module.exports = {
    crear,
    listarPorUsuario,
    buscarPorUsuario,
    guardar,
    eliminar,
    guardarItinerarios,
    seleccionarItinerario
};
