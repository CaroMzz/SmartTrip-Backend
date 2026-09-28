const { randomUUID } = require("node:crypto");
const config = require("../config");
const repository = require("../repositories/viajeRepository");
const AppError = require("./appError");
const routingService = require("./routingService");

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

const ordenarPorProximidad = (ciudades) => {
    const restantes = ciudades.slice(1);
    const orden = [ciudades[0]];
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

const repartirDias = (totalDias, ciudades, peso) => {
    const libres = totalDias - ciudades.length;
    const pesos = ciudades.map((ciudad, indice) => Math.max(1, peso(ciudad, indice)));
    const sumaPesos = pesos.reduce((suma, item) => suma + item, 0);
    const exactos = pesos.map((item) => libres * item / sumaPesos);
    const dias = exactos.map((item) => 1 + Math.floor(item));
    let faltan = totalDias - dias.reduce((suma, item) => suma + item, 0);
    const restos = exactos.map((item, indice) => ({ indice, resto: item - Math.floor(item) }))
        .sort((a, b) => b.resto - a.resto || a.indice - b.indice);
    for (let i = 0; i < faltan; i++) dias[restos[i].indice]++;
    return dias;
};

const fechaDesdeDia = (inicio, desplazamiento) => {
    const fecha = new Date(`${inicio}T00:00:00.000Z`);
    fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
    return fecha.toISOString().slice(0, 10);
};

const metricaRuta = (ciudades, transporte) => {
    let distancia = 0;
    for (let i = 1; i < ciudades.length; i++) distancia += distanciaEntre(ciudades[i - 1], ciudades[i]);

    const ajustes = {
        auto: { factor: 1.25, velocidad: 75, horasPorTraslado: 0.2 },
        tren: { factor: 1.1, velocidad: 110, horasPorTraslado: 0.35 },
        avion: { factor: 1.05, velocidad: 700, horasPorTraslado: 2.5 }
    }[transporte];
    const distanciaAjustada = distancia * ajustes.factor;
    const cantidadTraslados = Math.max(0, ciudades.length - 1);
    const duracionHoras = distanciaAjustada / ajustes.velocidad
        + cantidadTraslados * ajustes.horasPorTraslado;

    return { distanciaKm: distanciaAjustada, duracionHoras, cantidadTraslados };
};

const calcularCostos = (viaje, metricas) => {
    const tasas = config.costosReferenciales;
    const diasPersonas = viaje.duracionDias * viaje.cantidadPersonas;
    const nochesPersonas = Math.max(0, viaje.duracionDias - 1) * viaje.cantidadPersonas;
    const transporte = viaje.transportePreferido === "tren"
        ? metricas.distanciaKm * viaje.cantidadPersonas * tasas.trenPorPersonaKmUsd
        : viaje.transportePreferido === "avion"
            ? metricas.distanciaKm * viaje.cantidadPersonas * tasas.avionPorPersonaKmUsd
            : metricas.distanciaKm * tasas.autoPorKmUsd;
    const categorias = {
        hospedaje: redondear(nochesPersonas * tasas.alojamientoPorPersonaNocheUsd),
        alimentacion: redondear(diasPersonas * tasas.comidaPorPersonaDiaUsd),
        transporte: redondear(transporte),
        actividades: redondear(diasPersonas * tasas.actividadesPorPersonaDiaUsd)
    };
    const total = redondear(Object.values(categorias).reduce((suma, item) => suma + item, 0));
    return { categorias, total };
};

const construirCalendario = (viaje, ciudades, diasPorCiudad) => {
    const dias = [];
    let diaActual = 0;
    for (let indiceCiudad = 0; indiceCiudad < ciudades.length; indiceCiudad++) {
        const ciudad = ciudades[indiceCiudad];
        const cantidadDias = diasPorCiudad[indiceCiudad];
        const fechaLlegada = fechaDesdeDia(viaje.fechaInicio, diaActual);
        for (let diaCiudad = 0; diaCiudad < cantidadDias; diaCiudad++) {
            const fecha = fechaDesdeDia(viaje.fechaInicio, diaActual);
            const traslado = diaCiudad === 0 && indiceCiudad > 0;
            dias.push({
                numero: diaActual + 1,
                fecha,
                ciudad: ciudad.nombre,
                tipo: traslado ? "traslado_y_estadia" : "estadia",
                ...(traslado ? { origen: ciudades[indiceCiudad - 1].nombre, destino: ciudad.nombre } : {})
            });
            diaActual++;
        }
        ciudad.fechaInicio = fechaLlegada;
        ciudad.fechaFin = fechaDesdeDia(viaje.fechaInicio, diaActual - 1);
        ciudad.dias = cantidadDias;
    }
    return dias;
};

const crearAlternativa = async (viaje, tipo, titulo, ciudades, peso) => {
    const orden = tipo === "mas_ahorro"
        ? ordenarPorProximidad(ciudades)
        : tipo === "mas_experiencias"
            ? ciudades.slice().sort((a, b) => (b.puntajeTuristico ?? 50) - (a.puntajeTuristico ?? 50))
            : ciudades.slice();
    const diasPorCiudad = repartirDias(viaje.duracionDias, orden, peso);
    const rutaReal = viaje.transportePreferido === "auto"
        ? await routingService.obtenerRutaEnAuto(orden)
        : null;
    const metricas = metricaRuta(orden, viaje.transportePreferido);
    if (rutaReal) {
        metricas.distanciaKm = rutaReal.distanciaKm;
        metricas.duracionHoras = rutaReal.duracionHoras;
    }
    const costos = calcularCostos(viaje, metricas);
    const calendario = construirCalendario(viaje, orden, diasPorCiudad);
    const diasCiudades = orden.map((ciudad) => ({
        nombre: ciudad.nombre,
        pais: ciudad.pais,
        latitud: ciudad.latitud,
        longitud: ciudad.longitud,
        puntajeTuristico: ciudad.puntajeTuristico ?? 50,
        fechaInicio: ciudad.fechaInicio,
        fechaFin: ciudad.fechaFin,
        dias: ciudad.dias
    }));
    const puntajeTuristico = redondear(orden.reduce((suma, ciudad, indice) =>
        suma + (ciudad.puntajeTuristico ?? 50) * diasPorCiudad[indice], 0) / viaje.duracionDias, 1);

    return {
        id: randomUUID(),
        tipo,
        titulo,
        recomendada: false,
        ciudades: diasCiudades,
        calendario,
        metricas: {
            distanciaTotalKm: redondear(metricas.distanciaKm, 1),
            tiempoTrasladosHoras: redondear(metricas.duracionHoras, 1),
            cantidadTraslados: metricas.cantidadTraslados,
            puntajeTuristico
        },
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
            : "Coordenadas aproximadas de GeoDB Cities",
        metodoRuta: rutaReal ? "openrouteservice" : "aproximacion_geografica",
        geometria: rutaReal?.geometria || {
            type: "LineString",
            coordinates: orden.map((ciudad) => [ciudad.longitud, ciudad.latitud])
        },
        esEstimacion: true,
        notas: [
            rutaReal
                ? "Para auto, la distancia y el tiempo siguen una ruta vial de OpenRouteService."
                : "La distancia une coordenadas en línea aproximada; no es una ruta de navegación.",
            "Tiempos y costos usan parámetros configurables del backend; no son cotizaciones ni disponibilidad en tiempo real.",
            "El puntaje turístico es referencial hasta integrar una fuente de atractivos."
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

    const alternativas = [];
    alternativas.push(await crearAlternativa(viaje, "mas_ahorro", "Más ahorro", viaje.ciudades, () => 1));
    alternativas.push(await crearAlternativa(viaje, "equilibrada", "Equilibrada", viaje.ciudades,
        (ciudad) => ciudad.puntajeTuristico ?? 50));
    alternativas.push(await crearAlternativa(viaje, "mas_experiencias", "Más experiencias", viaje.ciudades,
        (ciudad) => (ciudad.puntajeTuristico ?? 50) ** 1.5));

    const minCosto = Math.min(...alternativas.map((item) => item.presupuesto.totalEstimado));
    const maxCosto = Math.max(...alternativas.map((item) => item.presupuesto.totalEstimado));
    for (const alternativa of alternativas) {
        const ahorro = maxCosto === minCosto
            ? 50
            : (maxCosto - alternativa.presupuesto.totalEstimado) / (maxCosto - minCosto) * 100;
        const prioridades = viaje.prioridades || { ahorro: 60, atractivos: 40 };
        alternativa.puntaje = redondear(
            ahorro * prioridades.ahorro / 100
            + alternativa.metricas.puntajeTuristico * prioridades.atractivos / 100,
            1
        );
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
