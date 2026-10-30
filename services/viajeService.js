const repository = require("../repositories/viajeRepository");
const AppError = require("./appError");
const catalogoDestinos = require("./catalogoDestinos");
const prioridades = require("./prioridades");
const transportes = require("./transportes");
const destinoService = require("./destinoService");

// Acepta cada país como texto ("Peru") o como el objeto del autocompletado ({ nombre, codigo }).
const nombresDePaises = (paises) => Array.isArray(paises)
    ? paises.map((pais) => (pais && typeof pais === "object" ? pais.nombre : pais))
    : paises;

const paisesValidos = (paises) => Array.isArray(paises)
    && paises.length >= 1
    && paises.length <= 10
    && paises.every((pais) => typeof pais === "string" && pais.trim().length > 0 && pais.trim().length <= 100);

const desdeCatalogo = (ciudad, indice, puntajeTuristico = null) => ({
    idExterno: ciudad.idExterno,
    wikiDataId: null,
    nombre: ciudad.nombre,
    pais: ciudad.pais,
    latitud: ciudad.latitud,
    longitud: ciudad.longitud,
    puntajeTuristico,
    orden: indice
});

// Cada ciudad tiene que existir (RF09): se acepta si está en el catálogo local (por id o por nombre y país).
// Si no, queda marcada como externa y se verifica contra OpenStreetMap antes de guardar
// (verificarCiudadesExternas): por su id de Photon o, sin id, por nombre, país y coordenadas.
// Devuelve { ciudad } o { error } con el motivo.
const normalizarCiudad = (entrada, indice) => {
    if (typeof entrada === "string") {
        const nombre = entrada.trim();
        if (!nombre || nombre.length > 120) return { error: "Cada ciudad necesita un nombre válido" };
        const catalogada = catalogoDestinos.buscarCiudad(nombre);
        return catalogada
            ? { ciudad: desdeCatalogo(catalogada, indice) }
            : { ciudad: { idExterno: null, wikiDataId: null, nombre, pais: null, latitud: null, longitud: null, puntajeTuristico: null, orden: indice, externa: true } };
    }
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;

    const nombre = typeof entrada.nombre === "string" ? entrada.nombre.trim() : "";
    const pais = typeof entrada.pais === "string" && entrada.pais.trim() ? entrada.pais.trim() : null;
    if (pais && pais.length > 100) return null;
    const catalogada = catalogoDestinos.buscarCiudad(nombre, pais);
    const latitud = entrada.latitud === undefined || entrada.latitud === null || entrada.latitud === ""
        ? null : Number(entrada.latitud);
    const longitud = entrada.longitud === undefined || entrada.longitud === null || entrada.longitud === ""
        ? null : Number(entrada.longitud);
    const tieneCoordenadas = latitud !== null && longitud !== null
        && Number.isFinite(latitud) && Number.isFinite(longitud)
        && latitud >= -90 && latitud <= 90 && longitud >= -180 && longitud <= 180;

    const invalida = { error: "Cada ciudad necesita un nombre válido y coordenadas completas o ninguna" };
    if (!nombre || nombre.length > 120) return invalida;
    if ((latitud !== null || longitud !== null) && !tieneCoordenadas) return invalida;
    // La API devuelve puntajeTuristico: null en ciudades sin datos del batch; se trata como no enviado.
    if (entrada.puntajeTuristico !== undefined && entrada.puntajeTuristico !== null
        && (!Number.isInteger(entrada.puntajeTuristico) || entrada.puntajeTuristico < 0 || entrada.puntajeTuristico > 100)) {
        return invalida;
    }
    const puntajeTuristico = Number.isInteger(entrada.puntajeTuristico) ? entrada.puntajeTuristico : null;
    const idExterno = typeof entrada.idExterno === "string" && entrada.idExterno.length <= 80 ? entrada.idExterno : null;

    if (idExterno?.startsWith("local-")) {
        const porId = catalogoDestinos.obtenerCiudad(idExterno);
        return porId
            ? { ciudad: desdeCatalogo(porId, indice, puntajeTuristico) }
            : { error: `La ciudad "${nombre}" no está en el catálogo. Elegila del buscador de destinos.` };
    }
    if (catalogada && !idExterno?.startsWith("osm-")) return { ciudad: desdeCatalogo(catalogada, indice, puntajeTuristico) };
    const deOsm = Boolean(idExterno && /^osm-[NRW]-\d+$/.test(idExterno));
    return {
        ciudad: {
            idExterno: deOsm ? idExterno : null,
            wikiDataId: typeof entrada.wikiDataId === "string" && /^Q\d+$/.test(entrada.wikiDataId) ? entrada.wikiDataId : null,
            nombre, pais,
            latitud: tieneCoordenadas ? latitud : null,
            longitud: tieneCoordenadas ? longitud : null,
            puntajeTuristico, orden: indice, externa: true
        }
    };
};

const validarCiudades = (ciudades) => {
    if (!Array.isArray(ciudades) || ciudades.length < 1 || ciudades.length > 20) {
        return { error: "Indicá entre 1 y 20 ciudades obligatorias" };
    }

    const resultados = ciudades.map(normalizarCiudad);
    const conError = resultados.find((resultado) => resultado.error);
    if (conError) return { error: conError.error };
    const normalizadas = resultados.map((resultado) => resultado.ciudad);

    const claves = normalizadas.map((ciudad) => `${ciudad.nombre}|${ciudad.pais || ""}`.toLocaleLowerCase("es"));
    if (new Set(claves).size !== claves.length) return { error: "No repitas ciudades en el recorrido" };
    return { ciudades: normalizadas };
};

const fechaValida = (valor) => {
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

// Primer día admitido para iniciar un viaje: hoy en el huso horario más atrasado (UTC-12), así nadie
// ve rechazado su «hoy» porque el servidor ya cambió de fecha.
const primerDiaPermitido = () => new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);

const MAX_NOMBRE_VIAJE = 150;

const datosViaje = (datos, base = {}) => {
    const errores = {};
    const resultado = { ...base };

    if (Object.hasOwn(datos, "nombre")) {
        const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
        if (!nombre || nombre.length > MAX_NOMBRE_VIAJE) errores.nombre = `El nombre es obligatorio y admite hasta ${MAX_NOMBRE_VIAJE} caracteres`;
        else resultado.nombre = nombre;
    }
    if (Object.hasOwn(datos, "paises")) {
        const paises = nombresDePaises(datos.paises);
        const desconocido = paisesValidos(paises) ? paises.find((pais) => !catalogoDestinos.obtenerPais(pais)) : null;
        if (!paisesValidos(paises)) errores.paises = "Indicá entre 1 y 10 países";
        else if (desconocido) errores.paises = `El país "${desconocido.trim()}" no está en el catálogo. Elegí uno de los países sugeridos.`;
        else resultado.paises = [...new Set(paises.map((pais) => pais.trim()))];
    }
    if (Object.hasOwn(datos, "ciudadesObligatorias")) {
        const validacion = validarCiudades(datos.ciudadesObligatorias);
        if (validacion.error) errores.ciudadesObligatorias = validacion.error;
        else resultado.ciudades = validacion.ciudades;
    }
    if (Object.hasOwn(datos, "fechaInicio")) {
        if (!fechaValida(datos.fechaInicio)) errores.fechaInicio = "Usá una fecha válida con formato AAAA-MM-DD";
        else if (datos.fechaInicio < primerDiaPermitido() && datos.fechaInicio !== base.fechaInicio) {
            errores.fechaInicio = "La fecha de inicio no puede ser anterior a hoy";
        }
        else resultado.fechaInicio = datos.fechaInicio;
    }
    if (Object.hasOwn(datos, "duracionDias")) {
        if (!Number.isInteger(datos.duracionDias) || datos.duracionDias < 1 || datos.duracionDias > 60) {
            errores.duracionDias = "La duración debe ser un entero entre 1 y 60 días";
        } else resultado.duracionDias = datos.duracionDias;
    }
    if (Object.hasOwn(datos, "cantidadPersonas")) {
        if (!Number.isInteger(datos.cantidadPersonas) || datos.cantidadPersonas < 1 || datos.cantidadPersonas > 20) {
            errores.cantidadPersonas = "La cantidad debe ser un entero entre 1 y 20 personas";
        } else resultado.cantidadPersonas = datos.cantidadPersonas;
    }

    if (Object.hasOwn(datos, "presupuestoTotal")) {
        if (typeof datos.presupuestoTotal !== "number" || !Number.isFinite(datos.presupuestoTotal)
            || datos.presupuestoTotal <= 0 || datos.presupuestoTotal > 100000000) {
            errores.presupuestoTotal = "El presupuesto debe ser un número positivo de hasta 100 millones";
        } else resultado.presupuestoTotal = Math.round(datos.presupuestoTotal * 100) / 100;
    }
    if (Object.hasOwn(datos, "moneda")) {
        if (typeof datos.moneda !== "string" || !/^[A-Za-z]{3}$/.test(datos.moneda)) {
            errores.moneda = "La moneda debe ser un código de tres letras, por ejemplo USD";
        } else resultado.moneda = datos.moneda.toUpperCase();
    }
    if (Object.hasOwn(datos, "transportePreferido")) {
        if (!transportes.esValido(datos.transportePreferido)) {
            errores.transportePreferido = transportes.MENSAJE_INVALIDO;
        } else resultado.transportePreferido = datos.transportePreferido;
    }
    if (Object.hasOwn(datos, "prioridades")) {
        const validacion = prioridades.validar(datos.prioridades);
        if (validacion.error) errores.prioridades = validacion.error;
        else resultado.prioridades = validacion.prioridades;
    }

    const requeridos = ["nombre", "paises", "ciudades", "fechaInicio", "duracionDias", "cantidadPersonas"];
    for (const campo of requeridos) {
        if (resultado[campo] === undefined || resultado[campo] === null) {
            // Las ciudades se envían como ciudadesObligatorias: el error va bajo ese nombre.
            errores[campo === "ciudades" ? "ciudadesObligatorias" : campo] ||= "Este campo es obligatorio";
        }
    }
    return { resultado, errores };
};

const vistaPublica = (viaje) => {
    const ultimoDia = new Date(`${viaje.fechaInicio}T00:00:00.000Z`);
    ultimoDia.setUTCDate(ultimoDia.getUTCDate() + viaje.duracionDias - 1);
    return {
        id: viaje.id,
        nombre: viaje.nombre,
        paises: viaje.paises,
        // Mismos países con el código ISO que usa el autocompletado de la interfaz.
        paisesDetalle: viaje.paisesDetalle || (viaje.paises || []).map((nombre) => ({
            nombre, codigo: catalogoDestinos.obtenerPais(nombre)?.codigo || null
        })),
        ciudadesObligatorias: viaje.ciudades.map(({ externa, ...ciudad }) => ciudad),
        fechaInicio: viaje.fechaInicio,
        fechaFin: ultimoDia.toISOString().slice(0, 10),
        duracionDias: viaje.duracionDias,
        cantidadPersonas: viaje.cantidadPersonas,
        presupuestoTotal: viaje.presupuestoTotal ?? null,
        moneda: viaje.moneda || "USD",
        transportePreferido: viaje.transportePreferido || null,
        prioridades: viaje.prioridades || { ...prioridades.POR_DEFECTO },
        estado: viaje.estado,
        itinerarios: viaje.itinerarios || [],
        itinerarioSeleccionadoId: viaje.itinerarioSeleccionadoId || null,
        creadoEn: viaje.creadoEn,
        actualizadoEn: viaje.actualizadoEn
    };
};

// Las ciudades de OpenStreetMap se confirman contra Photon y se guardan con los datos verificados.
const verificarCiudadesExternas = async (ciudades, guardadas = []) => {
    if (!ciudades?.some((ciudad) => ciudad.externa)) return ciudades;
    return Promise.all(ciudades.map(async ({ externa, ...ciudad }) => {
        if (!externa) return ciudad;
        const guardada = ciudad.idExterno && guardadas.find((item) => item.idExterno === ciudad.idExterno);
        if (guardada) return { ...ciudad, nombre: guardada.nombre, pais: guardada.pais, latitud: guardada.latitud, longitud: guardada.longitud };
        let lugar;
        try {
            lugar = ciudad.idExterno
                ? await destinoService.verificarCiudadExterna(ciudad)
                : await destinoService.verificarCiudadPorNombre(ciudad);
        } catch {
            throw new AppError(503, "No se pudo verificar la ciudad en OpenStreetMap. Probá de nuevo en unos minutos.");
        }
        if (!lugar) {
            throw new AppError(422, `La ciudad "${ciudad.nombre}" no existe en el catálogo ni en OpenStreetMap. Elegila del buscador de destinos.`, {
                ciudadesObligatorias: `La ciudad "${ciudad.nombre}" no existe en el catálogo ni en OpenStreetMap`
            });
        }
        // Por id se guardan los datos de Photon; por nombre se respeta el nombre enviado (por ejemplo
        // «Valencia» y no «València») y se completan id, país y, si faltaban, las coordenadas.
        return {
            ...ciudad,
            idExterno: lugar.idExterno,
            nombre: ciudad.idExterno ? lugar.nombre : ciudad.nombre,
            pais: lugar.pais,
            latitud: ciudad.idExterno || ciudad.latitud === null ? lugar.latitud : ciudad.latitud,
            longitud: ciudad.idExterno || ciudad.longitud === null ? lugar.longitud : ciudad.longitud,
            wikiDataId: lugar.wikiDataId || ciudad.wikiDataId
        };
    }));
};

// Qué partes del viaje cambian, para no reescribir países, ciudades ni preferencias si siguen iguales.
const claveRuta = (viaje) => JSON.stringify([
    [...(viaje.paises || [])].map((pais) => catalogoDestinos.normalizar(pais)).sort(),
    (viaje.ciudades || []).map((ciudad) => `${catalogoDestinos.normalizar(ciudad.nombre)}|${catalogoDestinos.normalizar(ciudad.pais)}`)
]);
const cambiosRespecto = (actual, nuevo) => ({
    ruta: claveRuta(actual) !== claveRuta(nuevo),
    preferencias: JSON.stringify(actual.prioridades || null) !== JSON.stringify(nuevo.prioridades || null),
    transporte: (actual.transportePreferido || null) !== (nuevo.transportePreferido || null)
});

const solicitar = (resultado, status = 400) => {
    if (Object.keys(resultado.errores).length) {
        throw new AppError(status, "Hay errores en los datos enviados", resultado.errores);
    }
    return resultado.resultado;
};

const validarCamposPermitidos = (datos, campos) => {
    const desconocidos = Object.keys(datos).filter((campo) => !campos.includes(campo));
    if (desconocidos.length) {
        throw new AppError(400, "El viaje contiene campos no permitidos", { campos: desconocidos });
    }
    if (!Object.keys(datos).length) throw new AppError(400, "Indicá al menos un campo para guardar");
};

const listar = async (usuarioId) => (await repository.listarPorUsuario(usuarioId)).map((viaje) => {
    const vista = vistaPublica(viaje);
    delete vista.itinerarios;
    const seleccionada = viaje.itinerarios?.find((item) => item.id === viaje.itinerarioSeleccionadoId);
    return {
        ...vista,
        costoEstimado: seleccionada?.presupuesto.totalEstimado ?? null
    };
});

const obtener = async (usuarioId, viajeId) => {
    const viaje = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!viaje) throw new AppError(404, "No se encontró el viaje");
    return vistaPublica(viaje);
};

const crear = async (usuarioId, datos) => {
    validarCamposPermitidos(datos, [
        "nombre", "paises", "ciudadesObligatorias", "fechaInicio", "duracionDias",
        "cantidadPersonas", "presupuestoTotal", "moneda", "transportePreferido", "prioridades"
    ]);
    const normalizados = solicitar(datosViaje(datos), 400);
    normalizados.ciudades = await verificarCiudadesExternas(normalizados.ciudades);
    const ahora = new Date().toISOString();
    const viaje = await repository.crear({
        ...normalizados,
        usuarioId,
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        creadoEn: ahora,
        actualizadoEn: ahora
    });
    return vistaPublica(viaje);
};

const actualizar = async (usuarioId, viajeId, datos) => {
    const actual = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!actual) throw new AppError(404, "No se encontró el viaje");
    validarCamposPermitidos(datos, [
        "nombre", "paises", "ciudadesObligatorias", "fechaInicio", "duracionDias",
        "cantidadPersonas", "presupuestoTotal", "moneda", "transportePreferido", "prioridades"
    ]);
    const normalizados = solicitar(datosViaje(datos, actual), 400);
    normalizados.ciudades = await verificarCiudadesExternas(normalizados.ciudades, actual.ciudades);
    const viaje = {
        ...actual,
        ...normalizados,
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        actualizadoEn: new Date().toISOString()
    };
    const actualizado = await repository.guardar(viaje, cambiosRespecto(actual, viaje));
    return vistaPublica(actualizado);
};

const configurar = async (usuarioId, viajeId, datos) => {
    const actual = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!actual) throw new AppError(404, "No se encontró el viaje");
    const permitidos = ["presupuestoTotal", "moneda", "transportePreferido", "prioridades"];
    const filtrados = Object.fromEntries(Object.entries(datos).filter(([clave]) => permitidos.includes(clave)));
    if (Object.keys(filtrados).length !== Object.keys(datos).length) {
        throw new AppError(400, "La configuración contiene campos no permitidos");
    }
    if (!Object.keys(filtrados).length) throw new AppError(400, "Indicá al menos una preferencia para guardar");
    const normalizados = solicitar(datosViaje(filtrados, actual), 400);
    const viaje = {
        ...actual,
        ...normalizados,
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        actualizadoEn: new Date().toISOString()
    };
    const actualizado = await repository.guardar(viaje, cambiosRespecto(actual, viaje));
    return vistaPublica(actualizado);
};

const borrar = async (usuarioId, viajeId) => {
    if (!await repository.eliminar(viajeId, usuarioId)) throw new AppError(404, "No se encontró el viaje");
};

module.exports = { listar, obtener, crear, actualizar, configurar, borrar };
