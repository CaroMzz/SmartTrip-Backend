const AppError = require("./appError");
const config = require("../config");
const wikidataService = require("./wikidataService");
const catalogoDestinos = require("./catalogoDestinos");
const fichaDestinoService = require("./fichaDestinoService");
const destinoRepository = require("../repositories/destinoRepository");

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

// Solo se aceptan lugares con nombre, coordenadas y país del catálogo (el viaje se arma con esos países).
const lugarDesdePhoton = (feature) => {
    const ciudad = convertirCiudadPhoton(feature);
    const pais = ciudad.codigoPais ? catalogoDestinos.obtenerPais(ciudad.codigoPais) : null;
    if (!pais || !ciudad.nombre || ciudad.latitud === null || ciudad.longitud === null) return null;
    return { ...ciudad, pais: pais.nombre, codigoPais: pais.codigo };
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

// Con menos de estos resultados en el catálogo, la búsqueda se completa con OpenStreetMap (Photon).
const MIN_RESULTADOS_CATALOGO = 5;

// Ciudades de Photon dentro de los países del catálogo. Cada una queda en caché para validarla
// al guardar el viaje y para armar su ficha sin repetir la consulta.
const buscarPhoton = async (consulta, paises = []) => {
    const clave = `photon:${catalogoDestinos.normalizar(consulta)}:${paises.join(",")}`;
    const cacheado = leerCache(clave);
    if (cacheado) return cacheado;
    const datos = await solicitarPhoton({ q: consulta, layer: "city", limit: 15 });
    const resultados = [];
    for (const feature of datos.features || []) {
        const lugar = lugarDesdePhoton(feature);
        if (!lugar || (paises.length && !paises.includes(lugar.codigoPais))) continue;
        if (resultados.some((item) => item.idExterno === lugar.idExterno)) continue;
        guardarCache(`lugar:${lugar.idExterno}`, lugar);
        resultados.push(lugar);
    }
    guardarCache(clave, resultados);
    return resultados;
};

const buscar = async (prefijo, paises = []) => {
    const locales = catalogoDestinos.buscarCiudades(prefijo, paises).slice(0, 20);
    if (locales.length >= MIN_RESULTADOS_CATALOGO || prefijo.trim().length < 3) return locales;
    let externas;
    try {
        externas = await buscarPhoton(prefijo, paises);
    } catch {
        // Sin Photon la búsqueda sigue funcionando con el catálogo.
        return locales;
    }
    const clave = (ciudad) => `${catalogoDestinos.normalizar(ciudad.nombre)}|${ciudad.codigoPais}`;
    const vistas = new Set(locales.map(clave));
    return [...locales, ...externas.filter((ciudad) => !vistas.has(clave(ciudad)))].slice(0, 20);
};

// Ciudad indicada solo por nombre (por ejemplo desde Swagger o Postman) que no está en el catálogo:
// se acepta si Photon tiene una ciudad con ese nombre en ese país y, si llegan coordenadas, a menos de
// 50 km de ellas. Así «Valencia» con sus coordenadas pasa y «Xyzabc» no (RF09).
const verificarCiudadPorNombre = async (ciudad) => {
    const pais = ciudad.pais ? catalogoDestinos.obtenerPais(ciudad.pais) : null;
    if (ciudad.pais && !pais) return null;
    const datos = await solicitarPhoton({ q: [ciudad.nombre, ciudad.pais].filter(Boolean).join(" "), layer: "city", limit: 10 });
    const nombre = catalogoDestinos.normalizar(ciudad.nombre);
    const conCoordenadas = Number.isFinite(ciudad.latitud) && Number.isFinite(ciudad.longitud);
    for (const feature of datos.features || []) {
        const lugar = lugarDesdePhoton(feature);
        if (!lugar || catalogoDestinos.normalizar(lugar.nombre) !== nombre) continue;
        if (pais && lugar.codigoPais !== pais.codigo) continue;
        if (conCoordenadas && distanciaKm({ lat: ciudad.latitud, lon: ciudad.longitud }, { lat: lugar.latitud, lon: lugar.longitud }) > 50) continue;
        guardarCache(`lugar:${lugar.idExterno}`, lugar);
        return lugar;
    }
    return null;
};

// Confirma que una ciudad de OpenStreetMap existe antes de guardarla en un viaje (RF09).
// Devuelve los datos de Photon (nombre, país del catálogo y coordenadas) o null si no la encuentra.
const verificarCiudadExterna = async (ciudad) => {
    const cacheado = leerCache(`lugar:${ciudad.idExterno}`);
    if (cacheado) return cacheado;
    const coincidencia = /^osm-([NRW])-(d+)$/.exec(ciudad.idExterno || "");
    if (!coincidencia) return null;
    const busqueda = await solicitarPhoton({ q: [ciudad.nombre, ciudad.pais].filter(Boolean).join(" "), layer: "city", limit: 10 });
    const feature = (busqueda.features || []).find((item) => String(item.properties?.osm_type) === coincidencia[1]
        && String(item.properties?.osm_id) === coincidencia[2]);
    const lugar = feature ? lugarDesdePhoton(feature) : null;
    if (lugar) guardarCache(`lugar:${lugar.idExterno}`, lugar);
    return lugar;
};

const listarPaises = async (prefijo) => {
    return catalogoDestinos.listarPaises(prefijo);
};

const consultarWikipedia = async (parametros) => {
    const url = new URL("https://es.wikipedia.org/w/api.php");
    for (const [clave, valor] of Object.entries({ ...parametros, format: "json", formatversion: 2 })) {
        url.searchParams.set(clave, String(valor));
    }
    try {
        const respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": WIKIPEDIA_AGENT },
            signal: AbortSignal.timeout(8000)
        });
        return respuesta.ok ? await respuesta.json() : null;
    } catch {
        return null;
    }
};

const distanciaKm = (a, b) => {
    const rad = (grados) => grados * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Divisiones administrativas que aparecen cerca de la ciudad pero no son atractivos.
const ES_DIVISION = /^(partido|departamento|provincia|municipio|comuna|distrito|condado|regi[oó]n|cant[oó]n) de /i;

// Contenido de Wikipedia para un destino externo (RF16). La descripción sale del artículo cuyo título es
// la ciudad (siguiendo redirecciones) y los atractivos de artículos geolocalizados a menos de 10 km.
// Una búsqueda de texto libre devolvía artículos no relacionados (por ejemplo «Ferrocarril en Argentina»).
const buscarAtractivosWiki = async (nombre, pais, latitud = null, longitud = null) => {
    const comun = { action: "query", prop: "extracts|info|coordinates", exintro: 1, explaintext: 1, inprop: "url", redirects: 1 };
    const conCoordenadas = Number.isFinite(latitud) && Number.isFinite(longitud);
    const [articulo, cercanos] = await Promise.all([
        consultarWikipedia({ ...comun, titles: nombre }),
        conCoordenadas
            ? consultarWikipedia({ ...comun, generator: "geosearch", ggscoord: `${latitud}|${longitud}`, ggsradius: 10000, ggslimit: 15 })
            : null
    ]);
    if (!articulo && !cercanos) return { estado: "no_disponible", atractivos: [] };

    const cerca = (pagina, maximoKm) => !conCoordenadas || !pagina.coordinates?.length
        || distanciaKm({ lat: latitud, lon: longitud }, pagina.coordinates[0]) <= maximoKm;
    const ciudad = (articulo?.query?.pages || []).find((pagina) => !pagina.missing && pagina.extract
        && !/puede referirse a/i.test(pagina.extract) && cerca(pagina, 50));
    const atractivos = (cercanos?.query?.pages || [])
        .filter((pagina) => pagina.extract && pagina.pageid !== ciudad?.pageid
            && catalogoDestinos.normalizar(pagina.title) !== catalogoDestinos.normalizar(nombre)
            && !ES_DIVISION.test(pagina.title))
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .slice(0, 5)
        .map((pagina) => ({
            nombre: pagina.title,
            descripcion: pagina.extract.slice(0, 1200),
            urlFuente: pagina.fullurl
        }));
    return {
        estado: ciudad || atractivos.length ? "disponible" : "sin_resultados",
        fuente: "Wikipedia",
        descripcion: ciudad ? ciudad.extract.slice(0, 1200) : null,
        atractivos
    };
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

const TIPOS_FICHA = { atraccion: "atracciones", museo: "museos", monumento: "monumentos", parque: "parques", restaurante: "restaurantes" };

// Ficha de una ciudad del catálogo (RF16): se lee de la base (cargada por el batch) y, si la
// ciudad todavía no se procesó, se consulta en el momento a Wikipedia y Wikidata.
const obtenerFichaCatalogo = async (ciudad) => {
    const guardada = await destinoRepository.obtenerFicha(ciudad.nombre, ciudad.codigoPais);
    const { ficha, avisos } = guardada
        ? { ficha: guardada, avisos: [] }
        : await fichaDestinoService.construirFicha(ciudad);
    const puntos = ficha?.puntos || [];
    const puntosInteres = Object.fromEntries(Object.entries(TIPOS_FICHA)
        .map(([tipo, clave]) => [clave, puntos.filter((punto) => punto.tipo === tipo)]));
    const fotos = [
        ...(ficha?.fotografiaUrl ? [{ url: ficha.fotografiaUrl, textoAlternativo: `Fotografía de ${ciudad.nombre}`, fuente: "Wikipedia" }] : []),
        ...puntos.filter((punto) => punto.fotografiaUrl).slice(0, 5)
            .map((punto) => ({ url: punto.fotografiaUrl, textoAlternativo: punto.nombre, fuente: "Wikimedia Commons" }))
    ];
    return {
        ...ciudad,
        wikiDataId: null,
        poblacion: null,
        descripcion: ficha?.descripcion || null,
        puntosInteres,
        atractivos: puntosInteres.atracciones,
        fotos,
        puntajeTuristico: ficha?.puntajeTuristico ?? null,
        tiempoSugeridoDias: ficha?.diasSugeridos ?? null,
        categoriasSinDatos: Object.entries(puntosInteres).filter(([, lista]) => !lista.length).map(([clave]) => clave),
        fuenteGeografica: ciudad.fuente,
        fuenteContenido: ficha?.proveedor || null,
        actualizadoEn: ficha?.actualizadoEn || null,
        avisos
    };
};

const obtener = async (id, nombre, pais) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new AppError(400, "El identificador del destino no es válido");
    const clave = `detalle:${id}:${nombre}:${pais || ""}`;
    const cacheado = leerCache(clave);
    if (cacheado) return cacheado;

    const ciudadLocal = catalogoDestinos.obtenerCiudad(id);
    if (ciudadLocal) {
        const resultadoLocal = await obtenerFichaCatalogo(ciudadLocal);
        if (!resultadoLocal.avisos.length) guardarCache(clave, resultadoLocal);
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
        buscarAtractivosWiki(nombreCiudad, paisCiudad, ciudad.latitude ?? null, ciudad.longitude ?? null),
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
        descripcion: wiki.descripcion || null,
        atractivos,
        fotos,
        puntajeTuristico: atractivosWikidata.length ? Math.min(100, atractivosWikidata.length * 10) : null,
        fuenteGeografica,
        fuenteContenido: wiki.fuente || null
    };
    guardarCache(clave, resultado);
    return resultado;
};

module.exports = { buscar, listarPaises, obtener, verificarCiudadExterna, verificarCiudadPorNombre };
