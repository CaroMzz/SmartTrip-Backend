/**
 * PRUEBAS UNITARIAS - itinerarioService
 *
 * Prueba la generación y gestión de itinerarios:
 * - validaciones de requisitos previos (presupuesto, transporte, moneda, duración vs ciudades)
 * - validación de coordenadas en ciudades
 * - generación de las 3 alternativas (más ahorro, equilibrada, más experiencias)
 * - selección de alternativa y consulta de itinerario activo
 */

jest.mock("../repositories/viajeRepository");
jest.mock("../services/routingService");
jest.mock("../src/database/pool", () => ({ query: jest.fn() }));

const repository = require("../repositories/viajeRepository");
const routingService = require("../services/routingService");
const itinerarioService = require("../services/itinerarioService");
const AppError = require("../services/appError");

describe("itinerarioService", () => {
    const usuarioId = "user-123";
    const viajeId = "viaje-456";

    const viajeMock = {
        id: viajeId,
        usuarioId,
        nombre: "Ruta Francesa",
        fechaInicio: "2026-07-01",
        duracionDias: 6,
        cantidadPersonas: 2,
        presupuestoTotal: 2000,
        moneda: "USD",
        transportePreferido: "tren",
        prioridades: { ahorro: 60, atractivos: 40 },
        ciudades: [
            { nombre: "Paris", pais: "Francia", latitud: 48.8566, longitud: 2.3522, puntajeTuristico: 90 },
            { nombre: "Niza", pais: "Francia", latitud: 43.7102, longitud: 7.2620, puntajeTuristico: 80 }
        ],
        itinerarios: [],
        itinerarioSeleccionadoId: null
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("generar", () => {
        it("debería lanzar 404 si el viaje no existe", async () => {
            repository.buscarPorUsuario.mockResolvedValue(null);

            await expect(itinerarioService.generar(usuarioId, "inexistente")).rejects.toMatchObject({
                status: 404,
                message: "No se encontró el viaje"
            });
        });

        it("debería lanzar 409 si falta presupuesto o transporte preferido", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                presupuestoTotal: null
            });

            await expect(itinerarioService.generar(usuarioId, viajeId)).rejects.toMatchObject({
                status: 409,
                message: "Completá el presupuesto y el transporte antes de generar alternativas"
            });
        });

        it("debería lanzar 422 si la moneda es distinta de USD", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                moneda: "EUR"
            });

            await expect(itinerarioService.generar(usuarioId, viajeId)).rejects.toMatchObject({
                status: 422,
                message: "Las estimaciones actuales están disponibles solo en USD"
            });
        });

        it("debería lanzar 422 si la duración es menor que la cantidad de ciudades", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                duracionDias: 1, // 1 día para 2 ciudades no alcanza
                ciudades: [
                    { nombre: "Paris", latitud: 48.85, longitud: 2.35 },
                    { nombre: "Niza", latitud: 43.71, longitud: 7.26 }
                ]
            });

            await expect(itinerarioService.generar(usuarioId, viajeId)).rejects.toMatchObject({
                status: 422,
                message: "La duración debe permitir al menos un día por ciudad obligatoria"
            });
        });

        it("debería lanzar 422 si alguna ciudad no tiene coordenadas geográficas", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                ciudades: [
                    { nombre: "Paris", latitud: 48.85, longitud: 2.35 },
                    { nombre: "CiudadSinCoords", latitud: null, longitud: null }
                ]
            });

            await expect(itinerarioService.generar(usuarioId, viajeId)).rejects.toMatchObject({
                status: 422,
                message: "Faltan coordenadas para generar el recorrido"
            });
        });

        it("debería generar 3 alternativas, ordenar por puntaje y marcar la recomendada", async () => {
            repository.buscarPorUsuario.mockResolvedValue(viajeMock);
            repository.guardarItinerarios.mockImplementation(async (vId, uId, alternativas) => ({
                ...viajeMock,
                itinerarios: alternativas
            }));

            const itinerarios = await itinerarioService.generar(usuarioId, viajeId);

            expect(itinerarios).toHaveLength(3);
            const tipos = itinerarios.map((i) => i.tipo);
            expect(tipos).toEqual(expect.arrayContaining(["mas_ahorro", "equilibrada", "mas_experiencias"]));

            // Al menos uno y solo el primero tras ordenar debe ser recomendado
            const recomendados = itinerarios.filter((i) => i.recomendada === true);
            expect(recomendados).toHaveLength(1);
            expect(itinerarios[0].recomendada).toBe(true);

            // Cada alternativa debe tener calendario y presupuesto calculado
            expect(itinerarios[0].calendario.length).toBe(viajeMock.duracionDias);
            expect(itinerarios[0].presupuesto).toHaveProperty("totalEstimado");
            expect(itinerarios[0].presupuesto).toHaveProperty("categorias");
        });

        it("debería consultar routingService cuando el transporte es en auto", async () => {
            const viajeAuto = {
                ...viajeMock,
                transportePreferido: "auto"
            };
            repository.buscarPorUsuario.mockResolvedValue(viajeAuto);
            routingService.obtenerRutaEnAuto.mockResolvedValue({
                distanciaKm: 950,
                duracionHoras: 9.5,
                geometria: { type: "LineString", coordinates: [] }
            });
            repository.guardarItinerarios.mockImplementation(async (vId, uId, alternativas) => ({
                ...viajeAuto,
                itinerarios: alternativas
            }));

            await itinerarioService.generar(usuarioId, viajeId);

            expect(routingService.obtenerRutaEnAuto).toHaveBeenCalled();
        });
    });

    describe("listar", () => {
        it("debería devolver la lista de itinerarios generados", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                itinerarios: [{ id: "itin-1", titulo: "Opción 1" }]
            });

            const resultado = await itinerarioService.listar(usuarioId, viajeId);
            expect(resultado).toHaveLength(1);
            expect(resultado[0]).toHaveProperty("id", "itin-1");
        });

        it("debería lanzar 404 si el viaje no existe", async () => {
            repository.buscarPorUsuario.mockResolvedValue(null);

            await expect(itinerarioService.listar(usuarioId, "viaje-desconocido")).rejects.toMatchObject({
                status: 404
            });
        });
    });

    describe("seleccionar", () => {
        it("debería seleccionar un itinerario existente y devolverlo", async () => {
            const itinerarioElegido = { id: "itin-1", titulo: "Elegido" };
            repository.seleccionarItinerario.mockResolvedValue({
                ...viajeMock,
                itinerarioSeleccionadoId: "itin-1",
                itinerarios: [itinerarioElegido]
            });

            const resultado = await itinerarioService.seleccionar(usuarioId, viajeId, "itin-1");
            expect(resultado).toMatchObject(itinerarioElegido);
            expect(repository.seleccionarItinerario).toHaveBeenCalledWith(viajeId, usuarioId, "itin-1");
        });

        it("debería lanzar 400 si el id del itinerario no es string válido", async () => {
            await expect(itinerarioService.seleccionar(usuarioId, viajeId, null)).rejects.toMatchObject({
                status: 400
            });
        });

        it("debería lanzar 404 si no se encontró el viaje o el itinerario", async () => {
            repository.seleccionarItinerario.mockResolvedValue(null);

            await expect(itinerarioService.seleccionar(usuarioId, viajeId, "itin-inexistente")).rejects.toMatchObject({
                status: 404
            });
        });
    });

    describe("obtenerSeleccionado", () => {
        it("debería devolver el itinerario seleccionado actualmente", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                itinerarioSeleccionadoId: "itin-2",
                itinerarios: [
                    { id: "itin-1", titulo: "Opción 1" },
                    { id: "itin-2", titulo: "Opción 2" }
                ]
            });

            const resultado = await itinerarioService.obtenerSeleccionado(usuarioId, viajeId);
            expect(resultado).toHaveProperty("id", "itin-2");
            expect(resultado).toHaveProperty("titulo", "Opción 2");
        });

        it("debería lanzar 409 si todavía no se seleccionó ninguna alternativa", async () => {
            repository.buscarPorUsuario.mockResolvedValue({
                ...viajeMock,
                itinerarioSeleccionadoId: null
            });

            await expect(itinerarioService.obtenerSeleccionado(usuarioId, viajeId)).rejects.toMatchObject({
                status: 409,
                message: "Primero elegí una alternativa de itinerario"
            });
        });
    });
});
