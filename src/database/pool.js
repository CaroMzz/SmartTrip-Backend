const { Pool } = require("pg");
const config = require("../../config");

if (!config.databaseUrl) {
    throw new Error("Falta DATABASE_URL. Configurá la URI del proyecto Supabase en .env.");
}

const pool = new Pool({
    connectionString: config.databaseUrl,
    options: "-c search_path=smarttrip,public",
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000
});

pool.on("error", (error) => {
    console.error("Error inesperado en el pool de PostgreSQL:", error.message);
});

module.exports = pool;
