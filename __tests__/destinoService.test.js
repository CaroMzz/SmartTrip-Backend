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
jest.mock("../repositories/destinoRepository", () => ({
    obtenerFicha: jest.fn().mockResolvedValue(null)
}));
jest.mock("../src/database/pool", () => ({ query: jest.fn() }));
jest.mock("../services/fichaDestinoService", () => ({
    construirFicha: jest.fn().mockResolvedValue({ ficha: null, avisos: [] })
}));

const destinoService = require("../services/destinoService");
const AppError = require("../services/appError");

const respuesta = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo });
const featurePhoton = (osmId, nombre, pais, codigo, lon, lat) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { osm_type: "R", osm_id: osmId, name: nombre, country: pais, countrycode: codigo, state: "Provincia" }
});

describe("destinoService", () => {
    beforeEach(() => {
        // Sin red en las pruebas: por defecto los servicios externos no responden.
        global.fetch = jest.fn().mockRejectedValue(new Error("sin red"));
    });

    describe("buscar con OpenStreetMap (DEF-22)", () => {
        it("debería completar con ciudades de Photon cuando el catálogo no alcanza", async () => {
            global.fetch.mockResolvedValueOnce(respuesta({
                features: [
                    featurePhoton(1, "Valencia", "España", "ES", -0.3763, 39.4699),
                    featurePhoton(2, "Valencia", "Venezuela", "VE", -68.0, 10.16)
                ]
            }));

            const resultados = await destinoService.buscar("Valencia", ["ES"]);

            expect(resultados).toHaveLength(1);
            expect(resultados[0]).toMatchObject({
                idExterno: "osm-R-1", nombre: "Valencia", pais: "Espana", codigoPais: "ES", fuente: "Photon / OpenStreetMap"
            });
            const url = new URL(global.fetch.mock.calls[0][0]);
            expect(url.hostname).toBe("photon.komoot.io");
            expect(url.searchParams.get("q")).toBe("Valencia");
        });

        it("debería descartar lugares de países fuera del catálogo y no repetir ciudades del catálogo", async () => {
            global.fetch.mockResolvedValueOnce(respuesta({
                features: [
                    featurePhoton(3, "Madrid", "España", "ES", -3.7038, 40.4168),
                    featurePhoton(4, "Madrid", "Estados Unidos", "ZZ", -100, 40)
                ]
            }));

            const resultados = await destinoService.buscar("Madrid");

            expect(resultados.map((ciudad) => ciudad.idExterno)).toEqual(["local-ES-madrid"]);
        });

        it("debería devolver el catálogo si Photon no responde", async () => {
            const resultados = await destinoService.buscar("Rosar", ["AR"]);
            expect(resultados).toEqual([]);
        });
    });

    describe("verificarCiudadExterna (DEF-21)", () => {
        it("debería reconocer una ciudad que vino de una búsqueda reciente sin volver a consultar", async () => {
            global.fetch.mockResolvedValueOnce(respuesta({ features: [featurePhoton(5, "Rosario", "Argentina", "AR", -60.6393, -32.9468)] }));
            await destinoService.buscar("Rosario", ["AR"]);
            global.fetch.mockClear();

            const lugar = await destinoService.verificarCiudadExterna({ idExterno: "osm-R-5", nombre: "Rosario", pais: "Argentina" });

            expect(lugar).toMatchObject({ nombre: "Rosario", pais: "Argentina", latitud: -32.9468 });
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("debería buscar en Photon por id y devolver null si el lugar no existe", async () => {
            global.fetch.mockResolvedValueOnce(respuesta({ features: [featurePhoton(7, "Otra", "Argentina", "AR", -60, -33)] }));

            await expect(destinoService.verificarCiudadExterna({ idExterno: "osm-R-6", nombre: "Inventada", pais: "Argentina" }))
                .resolves.toBeNull();
        });
    });

    describe("verificarCiudadPorNombre (DEF-21)", () => {
        it("debería aceptar una ciudad real cercana a las coordenadas enviadas y rechazar una lejana o inexistente", async () => {
            global.fetch.mockResolvedValue(respuesta({ features: [featurePhoton(344953, "València", "España", "ES", -0.3763, 39.4697)] }));

            await expect(destinoService.verificarCiudadPorNombre({ nombre: "Valencia", pais: "España", latitud: 39.4699, longitud: -0.3763 }))
                .resolves.toMatchObject({ idExterno: "osm-R-344953", pais: "Espana" });
            await expect(destinoService.verificarCiudadPorNombre({ nombre: "Valencia", pais: "España", latitud: 40.4, longitud: -3.7 }))
                .resolves.toBeNull();
            await expect(destinoService.verificarCiudadPorNombre({ nombre: "Xyzabc", pais: "España", latitud: 40.1, longitud: -3.1 }))
                .resolves.toBeNull();
        });
    });

    describe("ficha de destino externo (DEF-33)", () => {
        it("debería tomar la descripción del artículo de la ciudad y los atractivos cercanos, no de una búsqueda libre", async () => {
            global.fetch.mockImplementation(async (url) => {
                const u = new URL(url);
                if (u.hostname === "photon.komoot.io") {
                    return respuesta({ features: [featurePhoton(3399642, "Tandil", "Argentina", "AR", -59.1356957, -37.3282887)] });
                }
                if (u.searchParams.get("titles") === "Tandil") {
                    return respuesta({ query: { pages: [{ pageid: 10, title: "Tandil", extract: "Tandil es una ciudad argentina del centro de la provincia de Buenos Aires.", fullurl: "https://es.wikipedia.org/wiki/Tandil", coordinates: [{ lat: -37.32, lon: -59.13 }] }] } });
                }
                if (u.searchParams.get("generator") === "geosearch") {
                    expect(u.searchParams.get("ggscoord")).toBe("-37.3282887|-59.1356957");
                    return respuesta({ query: { pages: [
                        { pageid: 10, index: 1, title: "Tandil", extract: "Ciudad", fullurl: "u1" },
                        { pageid: 11, index: 3, title: "Lago del Fuerte", extract: "Lago artificial de Tandil.", fullurl: "u2" },
                        { pageid: 12, index: 2, title: "Piedra Movediza", extract: "Roca que se balanceaba sobre el cerro.", fullurl: "u3" },
                        { pageid: 13, index: 4, title: "Partido de Tandil", extract: "Partido bonaerense.", fullurl: "u4" }
                    ] } });
                }
                return respuesta({}, 404);
            });

            const destino = await destinoService.obtener("osm-R-3399642", "Tandil", "Argentina");

            expect(destino.descripcion).toBe("Tandil es una ciudad argentina del centro de la provincia de Buenos Aires.");
            expect(destino.atractivos.map((a) => a.nombre)).toEqual(["Piedra Movediza", "Lago del Fuerte"]);
            expect(destino.fuenteGeografica).toBe("Photon / OpenStreetMap");
        });
    });

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
