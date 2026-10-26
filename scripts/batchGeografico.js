// Batch de información geográfica (RF23 / RNF16).
// Recorre las ciudades del catálogo, consulta Wikipedia y Wikidata y guarda en la base la
// descripción, foto, puntaje turístico, días sugeridos y puntos de interés de cada una.
//
// Uso:
//   npm run batch:geo                         procesa todas las ciudades y guarda los resultados
//   npm run batch:geo -- --simular            consulta las APIs y muestra el resultado sin escribir en la base
//   npm run batch:geo -- --ciudades=Paris,Bariloche   procesa solo esas ciudades
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const envFile = join(__dirname, "..", ".env");
if (existsSync(envFile)) require("node:process").loadEnvFile?.(envFile);

const catalogo = require("../services/catalogoDestinos");
const fichaDestinoService = require("../services/fichaDestinoService");

const PROCESO = "batch_geografico";
// RNF16 fija un máximo de 10 minutos; se deja margen para cerrar el registro de ejecución.
const TIEMPO_MAXIMO_MS = 9.5 * 60 * 1000;
// Consultas simultáneas a Wikidata: más de dos suele provocar límites de uso.
const CONCURRENCIA = 2;

const simular = process.argv.includes("--simular");
const filtro = process.argv.find((arg) => arg.startsWith("--ciudades="))?.slice("--ciudades=".length)
    .split(",").map(catalogo.normalizar).filter(Boolean);

const ciudades = catalogo.ciudades.filter((ciudad) => !filtro || filtro.includes(catalogo.normalizar(ciudad.nombre)));

const ejecutar = async () => {
    const inicio = Date.now();
    // En modo simulación no se abre la conexión a la base.
    const repository = simular ? null : require("../repositories/destinoRepository");
    const ejecucionId = repository ? await repository.iniciarEjecucion() : null;
    const resumen = { ciudades: ciudades.length, actualizadas: 0, errores: [], omitidasPorTiempo: [] };

    const pendientes = ciudades.slice();
    const trabajar = async () => {
        while (pendientes.length) {
            const ciudad = pendientes.shift();
            if (Date.now() - inicio > TIEMPO_MAXIMO_MS) {
                resumen.omitidasPorTiempo.push(ciudad.nombre);
                continue;
            }
            const inicioCiudad = Date.now();
            try {
                const { ficha, avisos } = await fichaDestinoService.construirFicha(ciudad);
                if (!ficha || ficha.puntajeTuristico === null) throw new Error(avisos.join(" ") || "Sin datos");
                // Un reintento cubre cortes ocasionales de la conexión con la base.
                if (repository) await repository.guardarFicha(ciudad, ficha).catch(() => repository.guardarFicha(ciudad, ficha));
                resumen.actualizadas++;
                const cantidades = Object.entries(ficha.totales).map(([tipo, total]) => `${tipo} ${total}`).join(", ");
                console.log(`✓ ${ciudad.nombre} (${Date.now() - inicioCiudad} ms): puntaje ${ficha.puntajeTuristico}, `
                    + `${ficha.diasSugeridos} días sugeridos, ${ficha.puntos.length} lugares guardados [${cantidades}]`
                    + (avisos.length ? ` — avisos: ${avisos.join(" ")}` : ""));
                if (simular) {
                    console.log(`    ${(ficha.descripcion || "(sin descripción)").slice(0, 160)}…`);
                    for (const tipo of ["atraccion", "museo", "monumento", "parque", "restaurante"]) {
                        const nombres = ficha.puntos.filter((punto) => punto.tipo === tipo).slice(0, 4).map((punto) => punto.nombre);
                        if (nombres.length) console.log(`    ${tipo}: ${nombres.join(", ")}`);
                    }
                }
            } catch (error) {
                resumen.errores.push({ ciudad: ciudad.nombre, motivo: error.message });
                console.warn(`✗ ${ciudad.nombre}: ${error.message}`);
            }
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar));

    resumen.duracionSegundos = Math.round((Date.now() - inicio) / 1000);
    const estado = resumen.actualizadas === 0
        ? "fallido"
        : resumen.errores.length || resumen.omitidasPorTiempo.length ? "parcial" : "completado";
    if (repository) {
        // La tabla solo distingue completado/fallido; una corrida parcial queda como completada
        // y el detalle de lo que faltó va en error_resumen.
        const problemas = [
            ...resumen.errores.map((error) => `${error.ciudad}: ${error.motivo}`),
            ...(resumen.omitidasPorTiempo.length ? [`Omitidas por tiempo: ${resumen.omitidasPorTiempo.join(", ")}`] : [])
        ];
        await repository.finalizarEjecucion(ejecucionId, estado === "fallido" ? "fallido" : "completado",
            resumen.actualizadas, problemas.length ? `[${PROCESO}, ${resumen.duracionSegundos} s] ${problemas.join(" | ")}`.slice(0, 4000) : null);
    }
    console.log(`\nBatch ${estado}${simular ? " (simulación, sin escribir en la base)" : ""}: `
        + `${resumen.actualizadas}/${resumen.ciudades} ciudades en ${resumen.duracionSegundos} s`
        + (resumen.omitidasPorTiempo.length ? `, ${resumen.omitidasPorTiempo.length} omitidas por tiempo` : ""));
    if (estado === "fallido") process.exitCode = 1;
};

ejecutar()
    .catch((error) => {
        console.error("El batch geográfico falló:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (!simular) await require("../src/database/pool").end();
    });
