/**
 * PRUEBAS UNITARIAS - catalogoDestinos
 *
 * Prueba el catálogo en memoria de destinos turísticos:
 * - normalización de texto (elimina tildes, caracteres especiales, mayúsculas)
 * - listado y filtrado de países
 * - búsqueda flexible de ciudades por texto y código ISO
 * - resolución exacta o aproximada de ciudad y país
 */

const catalogoDestinos = require("../services/catalogoDestinos");

describe("catalogoDestinos", () => {
    describe("normalizar", () => {
        it("debería convertir a minúsculas y quitar tildes", () => {
            expect(catalogoDestinos.normalizar("París")).toBe("paris");
            expect(catalogoDestinos.normalizar("MÉXICO")).toBe("mexico");
            expect(catalogoDestinos.normalizar("São Paulo")).toBe("sao paulo");
        });

        it("debería reemplazar signos y caracteres no alfanuméricos por espacios limpios", () => {
            expect(catalogoDestinos.normalizar("Fira (Santorini)")).toBe("fira santorini");
            expect(catalogoDestinos.normalizar("George Town - Penang")).toBe("george town penang");
        });

        it("debería manejar null o undefined sin romper", () => {
            expect(catalogoDestinos.normalizar(null)).toBe("");
            expect(catalogoDestinos.normalizar(undefined)).toBe("");
        });
    });

    describe("listarPaises", () => {
        it("debería devolver todos los países del catálogo sin duplicados", () => {
            const paises = catalogoDestinos.listarPaises();
            expect(paises.length).toBeGreaterThan(10);
            
            // Verificar que no hay códigos repetidos
            const codigos = paises.map((p) => p.codigo);
            expect(new Set(codigos).size).toBe(codigos.length);
        });

        it("debería filtrar países según el término de búsqueda", () => {
            const resultado = catalogoDestinos.listarPaises("fran");
            expect(resultado).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ nombre: "Francia", codigo: "FR" })
                ])
            );
        });

        it("debería devolver array vacío si no hay coincidencias", () => {
            const resultado = catalogoDestinos.listarPaises("pais_inexistente_xyz");
            expect(resultado).toEqual([]);
        });
    });

    describe("obtenerPais", () => {
        it("debería encontrar país por su nombre (con o sin tilde)", () => {
            const espana = catalogoDestinos.obtenerPais("España");
            expect(espana).toMatchObject({ nombre: "Espana", codigo: "ES" });

            const espanaSinTilde = catalogoDestinos.obtenerPais("Espana");
            expect(espanaSinTilde).toMatchObject({ codigo: "ES" });
        });

        it("debería encontrar país por código ISO de 2 o 3 letras", () => {
            expect(catalogoDestinos.obtenerPais("FR")).toMatchObject({ nombre: "Francia" });
            expect(catalogoDestinos.obtenerPais("fra")).toMatchObject({ nombre: "Francia" });
            expect(catalogoDestinos.obtenerPais("ARG")).toMatchObject({ nombre: "Argentina" });
        });

        it("debería retornar null si el país no existe", () => {
            expect(catalogoDestinos.obtenerPais("Narnia")).toBeNull();
        });
    });

    describe("buscarCiudades", () => {
        it("debería buscar ciudades por nombre parcial o completo", () => {
            const ciudades = catalogoDestinos.buscarCiudades("barce");
            expect(ciudades.length).toBeGreaterThanOrEqual(1);
            expect(ciudades[0]).toMatchObject({ nombre: "Barcelona", pais: "Espana" });
        });

        it("debería permitir filtrar por lista de códigos de país", () => {
            const ciudades = catalogoDestinos.buscarCiudades("", ["FR"]);
            expect(ciudades.length).toBeGreaterThanOrEqual(2);
            expect(ciudades.every((c) => c.codigoPais === "FR")).toBe(true);
        });
    });

    describe("buscarCiudad", () => {
        it("debería encontrar una ciudad específica con sus coordenadas", () => {
            const paris = catalogoDestinos.buscarCiudad("Paris");
            expect(paris).toMatchObject({
                nombre: "Paris",
                pais: "Francia",
                latitud: 48.8566,
                longitud: 2.3522
            });
        });

        it("debería resolver ciudad desambiguando por país", () => {
            const roma = catalogoDestinos.buscarCiudad("Roma", "Italia");
            expect(roma).toMatchObject({ nombre: "Roma", pais: "Italia" });
        });

        it("debería devolver null si la ciudad no existe en el catálogo", () => {
            expect(catalogoDestinos.buscarCiudad("CiudadFantasma123")).toBeNull();
        });
    });

    describe("obtenerCiudad", () => {
        it("debería encontrar la ciudad por su idExterno generado", () => {
            const ciudad = catalogoDestinos.obtenerCiudad("local-FR-paris");
            expect(ciudad).toMatchObject({ nombre: "Paris", codigoPais: "FR" });
        });

        it("debería devolver null si el idExterno no existe", () => {
            expect(catalogoDestinos.obtenerCiudad("local-XX-inexistente")).toBeNull();
        });
    });
});
