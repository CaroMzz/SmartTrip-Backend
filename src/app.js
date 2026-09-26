require("node:process").loadEnvFile?.();

const express = require("express");
const config = require("../config");
const usuarioRoutes = require("../routes/usuarioRoutes");

const app = express();

app.use(express.json());
app.use((req, res, next) => {
    const origen = req.headers.origin;
    if (origen && config.origenesCors.includes(origen)) {
        res.setHeader("Access-Control-Allow-Origin", origen);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }

    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
});
app.use("/usuarios", usuarioRoutes);

app.get("/", (req, res) => {
    res.json({
        mensaje: "Backend de SmartTrip funcionando"
    });
});

app.listen(config.puerto, config.host, () => {
    console.log(`Servidor ejecutándose en http://${config.host}:${config.puerto}`);
});
