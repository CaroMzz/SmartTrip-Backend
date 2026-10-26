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

// Clases de Wikidata (P31 directo) agrupadas en los tipos de smarttrip.punto_interes.
// Se consulta solo el tipo directo, sin subclases, para que ciudades grandes respondan en segundos.
const CLASES_PUNTO_INTERES = {
    museo: ["Q33506", "Q207694", "Q16735822", "Q1007870"],
    // Sin "estatua" (Q179700): incluye obras dentro de museos, como la Venus de Milo.
    monumento: ["Q4989906", "Q5003624", "Q575759"],
    parque: ["Q22698", "Q22746", "Q167346", "Q46169"],
    restaurante: ["Q11707"],
    atraccion: ["Q570116", "Q23413", "Q16560", "Q2977", "Q163687", "Q174782", "Q839954", "Q43501", "Q12518", "Q40080"]
};
const PUNTOS_POR_TIPO = 8;

const consultarSparql = async (query, timeoutMs) => {
    const response = await fetch("https://query.wikidata.org/sparql?format=json", {
        method: "POST",
        headers: {
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": USER_AGENT
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const texto = await response.text();
    if (!response.ok || texto.startsWith("<")) throw new Error(`Wikidata respondió HTTP ${response.status}`);
    return JSON.parse(texto).results?.bindings || [];
};

// Etiquetas, descripciones y fotos (P18) en lotes de 50, con la API de entidades.
const obtenerEntidades = async (ids) => {
    const entidades = {};
    for (let i = 0; i < ids.length; i += 50) {
        const url = new URL("https://www.wikidata.org/w/api.php");
        for (const [clave, valor] of Object.entries({
            action: "wbgetentities", ids: ids.slice(i, i + 50).join("|"), props: "labels|descriptions|claims",
            languages: "es|en", format: "json"
        })) url.searchParams.set(clave, valor);
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Wikidata respondió HTTP ${response.status}`);
        Object.assign(entidades, (await response.json()).entities);
    }
    return entidades;
};

const urlImagenCommons = (archivo) => archivo
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(archivo)}?width=800`
    : null;

// Devuelve cuántos puntos de interés hay de cada tipo alrededor de unas coordenadas y los más
// relevantes de cada tipo (ordenados por cantidad de artículos de Wikipedia que los describen).
const obtenerPuntosInteres = async (latitud, longitud, radioKm = 6) => {
    const valores = Object.entries(CLASES_PUNTO_INTERES)
        .flatMap(([tipo, clases]) => clases.map((clase) => `(wd:${clase} "${tipo}")`)).join(" ");
    const filas = await consultarSparql(`
        SELECT ?item ?tipo ?links ?loc WHERE {
          SERVICE wikibase:around {
            ?item wdt:P625 ?loc.
            bd:serviceParam wikibase:center "Point(${Number(longitud)} ${Number(latitud)})"^^geo:wktLiteral;
                            wikibase:radius "${Number(radioKm)}".
          }
          VALUES (?clase ?tipo) { ${valores} }
          ?item wdt:P31 ?clase; wikibase:sitelinks ?links.
        }
    `, 45000);

    const porItem = new Map();
    for (const fila of filas) {
        const id = fila.item.value.split("/").pop();
        if (!porItem.has(id)) {
            const punto = /^Point\(([-\d.]+)\s+([-\d.]+)\)$/.exec(fila.loc?.value || "");
            porItem.set(id, {
                id, tipo: fila.tipo.value, relevancia: Number(fila.links.value),
                longitud: punto ? Number(punto[1]) : null, latitud: punto ? Number(punto[2]) : null
            });
        }
    }
    const totales = Object.fromEntries(Object.keys(CLASES_PUNTO_INTERES).map((tipo) => [tipo, 0]));
    const destacados = [];
    for (const tipo of Object.keys(CLASES_PUNTO_INTERES)) {
        const delTipo = [...porItem.values()].filter((item) => item.tipo === tipo);
        totales[tipo] = delTipo.length;
        destacados.push(...delTipo.sort((a, b) => b.relevancia - a.relevancia).slice(0, PUNTOS_POR_TIPO));
    }

    const entidades = await obtenerEntidades(destacados.map((item) => item.id));
    const texto = (mapa) => mapa?.es?.value || mapa?.en?.value || null;
    const puntos = destacados.map((item) => {
        const entidad = entidades[item.id] || {};
        return {
            idExterno: item.id,
            tipo: item.tipo,
            nombre: texto(entidad.labels),
            descripcion: texto(entidad.descriptions),
            fotografiaUrl: urlImagenCommons(entidad.claims?.P18?.[0]?.mainsnak?.datavalue?.value),
            latitud: item.latitud,
            longitud: item.longitud,
            urlFuente: `https://www.wikidata.org/wiki/${item.id}`
        };
    }).filter((punto) => punto.nombre && !/^Q\d+$/.test(punto.nombre));
    return { totales, puntos };
};

module.exports = { obtenerAtractivos, obtenerPuntosInteres };
