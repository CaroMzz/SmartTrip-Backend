const { existsSync } = require("node:fs");
const { join } = require("node:path");

const envFile = join(__dirname, "..", ".env");
if (existsSync(envFile)) require("node:process").loadEnvFile?.(envFile);

if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL. Agregá la URI del pooler de Supabase a .env y volvé a ejecutar el comando.");
    process.exit(1);
}

const pool = require("../src/database/pool");

const inspeccionar = async () => {
    try {
        const resultado = await pool.query(`
            SELECT
                table_name AS tabla,
                column_name AS columna,
                data_type AS tipo,
                is_nullable AS admite_null
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);

        if (resultado.rowCount === 0) {
            console.log("No hay tablas en el esquema public.");
            return;
        }

        const tablas = new Map();
        for (const fila of resultado.rows) {
            if (!tablas.has(fila.tabla)) tablas.set(fila.tabla, []);
            tablas.get(fila.tabla).push(`${fila.columna} (${fila.tipo}${fila.admite_null === "NO" ? ", requerido" : ""})`);
        }

        for (const [tabla, columnas] of tablas) {
            console.log(`\n${tabla}`);
            for (const columna of columnas) console.log(`  - ${columna}`);
        }
    } finally {
        await pool.end();
    }
};

inspeccionar().catch((error) => {
    console.error("No se pudo leer el esquema de Supabase:", error.message);
    process.exitCode = 1;
});
