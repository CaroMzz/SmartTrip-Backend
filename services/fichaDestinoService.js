const wikipediaService = require("./wikipediaService");
const wikidataService = require("./wikidataService");

// Con esta cantidad de museos, monumentos y atracciones (o más) una ciudad obtiene 100 puntos.
const LUGARES_PARA_PUNTAJE_MAXIMO = 150;

// Escala logarítmica: las primeras atracciones suman más que las siguientes, así una ciudad
// chica con 15 lugares no queda en 10 puntos frente a una capital con cientos.
const calcularPuntajeTuristico = (totales) => {
    const lugares = totales.museo + totales.monumento + totales.atraccion;
    return Math.min(100, Math.round(100 * Math.log10(1 + lugares) / Math.log10(1 + LUGARES_PARA_PUNTAJE_MAXIMO)));
};

// Tiempo sugerido para recorrer la ciudad, entre 1 y 5 días según su puntaje turístico.
const calcularDiasSugeridos = (puntaje) => Math.min(5, Math.max(1, Math.round(puntaje / 20)));

// Consulta las APIs externas y arma la ficha de una ciudad. Si una fuente falla, la ficha se
// arma con lo disponible y `avisos` indica qué no se pudo recuperar (RF22).
const construirFicha = async (ciudad) => {
    const avisos = [];
    const [resumen, puntosInteres] = await Promise.all([
        wikipediaService.obtenerResumenCiudad(ciudad.nombre, ciudad.pais).catch(() => {
            avisos.push("No se pudo obtener la descripción de la ciudad desde Wikipedia.");
            return null;
        }),
        wikidataService.obtenerPuntosInteres(ciudad.latitud, ciudad.longitud).catch(() => {
            avisos.push("No se pudieron obtener los puntos de interés desde Wikidata.");
            return null;
        })
    ]);
    if (!resumen && !puntosInteres) return { ficha: null, avisos };

    const puntajeTuristico = puntosInteres ? calcularPuntajeTuristico(puntosInteres.totales) : null;
    return {
        ficha: {
            descripcion: resumen?.descripcion || null,
            fotografiaUrl: resumen?.fotografiaUrl || null,
            urlFuente: resumen?.urlFuente || null,
            puntajeTuristico,
            diasSugeridos: puntajeTuristico === null ? null : calcularDiasSugeridos(puntajeTuristico),
            proveedor: [resumen?.fuente, puntosInteres && "Wikidata"].filter(Boolean).join(" / "),
            totales: puntosInteres?.totales || null,
            puntos: puntosInteres?.puntos || []
        },
        avisos
    };
};

module.exports = { construirFicha, calcularPuntajeTuristico, calcularDiasSugeridos };
