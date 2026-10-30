/**
 * PRUEBAS UNITARIAS - viajeService
 *
 * En este test probamos todas las operaciones sobre viajes:
 * - crear (validaciones de campos requeridos, ciudades, fechas, duraciones, etc.)
 * - listar (recorrido y vista pública)
 * - obtener (existente vs 404)
 * - actualizar (campos permitidos, actualización en borrador)
 * - configurar (actualización parcial de preferencias)
 * - borrar (éxito vs 404)
 */

jest.mock("../repositories/viajeRepository");
jest.mock("../src/database/pool", () => ({ query: jest.fn() }));

const repository = require("../repositories/viajeRepository");
const destinoService = require("../services/destinoService");
const viajeService = require("../services/viajeService");
const AppError = require("../services/appError");

describe("viajeService", () => {
    const usuarioId = "user-123";
    const viajeBaseMock = {
        id: "viaje-1",
        usuarioId,
        nombre: "Eurotrip 2026",
        paises: ["Francia", "Espana"],
        ciudades: [
            { nombre: "Paris", pais: "Francia", latitud: 48.8566, longitud: 2.3522, orden: 0, puntajeTuristico: null },
            { nombre: "Madrid", pais: "Espana", latitud: 40.4168, longitud: -3.7038, orden: 1, puntajeTuristico: null }
        ],
        fechaInicio: "2026-05-10",
        duracionDias: 15,
        cantidadPersonas: 2,
        presupuestoTotal: 3000,
        moneda: "EUR",
        transportePreferido: "tren",
        prioridades: { ahorro: 50, atractivos: 50 },
        estado: "borrador",
        itinerarios: [],
        itinerarioSeleccionadoId: null,
        creadoEn: "2026-01-01T00:00:00.000Z",
        actualizadoEn: "2026-01-01T00:00:00.000Z"
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("crear", () => {
        const datosValidos = {
            nombre: "Vacaciones en Europa",
            paises: ["Francia", "Espana"],
            ciudadesObligatorias: ["Paris", "Madrid"],
            fechaInicio: "2027-06-01",
            duracionDias: 10,
            cantidadPersonas: 2,
            presupuestoTotal: 2500,
            moneda: "USD",
            transportePreferido: "tren",
            prioridades: { ahorro: 60, atractivos: 40 }
        };

        it("debería crear un viaje exitosamente cuando los datos son válidos", async () => {
            repository.crear.mockResolvedValue({
                ...viajeBaseMock,
                nombre: datosValidos.nombre,
                fechaInicio: datosValidos.fechaInicio,
                duracionDias: 10
            });

            const resultado = await viajeService.crear(usuarioId, datosValidos);

            expect(resultado).toHaveProperty("id", "viaje-1");
            expect(resultado).toHaveProperty("nombre", "Vacaciones en Europa");
            expect(resultado).toHaveProperty("fechaFin", "2027-06-10"); // 10 días desde el 2027-06-01
            expect(repository.crear).toHaveBeenCalledTimes(1);
        });

        it("debería rechazar si contiene campos no permitidos", async () => {
            const datosConExtra = {
                ...datosValidos,
                campoInvalido: "hack"
            };

            await expect(viajeService.crear(usuarioId, datosConExtra)).rejects.toThrow(AppError);
            await expect(viajeService.crear(usuarioId, datosConExtra)).rejects.toMatchObject({
                status: 400,
                message: "El viaje contiene campos no permitidos"
            });
        });

        it("debería fallar si faltan campos obligatorios", async () => {
            const datosIncompletos = {
                nombre: "Incompleto"
            };

            await expect(viajeService.crear(usuarioId, datosIncompletos)).rejects.toMatchObject({
                status: 400,
                message: "Hay errores en los datos enviados"
            });
        });

        it("debería aceptar un viaje con una sola ciudad (el alcance pide al menos un destino)", async () => {
            repository.crear.mockImplementation(async (viaje) => ({ ...viaje, id: "viaje-2" }));

            const resultado = await viajeService.crear(usuarioId, { ...datosValidos, paises: ["Francia"], ciudadesObligatorias: ["Paris"] });

            expect(resultado.ciudadesObligatorias).toHaveLength(1);
            expect(resultado.ciudadesObligatorias[0]).toMatchObject({ nombre: "Paris", idExterno: "local-FR-paris" });
        });

        it("debería fallar si no hay ciudades", async () => {
            await expect(viajeService.crear(usuarioId, { ...datosValidos, ciudadesObligatorias: [] })).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({
                    ciudadesObligatorias: "Indicá entre 1 y 20 ciudades obligatorias"
                })
            });
        });

        it("debería rechazar una ciudad inexistente aunque traiga coordenadas (DEF-21)", async () => {
            const porNombre = jest.spyOn(destinoService, "verificarCiudadPorNombre").mockResolvedValue(null);
            const datos = {
                ...datosValidos,
                ciudadesObligatorias: [
                    { nombre: "Xyzabc", pais: "Espana", latitud: 40.1, longitud: -3.1 },
                    { nombre: "Madrid", pais: "Espana", latitud: 40.4168, longitud: -3.7038 }
                ]
            };

            await expect(viajeService.crear(usuarioId, datos)).rejects.toMatchObject({
                status: 422,
                detalles: expect.objectContaining({
                    ciudadesObligatorias: expect.stringContaining("Xyzabc")
                })
            });
            expect(porNombre).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Xyzabc", latitud: 40.1 }));
            expect(repository.crear).not.toHaveBeenCalled();
            porNombre.mockRestore();
        });

        it("debería aceptar una ciudad real fuera del catálogo verificada por nombre en OpenStreetMap", async () => {
            const porNombre = jest.spyOn(destinoService, "verificarCiudadPorNombre").mockResolvedValue({
                idExterno: "osm-R-344953", nombre: "València", pais: "Espana", codigoPais: "ES", latitud: 39.4697, longitud: -0.3763, wikiDataId: null
            });
            repository.crear.mockImplementation(async (viaje) => ({ ...viaje, id: "viaje-6" }));

            const resultado = await viajeService.crear(usuarioId, {
                ...datosValidos,
                ciudadesObligatorias: ["Madrid", { nombre: "Valencia", pais: "España", latitud: 39.4699, longitud: -0.3763 }]
            });

            expect(resultado.ciudadesObligatorias[1]).toMatchObject({
                idExterno: "osm-R-344953", nombre: "Valencia", pais: "Espana", latitud: 39.4699
            });
            porNombre.mockRestore();
        });

        it("debería rechazar un país que no está en el catálogo", async () => {
            await expect(viajeService.crear(usuarioId, { ...datosValidos, paises: ["Narnia"] })).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({ paises: expect.stringContaining("Narnia") })
            });
        });

        it("debería usar los datos del catálogo cuando la ciudad llega con su id local", async () => {
            repository.crear.mockImplementation(async (viaje) => ({ ...viaje, id: "viaje-3" }));

            const resultado = await viajeService.crear(usuarioId, {
                ...datosValidos,
                ciudadesObligatorias: [{ idExterno: "local-FR-paris", nombre: "París", latitud: 1, longitud: 1 }, "Madrid"]
            });

            expect(resultado.ciudadesObligatorias[0]).toMatchObject({ nombre: "Paris", pais: "Francia", latitud: 48.8566 });
        });

        it("debería verificar en OpenStreetMap una ciudad externa y guardar sus datos verificados", async () => {
            const verificar = jest.spyOn(destinoService, "verificarCiudadExterna").mockResolvedValue({
                idExterno: "osm-R-3399642", nombre: "Tandil", pais: "Argentina", codigoPais: "AR",
                latitud: -37.3282887, longitud: -59.1356957, wikiDataId: null
            });
            repository.crear.mockImplementation(async (viaje) => ({ ...viaje, id: "viaje-4" }));

            const resultado = await viajeService.crear(usuarioId, {
                ...datosValidos,
                paises: ["Argentina"],
                ciudadesObligatorias: [{ idExterno: "osm-R-3399642", nombre: "tandil", pais: "Argentina", latitud: -37.3, longitud: -59.1 }]
            });

            expect(verificar).toHaveBeenCalledTimes(1);
            expect(resultado.ciudadesObligatorias[0]).toMatchObject({ nombre: "Tandil", latitud: -37.3282887 });
            verificar.mockRestore();
        });

        it("debería responder 422 si la ciudad externa no existe en OpenStreetMap", async () => {
            const verificar = jest.spyOn(destinoService, "verificarCiudadExterna").mockResolvedValue(null);

            await expect(viajeService.crear(usuarioId, {
                ...datosValidos,
                paises: ["Argentina"],
                ciudadesObligatorias: [{ idExterno: "osm-N-1", nombre: "Inventada", pais: "Argentina", latitud: -37, longitud: -59 }]
            })).rejects.toMatchObject({ status: 422 });
            expect(repository.crear).not.toHaveBeenCalled();
            verificar.mockRestore();
        });

        it("debería rechazar una fecha de inicio anterior a hoy", async () => {
            await expect(viajeService.crear(usuarioId, { ...datosValidos, fechaInicio: "2020-01-01" })).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({ fechaInicio: "La fecha de inicio no puede ser anterior a hoy" })
            });
        });

        it("debería aceptar nombres de hasta 150 caracteres y rechazar los más largos", async () => {
            repository.crear.mockImplementation(async (viaje) => ({ ...viaje, id: "viaje-5" }));

            await expect(viajeService.crear(usuarioId, { ...datosValidos, nombre: "a".repeat(150) })).resolves.toHaveProperty("nombre", "a".repeat(150));
            await expect(viajeService.crear(usuarioId, { ...datosValidos, nombre: "a".repeat(151) })).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({ nombre: "El nombre es obligatorio y admite hasta 150 caracteres" })
            });
        });

        it("debería fallar si se repiten ciudades en la lista", async () => {
            const datosCiudadesRepetidas = {
                ...datosValidos,
                ciudadesObligatorias: ["Paris", "Paris"]
            };

            await expect(viajeService.crear(usuarioId, datosCiudadesRepetidas)).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({
                    ciudadesObligatorias: "No repitas ciudades en el recorrido"
                })
            });
        });

        it("debería fallar si las prioridades no suman 100", async () => {
            const datosPrioridadesMal = {
                ...datosValidos,
                prioridades: { ahorro: 50, atractivos: 30 } // suma 80
            };

            await expect(viajeService.crear(usuarioId, datosPrioridadesMal)).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({
                    prioridades: "Las prioridades deben sumar 100 (suman 80)"
                })
            });
        });

        it("debería fallar si la fecha de inicio no tiene formato AAAA-MM-DD", async () => {
            const datosFechaInvalida = {
                ...datosValidos,
                fechaInicio: "01/06/2026"
            };

            await expect(viajeService.crear(usuarioId, datosFechaInvalida)).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({
                    fechaInicio: "Usá una fecha válida con formato AAAA-MM-DD"
                })
            });
        });
    });

    describe("listar", () => {
        it("debería retornar la lista de viajes del usuario formateados", async () => {
            const viajeConItinerario = {
                ...viajeBaseMock,
                itinerarioSeleccionadoId: "itin-1",
                itinerarios: [
                    { id: "itin-1", presupuesto: { totalEstimado: 1200 } }
                ]
            };
            repository.listarPorUsuario.mockResolvedValue([viajeConItinerario]);

            const resultado = await viajeService.listar(usuarioId);

            expect(resultado).toHaveLength(1);
            expect(resultado[0]).toHaveProperty("id", "viaje-1");
            expect(resultado[0]).toHaveProperty("costoEstimado", 1200);
            expect(resultado[0].itinerarios).toBeUndefined(); // se remueve en la vista resumida
        });
    });

    describe("obtener", () => {
        it("debería devolver el viaje si existe y pertenece al usuario", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);

            const resultado = await viajeService.obtener(usuarioId, "viaje-1");

            expect(resultado).toHaveProperty("id", "viaje-1");
            expect(resultado).toHaveProperty("nombre", "Eurotrip 2026");
        });

        it("debería lanzar error 404 si el viaje no existe", async () => {
            repository.buscarPorUsuario.mockResolvedValue(null);

            await expect(viajeService.obtener(usuarioId, "inexistente")).rejects.toMatchObject({
                status: 404,
                message: "No se encontró el viaje"
            });
        });
    });

    describe("actualizar", () => {
        it("debería actualizar los datos del viaje y ponerlo en borrador", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);
            repository.guardar.mockImplementation(async (datos) => datos);

            const cambios = {
                nombre: "Eurotrip Renovado",
                duracionDias: 20
            };

            const resultado = await viajeService.actualizar(usuarioId, "viaje-1", cambios);

            expect(resultado.nombre).toBe("Eurotrip Renovado");
            expect(resultado.duracionDias).toBe(20);
            expect(resultado.estado).toBe("borrador");
            expect(repository.guardar).toHaveBeenCalled();
        });

        it("debería reescribir solo los datos básicos cuando cambia el nombre (DEF-29)", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);
            repository.guardar.mockImplementation(async (datos) => datos);

            await viajeService.actualizar(usuarioId, "viaje-1", {
                nombre: "Solo el nombre",
                paises: ["Francia", "Espana"],
                ciudadesObligatorias: ["Paris", "Madrid"],
                fechaInicio: viajeBaseMock.fechaInicio
            });

            expect(repository.guardar).toHaveBeenCalledWith(
                expect.objectContaining({ nombre: "Solo el nombre", itinerarios: [], estado: "borrador" }),
                { ruta: false, preferencias: false, transporte: false }
            );
        });

        it("debería reescribir países y ciudades cuando cambia el recorrido", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);
            repository.guardar.mockImplementation(async (datos) => datos);

            await viajeService.actualizar(usuarioId, "viaje-1", { ciudadesObligatorias: ["Paris", "Barcelona"] });

            expect(repository.guardar.mock.calls[0][1]).toMatchObject({ ruta: true, preferencias: false });
        });

        it("debería permitir editar un viaje ya iniciado si no cambia la fecha, pero no moverlo al pasado", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);
            repository.guardar.mockImplementation(async (datos) => datos);

            await expect(viajeService.actualizar(usuarioId, "viaje-1", { nombre: "Ya empezó", fechaInicio: viajeBaseMock.fechaInicio }))
                .resolves.toHaveProperty("nombre", "Ya empezó");
            await expect(viajeService.actualizar(usuarioId, "viaje-1", { fechaInicio: "2026-01-02" })).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({ fechaInicio: "La fecha de inicio no puede ser anterior a hoy" })
            });
        });

        it("debería devolver los países con su código para la edición", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);

            const resultado = await viajeService.obtener(usuarioId, "viaje-1");

            expect(resultado.paisesDetalle).toEqual([{ nombre: "Francia", codigo: "FR" }, { nombre: "Espana", codigo: "ES" }]);
        });

        it("debería lanzar 404 si el viaje a actualizar no existe", async () => {
            repository.buscarPorUsuario.mockResolvedValue(null);

            await expect(
                viajeService.actualizar(usuarioId, "viaje-inexistente", { nombre: "Test" })
            ).rejects.toMatchObject({
                status: 404
            });
        });
    });

    describe("configurar", () => {
        it("debería permitir actualizar solo preferencias (presupuesto, transporte, etc.)", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);
            repository.guardar.mockImplementation(async (datos) => datos);

            const configuracion = {
                presupuestoTotal: 4500,
                transportePreferido: "auto"
            };

            const resultado = await viajeService.configurar(usuarioId, "viaje-1", configuracion);

            expect(resultado.presupuestoTotal).toBe(4500);
            expect(resultado.transportePreferido).toBe("auto");
            expect(repository.guardar.mock.calls[0][1]).toEqual({ ruta: false, preferencias: false, transporte: true });
        });

        it("debería fallar si se envían campos ajenos a la configuración", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeBaseMock);

            const invalido = {
                presupuestoTotal: 4500,
                nombre: "Intentando cambiar nombre acá"
            };

            await expect(viajeService.configurar(usuarioId, "viaje-1", invalido)).rejects.toMatchObject({
                status: 400,
                message: "La configuración contiene campos no permitidos"
            });
        });
    });

    describe("borrar", () => {
        it("debería eliminar el viaje correctamente", async () => {
            repository.eliminar.mockResolvedValue(true);

            await expect(viajeService.borrar(usuarioId, "viaje-1")).resolves.toBeUndefined();
            expect(repository.eliminar).toHaveBeenCalledWith("viaje-1", usuarioId);
        });

        it("debería lanzar 404 si el viaje no existe para borrar", async () => {
            repository.eliminar.mockResolvedValue(false);

            await expect(viajeService.borrar(usuarioId, "viaje-1")).rejects.toMatchObject({
                status: 404,
                message: "No se encontró el viaje"
            });
        });
    });
});
