const USER_AGENT = "SmartTripBackend/1.0 (https://github.com/CaroMzz/SmartTrip-Backend)";

// Busca el artículo de la ciudad (primero en español, después en inglés) y devuelve
// su introducción y la imagen principal.
const obtenerResumenCiudad = async (nombre, pais) => {
    for (const idioma of ["es", "en"]) {
        const url = new URL(`https://${idioma}.wikipedia.org/w/api.php`);
        for (const [clave, valor] of Object.entries({
            action: "query", generator: "search", gsrsearch: [nombre, pais].filter(Boolean).join(" "),
            gsrlimit: 1, gsrnamespace: 0, prop: "extracts|pageimages|pageprops|info", exintro: 1, explaintext: 1,
            exsentences: 5, piprop: "original", ppprop: "wikibase_item|disambiguation", inprop: "url",
            format: "json", formatversion: 2
        })) url.searchParams.set(clave, String(valor));
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Wikipedia respondió HTTP ${response.status}`);
        const pagina = (await response.json()).query?.pages?.[0];
        if (!pagina?.extract || pagina.pageprops?.disambiguation !== undefined) continue;
        return {
            titulo: pagina.title,
            descripcion: pagina.extract,
            fotografiaUrl: pagina.original?.source || null,
            wikiDataId: pagina.pageprops?.wikibase_item || null,
            urlFuente: pagina.fullurl,
            fuente: `Wikipedia (${idioma})`
        };
    }
    return null;
};

module.exports = { obtenerResumenCiudad };
