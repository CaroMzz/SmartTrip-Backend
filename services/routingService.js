const config = require("../config");

const obtenerRutaEnAuto = async (ciudades) => {
    if (!config.openRouteServiceApiKey || ciudades.length < 2) return null;
    const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: config.openRouteServiceApiKey,
                "Content-Type": "application/json",
                Accept: "application/geo+json"
            },
            body: JSON.stringify({
                coordinates: ciudades.map((ciudad) => [ciudad.longitud, ciudad.latitud]),
                instructions: false
            }),
            signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) {
            console.warn(`OpenRouteService no disponible (HTTP ${response.status}); se usará una aproximación`);
            return null;
        }
        const datos = await response.json();
        const ruta = datos.features?.[0];
        const resumen = ruta?.properties?.summary;
        const coordenadas = ruta?.geometry?.coordinates;
        if (!resumen || !Array.isArray(coordenadas) || coordenadas.length < 2) return null;
        return {
            fuente: "OpenRouteService",
            distanciaKm: resumen.distance / 1000,
            duracionHoras: resumen.duration / 3600,
            geometria: { type: "LineString", coordinates: coordenadas }
        };
    } catch (error) {
        console.warn("No se pudo consultar OpenRouteService; se usará una aproximación");
        return null;
    }
};

module.exports = { obtenerRutaEnAuto };
