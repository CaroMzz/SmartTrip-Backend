const { randomUUID } = require("node:crypto");
const config = require("../config");
const repository = require("../repositories/viajeRepository");
const AppError = require("./appError");
const routingService = require("./routingService");
const catalogoDestinos = require("./catalogoDestinos");
const prioridadesUsuario = require("./prioridades");

// Con hasta esta cantidad de ciudades se evalúan todos los órdenes posibles (7! = 5040).
const MAX_CIUDADES_PERMUTACION = 7;

const redondear = (numero, decimales = 2) => {
    const factor = 10 ** decimales;
    return Math.round((numero + Number.EPSILON) * factor) / factor;
};

const distanciaEntre = (a, b) => {
    const radianes = (grados) => grados * Math.PI / 180;
    const lat1 = radianes(a.latitud);
    const lat2 = radianes(b.latitud);
    const deltaLat = lat2 - lat1;
    const deltaLon = radianes(b.longitud - a.longitud);
    const h = Math.sin(deltaLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const AJUSTES_TRANSPORTE = {
    auto: { factor: 1.25, velocidad: 75, horasPorTraslado: 0.2 },
    tren: { factor: 1.1, velocidad: 110, horasPorTraslado: 0.35 },
    avion: { factor: 1.05, velocidad: 700, horasPorTraslado: 2.5 }
};

// ---------- Generación de órdenes candidatos ----------

const ordenarPorProximidad = (ciudades, inicio = 0) => {
    const restantes = ciudades.filter((_, indice) => indice !== inicio);
    const orden = [ciudades[inicio]];
    while (restantes.length) {
        const actual = orden[orden.length - 1];
        let indiceMasCercano = 0;
        for (let i = 1; i < restantes.length; i++) {
            if (distanciaEntre(actual, restantes[i]) < distanciaEntre(actual, restantes[indiceMasCercano])) {
                indiceMasCercano = i;
            }
        }
        orden.push(restantes.splice(indiceMasCercano, 1)[0]);
    }
    return orden;
};

const longitudRecorrido = (orden) => orden.slice(1)
    .reduce((total, ciudad, i) => total + distanciaEntre(orden[i], ciudad), 0);

// Mejora local 2-opt: invierte tramos mientras eso acorte el recorrido.
const mejorarDosOpt = (orden) => {
    let mejor = orden.slice();
    let mejoro = true;
    while (mejoro) {
        mejoro = false;
        for (let i = 0; i < mejor.length - 1; i++) {
            for (let j = i + 1; j < mejor.length; j++) {
                const candidato = [...mejor.slice(0, i), ...mejor.slice(i, j + 1).reverse(), ...mejor.slice(j + 1)];
                if (longitudRecorrido(candidato) + 1e-9 < longitudRecorrido(mejor)) {
                    mejor = candidato;
                    mejoro = true;
                }
            }
        }
    }
    return mejor;
};

const permutaciones = (lista) => {
    if (lista.length <= 1) return [lista];
    return lista.flatMap((item, indice) =>
        permutaciones([...lista.slice(0, indice), ...lista.slice(indice + 1)]).map((resto) => [item, ...resto]));
};

const ordenesCandidatos = (ciudades) => {
    if (ciudades.length <= MAX_CIUDADES_PERMUTACION) return permutaciones(ciudades);
    const ordenes = [
        ciudades.slice(),
        ciudades.slice().sort((a, b) => (b.puntajeTuristico ?? 50) - (a.puntajeTuristico ?? 50))
    ];
    for (let inicio = 0; inicio < ciudades.length; inicio++) {
        const cercano = ordenarPorProximidad(ciudades, inicio);
        ordenes.push(cercano, mejorarDosOpt(cercano));
    }
    return ordenes;
};

// ---------- Evaluación de un candidato ----------

// Distribuye los días proporcionalmente al peso de cada ciudad, con al menos un día por ciudad.
const repartirDias = (totalDias, ciudades, peso) => {
    const libres = totalDias - ciudades.length;
    const pesos = ciudades.map((ciudad) => Math.max(0.01, peso(ciudad)));
    const sumaPesos = pesos.reduce((suma, item) => suma + item, 0);
    const exactos = pesos.map((item) => libres * item / sumaPesos);
    const dias = exactos.map((item) => 1 + Math.floor(item));
    const faltan = totalDias - dias.reduce((suma, item) => suma + item, 0);
    const restos = exactos.map((item, indice) => ({ indice, resto: item - Math.floor(item) }))
        .sort((a, b) => b.resto - a.resto || a.indice - b.indice);
    for (let i = 0; i < faltan; i++) dias[restos[i].indice]++;
    return dias;
};

// Formas de repartir los días: todas usan los días sugeridos de la ciudad (si el batch los cargó)
// y se diferencian en cuánto pesa el puntaje turístico.
const REPARTOS = {
    uniforme: () => 1,
    turistico: (ciudad) => (ciudad.puntajeTuristico ?? 50) / 50,
    muy_turistico: (ciudad) => ((ciudad.puntajeTuristico ?? 50) / 50) ** 1.5
};

const pesoDias = (reparto) => (ciudad) => (ciudad.diasSugeridos ?? 1) * REPARTOS[reparto](ciudad);

// Recorre el orden decidiendo dónde se aloja el viajero. Con excursiones, una ciudad cercana
// al alojamiento actual se visita en el día (ida y vuelta) sin cambiar de alojamiento.
const armarTramos = (orden, transporte, conExcursiones) => {
    const ajustes = AJUSTES_TRANSPORTE[transporte];
    const tramos = [];
    const alojamientos = [orden[0]];
    let base = orden[0];
    for (let i = 1; i < orden.length; i++) {
        const ciudad = orden[i];
        const distanciaBase = distanciaEntre(base, ciudad);
        const esExcursion = conExcursiones && distanciaBase <= config.radioExcursionKm;
        const distanciaKm = esExcursion ? 2 * distanciaBase : distanciaBase;
        tramos.push({
            origen: base.nombre,
            destino: ciudad.nombre,
            tipo: esExcursion ? "excursion" : "traslado",
            distanciaKm: distanciaKm * ajustes.factor,
            tiempoHoras: distanciaKm * ajustes.factor / ajustes.velocidad
                + ajustes.horasPorTraslado * (esExcursion ? 2 : 1),
            panoramico: catalogoDestinos.esTramoPanoramico(base.nombre, ciudad.nombre),
            aptoTren: distanciaBase <= config.tramoTrenMaxKm
        });
        if (!esExcursion) base = ciudad;
        alojamientos.push(base);
    }
    return { tramos, alojamientos };
};

const calcularCostos = (viaje, distanciaKm) => {
    const tasas = config.costosReferenciales;
    const diasPersonas = viaje.duracionDias * viaje.cantidadPersonas;
    const nochesPersonas = Math.max(0, viaje.duracionDias - 1) * viaje.cantidadPersonas;
    const transporte = viaje.transportePreferido === "tren"
        ? distanciaKm * viaje.cantidadPersonas * tasas.trenPorPersonaKmUsd
        : viaje.transportePreferido === "avion"
            ? distanciaKm * viaje.cantidadPersonas * tasas.avionPorPersonaKmUsd
            : distanciaKm * tasas.autoPorKmUsd;
    const categorias = {
        hospedaje: redondear(nochesPersonas * tasas.alojamientoPorPersonaNocheUsd),
        alimentacion: redondear(diasPersonas * tasas.comidaPorPersonaDiaUsd),
        transporte: redondear(transporte),
        actividades: redondear(diasPersonas * tasas.actividadesPorPersonaDiaUsd)
    };
    const total = redondear(Object.values(categorias).reduce((suma, item) => suma + item, 0));
    return { categorias, total };
};

const porcentaje = (tramos, condicion) => tramos.length
    ? tramos.filter(condicion).length / tramos.length * 100
    : 100;

const evaluarCandidato = (viaje, orden, conExcursiones, reparto) => {
    const { tramos, alojamientos } = armarTramos(orden, viaje.transportePreferido, conExcursiones);
    const dias = repartirDias(viaje.duracionDias, orden, pesoDias(reparto));
    const distanciaKm = tramos.reduce((total, tramo) => total + tramo.distanciaKm, 0);
    return {
        orden, dias, tramos, alojamientos, conExcursiones, reparto,
        clave: [...orden.map((ciudad) => ciudad.nombre), "|", ...dias, "|", ...alojamientos.map((c) => c.nombre)].join(","),
        criterios: {
            costo: calcularCostos(viaje, distanciaKm).total,
            distanciaKm,
            tiempoHoras: tramos.reduce((total, tramo) => total + tramo.tiempoHoras, 0),
            puntajeTuristico: orden.reduce((suma, ciudad, i) => suma + (ciudad.puntajeTuristico ?? 50) * dias[i], 0)
                / viaje.duracionDias,
            cambiosAlojamiento: tramos.filter((tramo) => tramo.tipo === "traslado").length,
            aptitudTren: porcentaje(tramos, (tramo) => tramo.aptoTren),
            panoramico: porcentaje(tramos, (tramo) => tramo.panoramico)
        }
    };
};

// ---------- Fórmula P (sección 5.1 del documento de alcance) ----------
// P = wC·C + wD·D + wT·T + wA·A + wH·H + wR·R, con cada criterio expresado de 0 a 100 (más es mejor).
// Los pesos salen de las prioridades del usuario (RF08): "reducir kilómetros" se reparte entre
// distancia (D) y tiempo (T), y "priorizar tren" + "rutas panorámicas" forman el criterio R.

const pesosDesdePrioridades = (p) => ({
    C: p.ahorro, D: p.distancia / 2, T: p.distancia / 2, A: p.atractivos, H: p.alojamiento, R: p.tren + p.panoramicas
});

// Perfiles fijos usados para ofrecer alternativas contrastantes junto a la del usuario.
const PERFIL_AHORRO = { C: 60, D: 20, T: 10, A: 0, H: 10, R: 0 };
const PERFIL_EXPERIENCIAS = { C: 0, D: 0, T: 15, A: 70, H: 15, R: 0 };

const rangos = (candidatos) => {
    const rango = (campo) => {
        const valores = candidatos.map((candidato) => candidato.criterios[campo]);
        return { min: Math.min(...valores), max: Math.max(...valores) };
    };
    return {
        costo: rango("costo"),
        distanciaKm: rango("distanciaKm"),
        tiempoHoras: rango("tiempoHoras"),
        cambiosAlojamiento: rango("cambiosAlojamiento")
    };
};

// Normaliza un criterio a minimizar: 100 para el mejor valor entre los candidatos, 0 para el peor.
const inverso = (valor, { min, max }) => max === min
    ? 100
    : Math.min(100, Math.max(0, (max - valor) / (max - min) * 100));

const desglose = (criterios, limites, prioridades) => {
    const pesoR = prioridades.tren + prioridades.panoramicas;
    return {
        C: inverso(criterios.costo, limites.costo),
        D: inverso(criterios.distanciaKm, limites.distanciaKm),
        T: inverso(criterios.tiempoHoras, limites.tiempoHoras),
        A: criterios.puntajeTuristico,
        H: inverso(criterios.cambiosAlojamiento, limites.cambiosAlojamiento),
        R: pesoR ? (prioridades.tren * criterios.aptitudTren + prioridades.panoramicas * criterios.panoramico) / pesoR : 0
    };
};

const puntuar = (valores, pesos) =>
    Object.keys(pesos).reduce((total, clave) => total + pesos[clave] * valores[clave], 0) / 100;

// Huella de las métricas: dos recorridos espejados (A→B→C y C→B→A) tienen la misma.
const huella = (candidato) => Object.values(candidato.criterios).map((valor) => Math.round(valor)).join(",")
    + "|" + candidato.orden.map((ciudad, i) => `${ciudad.nombre}:${candidato.dias[i]}`).sort().join(",");

// Prefiere un candidato con métricas distintas a las ya elegidas; si no queda ninguno,
// acepta uno que solo cambie el orden (por ejemplo, empezar por la otra punta).
const mejorCandidato = (candidatos, puntaje, elegidos) => {
    const claves = new Set(elegidos.map((candidato) => candidato.clave));
    const huellas = new Set(elegidos.map(huella));
    const mejor = (lista) => lista.reduce((actual, candidato) =>
        !actual || puntaje(candidato) > puntaje(actual) ? candidato : actual, null);
    const nuevos = candidatos.filter((candidato) => !claves.has(candidato.clave));
    return mejor(nuevos.filter((candidato) => !huellas.has(huella(candidato)))) || mejor(nuevos);
};

// ---------- Armado de la alternativa final ----------

const fechaDesdeDia = (inicio, desplazamiento) => {
    const fecha = new Date(`${inicio}T00:00:00.000Z`);
    fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
    return fecha.toISOString().slice(0, 10);
};

const construirCalendario = (viaje, candidato) => {
    const dias = [];
    const estadias = [];
    let diaActual = 0;
    candidato.orden.forEach((ciudad, indiceCiudad) => {
        const alojamiento = candidato.alojamientos[indiceCiudad].nombre;
        const tramo = candidato.tramos[indiceCiudad - 1];
        const inicio = diaActual;
        for (let diaCiudad = 0; diaCiudad < candidato.dias[indiceCiudad]; diaCiudad++) {
            const llegada = diaCiudad === 0 && tramo;
            dias.push({
                numero: diaActual + 1,
                fecha: fechaDesdeDia(viaje.fechaInicio, diaActual),
                ciudad: ciudad.nombre,
                alojamiento,
                tipo: !llegada ? "estadia" : tramo.tipo === "excursion" ? "excursion" : "traslado_y_estadia",
                ...(llegada ? { origen: tramo.origen, destino: ciudad.nombre } : {})
            });
            diaActual++;
        }
        estadias.push({
            // Identificador para pedir la ficha de la ciudad con GET /destinos/:id.
            idExterno: ciudad.idExterno || catalogoDestinos.buscarCiudad(ciudad.nombre, ciudad.pais)?.idExterno || null,
            nombre: ciudad.nombre,
            pais: ciudad.pais,
            latitud: ciudad.latitud,
            longitud: ciudad.longitud,
            puntajeTuristico: ciudad.puntajeTuristico ?? 50,
            alojamientoEn: alojamiento,
            fechaInicio: fechaDesdeDia(viaje.fechaInicio, inicio),
            fechaFin: fechaDesdeDia(viaje.fechaInicio, diaActual - 1),
            dias: candidato.dias[indiceCiudad]
        });
    });
    return { dias, estadias };
};

const crearAlternativa = async (viaje, candidato, tipo, titulo, limites) => {
    const transporte = viaje.transportePreferido;
    const rutaReal = transporte === "auto" ? await routingService.obtenerRutaEnAuto(candidato.orden) : null;
    // OpenRouteService traza el recorrido ciudad por ciudad; su relación con la aproximación
    // geográfica se aplica a todos los tramos (incluidas las excursiones de ida y vuelta).
    const aproximadoKm = longitudRecorrido(candidato.orden) * AJUSTES_TRANSPORTE.auto.factor;
    const usarRutaReal = rutaReal && aproximadoKm > 0;
    const tramos = candidato.tramos.map((tramo) => usarRutaReal ? {
        ...tramo,
        distanciaKm: tramo.distanciaKm * rutaReal.distanciaKm / aproximadoKm,
        tiempoHoras: tramo.distanciaKm / aproximadoKm * rutaReal.duracionHoras
    } : tramo);
    const distanciaKm = tramos.reduce((total, tramo) => total + tramo.distanciaKm, 0);
    const costos = calcularCostos(viaje, distanciaKm);
    const criterios = {
        ...candidato.criterios,
        costo: costos.total,
        distanciaKm,
        tiempoHoras: tramos.reduce((total, tramo) => total + tramo.tiempoHoras, 0)
    };
    const valores = desglose(criterios, limites, viaje.prioridades);
    const { dias, estadias } = construirCalendario(viaje, candidato);

    return {
        id: randomUUID(),
        tipo,
        titulo,
        recomendada: false,
        ciudades: estadias,
        tramos: tramos.map((tramo) => ({
            origen: tramo.origen,
            destino: tramo.destino,
            tipo: tramo.tipo,
            transporte,
            distanciaKm: redondear(tramo.distanciaKm, 1),
            tiempoHoras: redondear(tramo.tiempoHoras, 1),
            costoUsd: redondear(distanciaKm ? costos.categorias.transporte * tramo.distanciaKm / distanciaKm : 0),
            panoramico: tramo.panoramico
        })),
        calendario: dias,
        metricas: {
            distanciaTotalKm: redondear(distanciaKm, 1),
            tiempoTrasladosHoras: redondear(criterios.tiempoHoras, 1),
            cantidadTraslados: tramos.length,
            cantidadCiudades: estadias.length,
            cambiosAlojamiento: criterios.cambiosAlojamiento,
            puntajeTuristico: redondear(criterios.puntajeTuristico, 1),
            aptitudTren: Math.round(criterios.aptitudTren),
            tramosPanoramicos: tramos.filter((tramo) => tramo.panoramico).length
        },
        puntaje: redondear(puntuar(valores, pesosDesdePrioridades(viaje.prioridades)), 1),
        desglosePuntaje: Object.fromEntries(Object.entries(valores).map(([clave, valor]) => [clave, redondear(valor, 1)])),
        presupuesto: {
            moneda: "USD",
            categorias: costos.categorias,
            totalEstimado: costos.total,
            presupuestoTotal: viaje.presupuestoTotal,
            restanteEstimado: redondear(viaje.presupuestoTotal - costos.total),
            porcentajeUsado: Math.round(costos.total / viaje.presupuestoTotal * 100)
        },
        atribucionMapa: rutaReal
            ? "© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors"
            : "Coordenadas aproximadas del catálogo de destinos",
        metodoRuta: rutaReal ? "openrouteservice" : "aproximacion_geografica",
        geometria: rutaReal?.geometria || {
            type: "LineString",
            coordinates: candidato.orden.map((ciudad) => [ciudad.longitud, ciudad.latitud])
        },
        esEstimacion: true,
        notas: [
            rutaReal
                ? "Para auto, la distancia y el tiempo siguen una ruta vial de OpenRouteService."
                : "La distancia une coordenadas en línea aproximada; no es una ruta de navegación.",
            "Tiempos y costos usan parámetros configurables del backend; no son cotizaciones ni disponibilidad en tiempo real.",
            ...(candidato.conExcursiones && tramos.some((tramo) => tramo.tipo === "excursion")
                ? [`Las ciudades a menos de ${config.radioExcursionKm} km del alojamiento se visitan como excursión de día.`]
                : [])
        ]
    };
};

const generar = async (usuarioId, viajeId) => {
    const viaje = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!viaje) throw new AppError(404, "No se encontró el viaje");
    if (!viaje.presupuestoTotal || !viaje.transportePreferido) {
        throw new AppError(409, "Completá el presupuesto y el transporte antes de generar alternativas");
    }
    if ((viaje.moneda || "USD") !== "USD") {
        throw new AppError(422, "Las estimaciones actuales están disponibles solo en USD");
    }
    if (viaje.duracionDias < viaje.ciudades.length) {
        throw new AppError(422, "La duración debe permitir al menos un día por ciudad obligatoria");
    }
    const sinCoordenadas = viaje.ciudades.filter((ciudad) => ciudad.latitud === null || ciudad.longitud === null);
    if (sinCoordenadas.length) {
        throw new AppError(422, "Faltan coordenadas para generar el recorrido", {
            ciudades: sinCoordenadas.map((ciudad) => ciudad.nombre)
        });
    }
    viaje.prioridades ||= { ...prioridadesUsuario.POR_DEFECTO };

    // Las excursiones de día no aplican a vuelos.
    const estrategias = viaje.transportePreferido === "avion" ? [false] : [false, true];
    const candidatos = [];
    for (const orden of ordenesCandidatos(viaje.ciudades)) {
        for (const conExcursiones of estrategias) {
            for (const reparto of Object.keys(REPARTOS)) {
                candidatos.push(evaluarCandidato(viaje, orden, conExcursiones, reparto));
            }
        }
    }

    const limites = rangos(candidatos);
    const puntajeCon = (pesos) => (candidato) => puntuar(desglose(candidato.criterios, limites, viaje.prioridades), pesos);
    const elegidas = [];
    for (const [tipo, titulo, pesos] of [
        ["equilibrada", "Según tus prioridades", pesosDesdePrioridades(viaje.prioridades)],
        ["mas_ahorro", "Más ahorro", PERFIL_AHORRO],
        ["mas_experiencias", "Más experiencias", PERFIL_EXPERIENCIAS]
    ]) {
        const candidato = mejorCandidato(candidatos, puntajeCon(pesos), elegidas.map((item) => item.candidato));
        if (candidato) elegidas.push({ candidato, tipo, titulo });
    }

    const alternativas = [];
    for (const { candidato, tipo, titulo } of elegidas) {
        alternativas.push(await crearAlternativa(viaje, candidato, tipo, titulo, limites));
    }
    alternativas.sort((a, b) => b.puntaje - a.puntaje);
    alternativas[0].recomendada = true;

    const guardado = await repository.guardarItinerarios(viajeId, usuarioId, alternativas);
    if (!guardado) throw new AppError(404, "No se encontró el viaje");
    return guardado.itinerarios;
};

const listar = async (usuarioId, viajeId) => {
    const viaje = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!viaje) throw new AppError(404, "No se encontró el viaje");
    return viaje.itinerarios || [];
};

const seleccionar = async (usuarioId, viajeId, itinerarioId) => {
    if (typeof itinerarioId !== "string" || itinerarioId.length > 80) {
        throw new AppError(400, "Indicá un identificador de itinerario válido");
    }
    const actualizado = await repository.seleccionarItinerario(viajeId, usuarioId, itinerarioId);
    if (!actualizado) throw new AppError(404, "No se encontró el viaje o el itinerario");
    return actualizado.itinerarios.find((item) => item.id === itinerarioId);
};

const obtenerSeleccionado = async (usuarioId, viajeId) => {
    const viaje = await repository.buscarPorUsuario(viajeId, usuarioId);
    if (!viaje) throw new AppError(404, "No se encontró el viaje");
    if (!viaje.itinerarioSeleccionadoId) throw new AppError(409, "Primero elegí una alternativa de itinerario");
    return viaje.itinerarios.find((item) => item.id === viaje.itinerarioSeleccionadoId);
};

module.exports = { generar, listar, seleccionar, obtenerSeleccionado };
