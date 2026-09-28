const { existsSync } = require("node:fs");
const { join } = require("node:path");

const envFile = join(__dirname, "..", ".env");
if (existsSync(envFile)) require("node:process").loadEnvFile?.(envFile);

const express = require("express");
const config = require("../config");
const AppError = require("../services/appError");
const usuarioRoutes = require("../routes/usuarioRoutes");
const viajeRoutes = require("../routes/viajeRoutes");
const destinoRoutes = require("../routes/destinoRoutes");

const app = express();

app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
    const origen = req.headers.origin;
    if (origen && config.origenesCors.includes(origen)) {
        res.setHeader("Access-Control-Allow-Origin", origen);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }

    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
});
app.use("/usuarios", usuarioRoutes);
app.use("/viajes", viajeRoutes);
app.use("/destinos", destinoRoutes);

app.get("/", (req, res) => {
    res.json({
        mensaje: "Backend de SmartTrip funcionando"
    });
});

app.use((req, res) => res.status(404).json({ mensaje: "No se encontró el endpoint" }));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ mensaje: "El cuerpo JSON no es válido" });
    }
    if (error instanceof AppError && Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
        return res.status(error.status).json({ mensaje: error.message, ...(error.detalles ? { errores: error.detalles } : {}) });
    }
    if (Number.isInteger(error.status) && error.status < 500) {
        return res.status(error.status).json({ mensaje: error.message, ...(error.detalles ? { errores: error.detalles } : {}) });
    }
    console.error("Error no controlado:", error);
    return res.status(500).json({ mensaje: "Ocurrió un error interno" });
});

app.listen(config.puerto, config.host, () => {
    console.log(`Servidor ejecutándose en http://${config.host}:${config.puerto}`);
});
