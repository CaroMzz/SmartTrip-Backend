// Medios de transporte admitidos (RF08). Para agregar uno nuevo alcanza con sumar una entrada acá y
// su fila activa en smarttrip.transporte: las validaciones, Swagger, el cálculo de itinerarios y
// GET /opciones leen este módulo.
const config = require("../config");

const tasas = config.costosReferenciales;

const TRANSPORTES = Object.freeze({
    tren: {
        etiqueta: "Tren",
        // Relación entre la distancia real y la línea recta, velocidad media (km/h) y demora fija por traslado.
        factor: 1.1,
        velocidad: 110,
        horasPorTraslado: 0.35,
        excursiones: true,
        costo: (distanciaKm, personas) => distanciaKm * personas * tasas.trenPorPersonaKmUsd
    },
    avion: {
        etiqueta: "Avión",
        factor: 1.05,
        velocidad: 700,
        horasPorTraslado: 2.5,
        // Las excursiones de día no aplican a vuelos.
        excursiones: false,
        costo: (distanciaKm, personas) => distanciaKm * personas * tasas.avionPorPersonaKmUsd
    },
    auto: {
        etiqueta: "Auto",
        factor: 1.25,
        velocidad: 75,
        horasPorTraslado: 0.2,
        excursiones: true,
        costo: (distanciaKm) => distanciaKm * tasas.autoPorKmUsd
    }
});

const TIPOS = Object.freeze(Object.keys(TRANSPORTES));

const esValido = (tipo) => TIPOS.includes(tipo);

const MENSAJE_INVALIDO = `El transporte debe ser ${TIPOS.slice(0, -1).join(", ")} o ${TIPOS.at(-1)}`;

const opciones = () => TIPOS.map((tipo) => ({ tipo, etiqueta: TRANSPORTES[tipo].etiqueta }));

module.exports = { TRANSPORTES, TIPOS, esValido, MENSAJE_INVALIDO, opciones };
