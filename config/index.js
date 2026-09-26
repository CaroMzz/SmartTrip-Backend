const leerEnteroPositivo = (nombre, valorPorDefecto) => {
    const valor = process.env[nombre];
    if (valor === undefined || valor === "") return valorPorDefecto;

    const numero = Number(valor);
    if (!Number.isSafeInteger(numero) || numero <= 0) {
        throw new Error(`${nombre} debe ser un entero positivo`);
    }
    return numero;
};

const leerBooleano = (nombre, valorPorDefecto = false) => {
    const valor = process.env[nombre];
    if (valor === undefined || valor === "") return valorPorDefecto;
    if (valor === "true") return true;
    if (valor === "false") return false;
    throw new Error(`${nombre} debe ser "true" o "false"`);
};

module.exports = Object.freeze({
    puerto: leerEnteroPositivo("PORT", 3000),
    host: process.env.HOST || "localhost",
    rondasBcrypt: leerEnteroPositivo("BCRYPT_ROUNDS", 12),
    duracionTokenVerificacionMs: leerEnteroPositivo("VERIFICATION_TOKEN_TTL_MS", 24 * 60 * 60 * 1000),
    duracionSesionMs: leerEnteroPositivo("SESSION_TTL_MS", 8 * 60 * 60 * 1000),
    origenesCors: (process.env.CORS_ORIGINS || "").split(",").map((origen) => origen.trim()).filter(Boolean),
    imprimirTokensVerificacion: leerBooleano("PRINT_VERIFICATION_TOKENS")
});
