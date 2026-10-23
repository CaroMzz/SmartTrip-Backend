/**
 * PRUEBAS UNITARIAS - destinoService
 *
 * Prueba la búsqueda y detalle de destinos turísticos:
 * - buscar (delega en catalogoDestinos)
 * - listarPaises (delega en catalogoDestinos)
 * - obtener destino local por idExterno
 * - error 404 si el destino no existe
 */

jest.mock("../services/wikidataService", () => ({
    obtenerAtractivos: jest.fn().mockResolvedValue([])
}));

const destinoService = require("../services/destinoService");
const AppError = require("../services/appError");

describe("destinoService", () => {
    describe("buscar", () => {
        it("debería devolver ciudades que coincidan con la búsqueda", async () => {
            const resultados = await destinoService.buscar("Madrid");
            expect(resultados.length).toBeGreaterThanOrEqual(1);
            expect(resultados[0]).toMatchObject({
                nombre: "Madrid",
                pais: "Espana"
            });
        });

        it("debería permitir filtrar por lista de códigos de país", async () => {
            const resultados = await destinoService.buscar("", ["AR"]);
            expect(resultados.length).toBeGreaterThanOrEqual(1);
            expect(resultados.every((c) => c.codigoPais === "AR")).toBe(true);
        });
    });

    describe("listarPaises", () => {
        it("debería listar países disponibles", async () => {
            const paises = await destinoService.listarPaises("Arg");
            expect(paises.length).toBeGreaterThanOrEqual(1);
            expect(paises[0]).toMatchObject({
                nombre: "Argentina",
                codigo: "AR"
            });
        });
    });

    describe("obtener", () => {
        it("debería obtener el detalle completo de un destino local existente", async () => {
            const resultado = await destinoService.obtener("local-ES-madrid");

            expect(resultado).toMatchObject({
                idExterno: "local-ES-madrid",
                nombre: "Madrid",
                pais: "Espana",
                codigoPais: "ES"
            });
            expect(resultado).toHaveProperty("latitud");
            expect(resultado).toHaveProperty("longitud");
            expect(resultado).toHaveProperty("atractivos");
            expect(resultado).toHaveProperty("fotos");
        });

        it("debería lanzar 400 si el identificador contiene caracteres no permitidos", async () => {
            await expect(destinoService.obtener("id!invalido#")).rejects.toMatchObject({
                status: 400,
                message: "El identificador del destino no es válido"
            });
        });

        it("debería lanzar 503 si el destino no es local y no está configurada la API key de GeoDB", async () => {
            await expect(destinoService.obtener("geodb-12345")).rejects.toMatchObject({
                status: 503,
                message: "La búsqueda de destinos necesita configurar GEODB_RAPIDAPI_KEY"
            });
        });
    });
});
