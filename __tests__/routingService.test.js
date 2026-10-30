/**
 * PRUEBAS UNITARIAS - routingService
 *
 * Prueba la integración con OpenRouteService:
 * - cuando no hay API Key o hay menos de 2 ciudades
 * - cuando la API responde exitosamente con GeoJSON de ruta
 * - cuando la API falla o responde con código HTTP de error (debe atrapar el error y devolver null)
 */

jest.mock("../config", () => ({
    openRouteServiceApiKey: "fake_ors_api_key_123"
}));

const routingService = require("../services/routingService");

describe("routingService", () => {
    const ciudadesMock = [
        { nombre: "Madrid", latitud: 40.4168, longitud: -3.7038 },
        { nombre: "Barcelona", latitud: 41.3851, longitud: 2.1734 }
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        // Silenciar warnings de consola esperados durante pruebas de error
        jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        console.warn.mockRestore();
    });

    it("debería devolver null si se envían menos de 2 ciudades", async () => {
        const resultado = await routingService.obtenerRutaEnAuto([{ nombre: "Madrid", latitud: 40, longitud: -3 }]);
        expect(resultado).toBeNull();
    });

    it("debería procesar la respuesta de OpenRouteService cuando es exitosa", async () => {
        const respuestaFalsa = {
            features: [
                {
                    properties: {
                        summary: {
                            distance: 620000, // 620 km en metros
                            duration: 21600   // 6 horas en segundos
                        }
                    },
                    geometry: {
                        coordinates: [
                            [-3.7038, 40.4168],
                            [2.1734, 41.3851]
                        ]
                    }
                }
            ]
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => respuestaFalsa
        });

        const resultado = await routingService.obtenerRutaEnAuto(ciudadesMock);

        expect(resultado).not.toBeNull();
        expect(resultado).toHaveProperty("fuente", "OpenRouteService");
        expect(resultado.distanciaKm).toBe(620);
        expect(resultado.duracionHoras).toBe(6);
        expect(resultado.geometria.coordinates).toHaveLength(2);
    });

    it("debería devolver null si la API responde con un error HTTP", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500
        });

        const resultado = await routingService.obtenerRutaEnAuto(ciudadesMock);
        expect(resultado).toBeNull();
    });

    it("debería devolver null si fetch lanza una excepción (por ejemplo timeout o caída de red)", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("Network timeout"));

        const resultado = await routingService.obtenerRutaEnAuto(ciudadesMock);
        expect(resultado).toBeNull();
    });
});
