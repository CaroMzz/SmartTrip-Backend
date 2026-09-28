const USER_AGENT = "SmartTripBackend/1.0 (https://github.com/CaroMzz/SmartTrip-Backend)";
const cache = new Map();
const TTL_MS = 60 * 60 * 1000;

const obtenerAtractivos = async (wikiDataId) => {
    if (!/^Q\d+$/.test(wikiDataId || "")) return [];
    const existente = cache.get(wikiDataId);
    if (existente && existente.venceEn > Date.now()) return existente.atractivos;

    const query = `
        SELECT DISTINCT ?atraccion ?atraccionLabel ?coordenadas ?descripcion WHERE {
          ?atraccion (wdt:P31/wdt:P279*) wd:Q570116;
                     wdt:P131 wd:${wikiDataId};
                     wdt:P625 ?coordenadas.
          SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
          OPTIONAL {
            ?atraccion schema:description ?descripcion.
            FILTER(LANG(?descripcion) = "es" || LANG(?descripcion) = "en")
          }
        }
        LIMIT 20
    `;
    let response;
    try {
        response = await fetch("https://query.wikidata.org/sparql", {
            method: "POST",
            headers: {
                Accept: "application/sparql+json",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": USER_AGENT
            },
            body: new URLSearchParams({ query, format: "json" }),
            signal: AbortSignal.timeout(12000)
        });
    } catch (error) {
        return [];
    }
    if (!response.ok) return [];

    let data;
    try {
        data = await response.json();
    } catch (error) {
        return [];
    }
    const atractivos = (data.results?.bindings || []).map((fila) => {
        const punto = /^Point\(([-\d.]+)\s+([-\d.]+)\)$/.exec(fila.coordenadas?.value || "");
        const uri = fila.atraccion?.value || "";
        return {
            idExterno: uri.split("/").pop(),
            nombre: fila.atraccionLabel?.value || "",
            descripcion: fila.descripcion?.value || null,
            longitud: punto ? Number(punto[1]) : null,
            latitud: punto ? Number(punto[2]) : null,
            urlFuente: uri
        };
    }).filter((item) => item.nombre && item.longitud !== null && item.latitud !== null);

    cache.set(wikiDataId, { atractivos, venceEn: Date.now() + TTL_MS });
    return atractivos;
};

module.exports = { obtenerAtractivos };
