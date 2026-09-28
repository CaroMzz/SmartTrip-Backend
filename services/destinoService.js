const AppError = require("./appError");
const config = require("../config");
const wikidataService = require("./wikidataService");
const catalogoDestinos = require("./catalogoDestinos");

const GEO_DB_URL = "https://wft-geo-db.p.rapidapi.com/v1/geo";
const PHOTON_URL = "https://photon.komoot.io/api/";
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ITEMS = 300;
const GEO_DB_HOST = "wft-geo-db.p.rapidapi.com";
const WIKIPEDIA_AGENT = "SmartTripBackend/1.0 (https://github.com/CaroMzz/SmartTrip-Backend)";

const leerCache = (clave) => {
    const entrada = cache.get(clave);
    if (!entrada || entrada.venceEn <= Date.now()) {
        cache.delete(clave);
        return null;
    }
    return entrada.valor;
};

const guardarCache = (clave, valor) => {
    if (cache.size >= CACHE_MAX_ITEMS) cache.delete(cache.keys().next().value);
    cache.set(clave, { valor, venceEn: Date.now() + CACHE_TTL_MS });
};

const solicitarPhoton = async (parametros) => {
    const url = new URL(PHOTON_URL);
    for (const [clave, valor] of Object.entries(parametros)) {
        if (Array.isArray(valor)) valor.forEach((item) => url.searchParams.append(clave, String(item)));
        else if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor));
    }
    let respuesta;
    try {
        respuesta = await fetch(url, {
            headers: { Accept: "application/geo+json, application/json", "User-Agent": WIKIPEDIA_AGENT },
            signal: AbortSignal.timeout(8000)
        });
    } catch {
        throw new AppError(502, "No se pudo conectar con la búsqueda de lugares");
    }
    if (respuesta.status === 429) throw new AppError(503, "La búsqueda de lugares alcanzó su límite temporal. Esperá un momento y probá de nuevo.");
    if (!respuesta.ok) throw new AppError(502, "El servicio de búsqueda de lugares devolvió un error");
    try {
        return await respuesta.json();
    } catch {
        throw new AppError(502, "El servicio de búsqueda de lugares devolvió una respuesta no válida");
    }
};

const convertirCiudadPhoton = (feature) => {
    const propiedades = feature.properties || {};
    const [longitud, latitud] = feature.geometry?.coordinates || [];
    const idExterno = `osm-${propiedades.osm_type || "N"}-${propiedades.osm_id}`;
    const wikiDataId = propiedades.extra?.wikidata || null;
    return {
        idExterno,
        wikiDataId: typeof wikiDataId === "string" && /^Q\d+$/.test(wikiDataId) ? wikiDataId : null,
        nombre: propiedades.name,
        pais: propiedades.country || null,
        codigoPais: propiedades.countrycode?.toUpperCase() || null,
        region: propiedades.state || propiedades.county || null,
        latitud: Number.isFinite(latitud) ? latitud : null,
        longitud: Number.isFinite(longitud) ? longitud : null,
        poblacion: null,
        fuente: "Photon / OpenStreetMap"
    };
};

const solicitarGeoDb = async (ruta, parametros) => {
    if (!config.geoDbRapidApiKey) {
        throw new AppError(503, "La búsqueda de destinos necesita configurar GEODB_RAPIDAPI_KEY");
    }
    const url = new URL(`${GEO_DB_URL}/${ruta}`);
    for (const [clave, valor] of Object.entries(parametros)) {
        if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor));
    }
    let respuesta;
    try {
        respuesta = await fetch(url, {
            headers: {
                Accept: "application/json",
                "X-RapidAPI-Key": config.geoDbRapidApiKey,
                "X-RapidAPI-Host": GEO_DB_HOST
            },
            signal: AbortSignal.timeout(8000)
        });
    } catch (error) {
        throw new AppError(502, "No se pudo conectar con el servicio de destinos");
    }
    if (respuesta.status === 429) throw new AppError(503, "Se alcanzó el límite temporal de búsqueda de destinos");
    if (respuesta.status === 401 || respuesta.status === 403) {
        throw new AppError(503, "La clave de GeoDB no es válida o no tiene acceso al servicio");
    }
    if (!respuesta.ok) throw new AppError(502, "El servicio de destinos devolvió un error");
    try {
        return await respuesta.json();
    } catch (error) {
        throw new AppError(502, "El servicio de destinos devolvió una respuesta no válida");
    }
};

const buscarGeoDb = async (prefijo, paises = []) => {
    const consulta = prefijo.trim();
    const clave = `buscar:${consulta.toLocaleLowerCase("es")}:${paises.join(",")}`;
    const cacheado = leerCache(clave);
    if (cacheado) return cacheado;

    const datos = await solicitarGeoDb("cities", {
        namePrefix: consulta,
        countryIds: paises.join(","),
        sort: "-population",
        limit: 10,
        languageCode: "es"
    });
    const resultados = (datos.data || []).map((ciudad) => ({
        idExterno: String(ciudad.id),
        wikiDataId: ciudad.wikiDataId || null,
        nombre: ciudad.name,
        pais: ciudad.country,
        codigoPais: ciudad.countryCode,
        region: ciudad.region || null,
        latitud: ciudad.latitude ?? null,
        longitud: ciudad.longitude ?? null,
        poblacion: ciudad.population ?? null,
        fuente: "GeoDB Cities"
    }));
    guardarCache(clave, resultados);
    return resultados;
};

const listarPaisesGeoDb = async (prefijo) => {
    const consulta = prefijo.trim();
    const clave = `paises:${consulta.toLocaleLowerCase("es")}`;
    const cacheado = leerCache(clave);
    if (cacheado) return cacheado;
    const datos = await solicitarGeoDb("countries", {
        namePrefix: consulta,
        sort: "name",
        limit: 15,
        languageCode: "es"
    });
    const resultados = (datos.data || []).map((pais) => ({
        nombre: pais.name,
        codigo: pais.code,
        codigosMoneda: pais.currencyCodes || []
    }));
    guardarCache(clave, resultados);
    return resultados;
};

const buscar = async (prefijo, paises = []) => {
    return catalogoDestinos.buscarCiudades(prefijo, paises).slice(0, 20);
};

const listarPaises = async (prefijo) => {
    return catalogoDestinos.listarPaises(prefijo);
};

const buscarAtractivosWiki = async (nombre, pais) => {
    const url = new URL("https://es.wikipedia.org/w/api.php");
    const busqueda = [nombre, pais, "atractivos turísticos"].filter(Boolean).join(" ");
    for (const [clave, valor] of Object.entries({
        action: "query",
        generator: "search",
        gsrsearch: busqueda,
        gsrnamespace: 0,
        gsrlimit: 5,
        prop: "extracts|info",
        exintro: 1,
        explaintext: 1,
        inprop: "url",
        format: "json",
        formatversion: 2
    })) url.searchParams.set(clave, String(valor));

    let respuesta;
    try {
        respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": WIKIPEDIA_AGENT },
            signal: AbortSignal.timeout(8000)
        });
    } catch (error) {
        return { estado: "no_disponible", atractivos: [] };
    }
    if (!respuesta.ok) return { estado: "no_disponible", atractivos: [] };

    let datos;
    try {
        datos = await respuesta.json();
    } catch (error) {
        return { estado: "no_disponible", atractivos: [] };
    }
    const paginas = datos.query?.pages || [];
    const atractivos = paginas
        .filter((pagina) => pagina.extract)
        .map((pagina) => ({
            nombre: pagina.title,
            descripcion: pagina.extract.slice(0, 1200),
            urlFuente: pagina.fullurl
        }));
    return { estado: atractivos.length ? "disponible" : "sin_resultados", fuente: "Wikipedia", atractivos };
};

const buscarFotosUnsplash = async (nombre, pais) => {
    if (!config.unsplashAccessKey) return [];
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", [nombre, pais].filter(Boolean).join(" "));
    url.searchParams.set("per_page", "5");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");
    let respuesta;
    try {
        respuesta = await fetch(url, {
            headers: { Authorization: `Client-ID ${config.unsplashAccessKey}`, Accept: "application/json" },
            signal: AbortSignal.timeout(8000)
        });
    } catch (error) {
        return [];
    }
    if (!respuesta.ok) return [];
    let datos;
    try {
        datos = await respuesta.json();
    } catch (error) {
        return [];
    }
    const conOrigen = (valor) => {
        if (!valor) return null;
        const destino = new URL(valor);
        destino.searchParams.set("utm_source", "SmartTrip");
        destino.searchParams.set("utm_medium", "referral");
        return destino.toString();
    };
    return (datos.results || []).map((foto) => ({
        idExterno: foto.id,
        url: foto.urls?.regular,
        textoAlternativo: foto.alt_description || foto.description || `Fotografía de ${nombre}`,
        fotografo: foto.user?.name || "Fotógrafo de Unsplash",
        urlFotografo: conOrigen(foto.user?.links?.html),
        urlPublicacion: conOrigen(foto.links?.html),
        atribucion: `Foto de ${foto.user?.name || "un fotógrafo de Unsplash"} en Unsplash`,
        fuente: "Unsplash"
    })).filter((foto) => foto.url && foto.urlFotografo && foto.urlPublicacion);
};

const obtener = async (id, nombre, pais) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new AppError(400, "El identificador del destino no es válido");
    const clave = `detalle:${id}:${nombre}:${pais || ""}`;
    const cacheado = leerCache(clave);
    if (cacheado) return cacheado;

    const ciudadLocal = catalogoDestinos.obtenerCiudad(id);
    if (ciudadLocal) {
        const resultadoLocal = {
            ...ciudadLocal,
            wikiDataId: null,
            poblacion: null,
            descripcion: null,
            atractivos: [],
            fotos: [],
            puntajeTuristico: null,
            fuenteGeografica: ciudadLocal.fuente,
            fuenteContenido: null
        };
        guardarCache(clave, resultadoLocal);
        return resultadoLocal;
    }

    const esPhoton = id.startsWith("osm-");
    let ciudad;
    if (esPhoton) {
        let lugar = leerCache(`lugar:${id}`);
        if (!lugar) {
            const coincidencia = /^osm-([NRW])-(\d+)$/.exec(id);
            if (!coincidencia) throw new AppError(400, "El identificador del destino no es válido");
            const busqueda = await solicitarPhoton({ q: [nombre, pais].filter(Boolean).join(" "), layer: "city", limit: 10 });
            const feature = (busqueda.features || []).find((item) => String(item.properties?.osm_type) === coincidencia[1]
                && String(item.properties?.osm_id) === coincidencia[2]);
            lugar = feature ? convertirCiudadPhoton(feature) : null;
        }
        ciudad = lugar ? {
            id: lugar.idExterno, wikiDataId: lugar.wikiDataId, name: lugar.nombre,
            country: lugar.pais, countryCode: lugar.codigoPais, region: lugar.region,
            latitude: lugar.latitud, longitude: lugar.longitud, population: lugar.poblacion
        } : null;
    } else {
        const detalle = await solicitarGeoDb(`cities/${encodeURIComponent(id)}`, { languageCode: "es" });
        ciudad = detalle.data;
    }
    if (!ciudad) throw new AppError(404, "No se encontró el destino");
    const nombreCiudad = ciudad.name || nombre;
    const paisCiudad = ciudad.country || pais || null;
    const wikidataId = ciudad.wikiDataId || null;
    const fuenteGeografica = esPhoton ? "Photon / OpenStreetMap" : "GeoDB Cities";
    const [wiki, atractivosWikidata, fotos] = await Promise.all([
        buscarAtractivosWiki(nombreCiudad, paisCiudad),
        wikidataService.obtenerAtractivos(wikidataId),
        buscarFotosUnsplash(nombreCiudad, paisCiudad)
    ]);
    const atractivos = atractivosWikidata.length ? atractivosWikidata : wiki.atractivos;
    const resultado = {
        idExterno: String(ciudad.id),
        wikiDataId: wikidataId,
        nombre: nombreCiudad,
        pais: paisCiudad,
        codigoPais: ciudad.countryCode || null,
        region: ciudad.region || null,
        latitud: ciudad.latitude ?? null,
        longitud: ciudad.longitude ?? null,
        poblacion: ciudad.population ?? null,
        descripcion: wiki.atractivos[0]?.descripcion || atractivos[0]?.descripcion || null,
        atractivos,
        fotos,
        puntajeTuristico: atractivosWikidata.length ? Math.min(100, atractivosWikidata.length * 10) : null,
        fuenteGeografica,
        fuenteContenido: wiki.fuente || null
    };
    guardarCache(clave, resultado);
    return resultado;
};

module.exports = { buscar, listarPaises, obtener };
