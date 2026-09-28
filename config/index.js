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

const leerNumeroNoNegativo = (nombre, valorPorDefecto) => {
    const valor = process.env[nombre];
    if (valor === undefined || valor === "") return valorPorDefecto;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) {
        throw new Error(`${nombre} debe ser un número no negativo`);
    }
    return numero;
};

module.exports = Object.freeze({
    puerto: leerEnteroPositivo("PORT", 3000),
    host: process.env.HOST || "localhost",
    databaseUrl: process.env.DATABASE_URL || "",
    geoDbRapidApiKey: process.env.GEODB_RAPIDAPI_KEY || "",
    openRouteServiceApiKey: process.env.ORS_API_KEY || "",
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || "",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: leerEnteroPositivo("SMTP_PORT", 587),
    smtpUser: process.env.SMTP_USER || "",
    smtpPassword: process.env.SMTP_PASSWORD || "",
    smtpFrom: process.env.SMTP_FROM || "",
    frontendUrl: process.env.FRONTEND_URL || (process.env.CORS_ORIGINS || "http://localhost:5173").split(",")[0].trim(),
    emailVerificationPath: process.env.EMAIL_VERIFICATION_PATH || "/confirmar-correo",
    costosReferenciales: Object.freeze({
        alojamientoPorPersonaNocheUsd: leerNumeroNoNegativo("ESTIMATED_LODGING_USD", 60),
        comidaPorPersonaDiaUsd: leerNumeroNoNegativo("ESTIMATED_FOOD_USD", 30),
        actividadesPorPersonaDiaUsd: leerNumeroNoNegativo("ESTIMATED_ACTIVITIES_USD", 15),
        trenPorPersonaKmUsd: leerNumeroNoNegativo("ESTIMATED_TRAIN_PER_KM_USD", 0.14),
        avionPorPersonaKmUsd: leerNumeroNoNegativo("ESTIMATED_FLIGHT_PER_KM_USD", 0.18),
        autoPorKmUsd: leerNumeroNoNegativo("ESTIMATED_CAR_PER_KM_USD", 0.18)
    }),
    rondasBcrypt: leerEnteroPositivo("BCRYPT_ROUNDS", 12),
    duracionTokenVerificacionMs: leerEnteroPositivo("VERIFICATION_TOKEN_TTL_MS", 24 * 60 * 60 * 1000),
    duracionSesionMs: leerEnteroPositivo("SESSION_TTL_MS", 8 * 60 * 60 * 1000),
    origenesCors: (process.env.CORS_ORIGINS || "").split(",").map((origen) => origen.trim()).filter(Boolean),
    imprimirTokensVerificacion: leerBooleano("PRINT_VERIFICATION_TOKENS"),
    devolverTokenVerificacion: leerBooleano("RETURN_VERIFICATION_TOKENS")
});
