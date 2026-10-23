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
            fechaInicio: "2026-06-01",
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
            expect(resultado).toHaveProperty("fechaFin", "2026-06-10"); // 10 días desde el 2026-06-01
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

        it("debería fallar si la lista de ciudades tiene menos de 2 destinos", async () => {
            const datosUnaCiudad = {
                ...datosValidos,
                ciudadesObligatorias: ["Paris"]
            };

            await expect(viajeService.crear(usuarioId, datosUnaCiudad)).rejects.toMatchObject({
                status: 400,
                detalles: expect.objectContaining({
                    ciudadesObligatorias: "Indicá entre 2 y 20 ciudades obligatorias"
                })
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
                    prioridades: "Las prioridades de ahorro y atractivos deben ser enteros que sumen 100"
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
            expect(repository.guardar).toHaveBeenCalled();
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
