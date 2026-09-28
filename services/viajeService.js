const repository = require("../repositories/viajeRepository");
const AppError = require("./appError");
const catalogoDestinos = require("./catalogoDestinos");

const paisesValidos = (paises) => Array.isArray(paises)
    && paises.length >= 1
    && paises.length <= 10
    && paises.every((pais) => typeof pais === "string" && pais.trim().length > 0 && pais.trim().length <= 100);

const normalizarCiudad = (entrada, indice) => {
    if (typeof entrada === "string") {
        const nombre = entrada.trim();
        if (!nombre || nombre.length > 120) return null;
        const catalogada = catalogoDestinos.buscarCiudad(nombre);
        return {
            nombre: catalogada?.nombre || nombre,
            pais: catalogada?.pais || null,
            latitud: catalogada?.latitud ?? null,
            longitud: catalogada?.longitud ?? null,
            puntajeTuristico: null,
            orden: indice
        };
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

    if (!nombre || nombre.length > 120) return null;
    if ((latitud !== null || longitud !== null) && !tieneCoordenadas) return null;
    if (entrada.puntajeTuristico !== undefined
        && (!Number.isInteger(entrada.puntajeTuristico) || entrada.puntajeTuristico < 0 || entrada.puntajeTuristico > 100)) {
        return null;
    }

    return {
        idExterno: typeof entrada.idExterno === "string" && entrada.idExterno.length <= 80 ? entrada.idExterno : null,
        wikiDataId: typeof entrada.wikiDataId === "string" && /^Q\d+$/.test(entrada.wikiDataId)
            ? entrada.wikiDataId : null,
        nombre,
        pais: pais || catalogada?.pais || null,
        latitud: tieneCoordenadas ? latitud : catalogada?.latitud ?? null,
        longitud: tieneCoordenadas ? longitud : catalogada?.longitud ?? null,
        puntajeTuristico: Number.isInteger(entrada.puntajeTuristico)
            && entrada.puntajeTuristico >= 0 && entrada.puntajeTuristico <= 100
            ? entrada.puntajeTuristico : null,
        orden: indice
    };
};

const validarCiudades = (ciudades) => {
    if (!Array.isArray(ciudades) || ciudades.length < 2 || ciudades.length > 20) {
        return { error: "Indicá entre 2 y 20 ciudades obligatorias" };
    }

    const normalizadas = ciudades.map(normalizarCiudad);
    if (normalizadas.some((ciudad) => !ciudad)) {
        return { error: "Cada ciudad necesita un nombre válido y coordenadas completas o ninguna" };
    }

    const claves = normalizadas.map((ciudad) => `${ciudad.nombre}|${ciudad.pais || ""}`.toLocaleLowerCase("es"));
    if (new Set(claves).size !== claves.length) return { error: "No repitas ciudades en el recorrido" };
    return { ciudades: normalizadas };
};

const fechaValida = (valor) => {
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

const datosViaje = (datos, base = {}) => {
    const errores = {};
    const resultado = { ...base };

    if (Object.hasOwn(datos, "nombre")) {
        const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
        if (!nombre || nombre.length > 120) errores.nombre = "El nombre es obligatorio y admite hasta 120 caracteres";
        else resultado.nombre = nombre;
    }
    if (Object.hasOwn(datos, "paises")) {
        if (!paisesValidos(datos.paises)) errores.paises = "Indicá entre 1 y 10 países";
        else resultado.paises = [...new Set(datos.paises.map((pais) => pais.trim()))];
    }
    if (Object.hasOwn(datos, "ciudadesObligatorias")) {
        const validacion = validarCiudades(datos.ciudadesObligatorias);
        if (validacion.error) errores.ciudadesObligatorias = validacion.error;
        else resultado.ciudades = validacion.ciudades;
    }
    if (Object.hasOwn(datos, "fechaInicio")) {
        if (!fechaValida(datos.fechaInicio)) errores.fechaInicio = "Usá una fecha válida con formato AAAA-MM-DD";
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
        if (!["tren", "avion", "auto"].includes(datos.transportePreferido)) {
            errores.transportePreferido = "El transporte debe ser tren, avion o auto";
        } else resultado.transportePreferido = datos.transportePreferido;
    }
    if (Object.hasOwn(datos, "prioridades")) {
        const { ahorro, atractivos } = datos.prioridades || {};
        if (!Number.isInteger(ahorro) || !Number.isInteger(atractivos)
            || ahorro < 0 || ahorro > 100 || atractivos < 0 || atractivos > 100
            || ahorro + atractivos !== 100) {
            errores.prioridades = "Las prioridades de ahorro y atractivos deben ser enteros que sumen 100";
        } else resultado.prioridades = { ahorro, atractivos };
    }

    const requeridos = ["nombre", "paises", "ciudades", "fechaInicio", "duracionDias", "cantidadPersonas"];
    for (const campo of requeridos) {
        if (resultado[campo] === undefined || resultado[campo] === null) {
            errores[campo] ||= "Este campo es obligatorio";
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
        ciudadesObligatorias: viaje.ciudades,
        fechaInicio: viaje.fechaInicio,
        fechaFin: ultimoDia.toISOString().slice(0, 10),
        duracionDias: viaje.duracionDias,
        cantidadPersonas: viaje.cantidadPersonas,
        presupuestoTotal: viaje.presupuestoTotal ?? null,
        moneda: viaje.moneda || "USD",
        transportePreferido: viaje.transportePreferido || null,
        prioridades: viaje.prioridades || { ahorro: 60, atractivos: 40 },
        estado: viaje.estado,
        itinerarios: viaje.itinerarios || [],
        itinerarioSeleccionadoId: viaje.itinerarioSeleccionadoId || null,
        creadoEn: viaje.creadoEn,
        actualizadoEn: viaje.actualizadoEn
    };
};

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

const listar = (usuarioId) => repository.listarPorUsuario(usuarioId).map((viaje) => {
    const vista = vistaPublica(viaje);
    delete vista.itinerarios;
    const seleccionada = viaje.itinerarios?.find((item) => item.id === viaje.itinerarioSeleccionadoId);
    return {
        ...vista,
        costoEstimado: seleccionada?.presupuesto.totalEstimado ?? null
    };
});

const obtener = (usuarioId, viajeId) => {
    const viaje = repository.buscarPorUsuario(viajeId, usuarioId);
    if (!viaje) throw new AppError(404, "No se encontró el viaje");
    return vistaPublica(viaje);
};

const crear = (usuarioId, datos) => {
    validarCamposPermitidos(datos, [
        "nombre", "paises", "ciudadesObligatorias", "fechaInicio", "duracionDias",
        "cantidadPersonas", "presupuestoTotal", "moneda", "transportePreferido", "prioridades"
    ]);
    const normalizados = solicitar(datosViaje(datos), 400);
    const ahora = new Date().toISOString();
    const viaje = repository.crear({
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

const actualizar = (usuarioId, viajeId, datos) => {
    const actual = repository.buscarPorUsuario(viajeId, usuarioId);
    if (!actual) throw new AppError(404, "No se encontró el viaje");
    validarCamposPermitidos(datos, [
        "nombre", "paises", "ciudadesObligatorias", "fechaInicio", "duracionDias",
        "cantidadPersonas", "presupuestoTotal", "moneda", "transportePreferido", "prioridades"
    ]);
    const normalizados = solicitar(datosViaje(datos, actual), 400);
    const actualizado = repository.guardar({
        ...actual,
        ...normalizados,
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        actualizadoEn: new Date().toISOString()
    });
    return vistaPublica(actualizado);
};

const configurar = (usuarioId, viajeId, datos) => {
    const actual = repository.buscarPorUsuario(viajeId, usuarioId);
    if (!actual) throw new AppError(404, "No se encontró el viaje");
    const permitidos = ["presupuestoTotal", "moneda", "transportePreferido", "prioridades"];
    const filtrados = Object.fromEntries(Object.entries(datos).filter(([clave]) => permitidos.includes(clave)));
    if (Object.keys(filtrados).length !== Object.keys(datos).length) {
        throw new AppError(400, "La configuración contiene campos no permitidos");
    }
    if (!Object.keys(filtrados).length) throw new AppError(400, "Indicá al menos una preferencia para guardar");
    const normalizados = solicitar(datosViaje(filtrados, actual), 400);
    const actualizado = repository.guardar({
        ...actual,
        ...normalizados,
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        actualizadoEn: new Date().toISOString()
    });
    return vistaPublica(actualizado);
};

const borrar = (usuarioId, viajeId) => {
    if (!repository.eliminar(viajeId, usuarioId)) throw new AppError(404, "No se encontró el viaje");
};

module.exports = { listar, obtener, crear, actualizar, configurar, borrar };
