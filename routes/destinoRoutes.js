const express = require("express");
const autenticarSesion = require("../middlewares/autenticarSesion");
const destinoController = require("../controllers/destinoController");

const router = express.Router();
router.use(autenticarSesion);
router.get("/paises", destinoController.listarPaises);
router.get("/buscar", destinoController.buscar);
router.get("/:id", destinoController.obtener);

module.exports = router;
