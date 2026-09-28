const express = require("express");
const autenticarSesion = require("../middlewares/autenticarSesion");
const viajeController = require("../controllers/viajeController");

const router = express.Router();

router.use(autenticarSesion);
router.get("/", viajeController.listar);
router.post("/", viajeController.crear);
router.post("/:id/itinerarios/generar", viajeController.generarItinerarios);
router.get("/:id/itinerarios", viajeController.listarItinerarios);
router.put("/:id/itinerario-seleccionado", viajeController.seleccionarItinerario);
router.get("/:id/itinerario", viajeController.obtenerItinerarioSeleccionado);
router.get("/:id/calendario", viajeController.obtenerCalendario);
router.get("/:id/presupuesto", viajeController.obtenerPresupuesto);
router.patch("/:id/configuracion", viajeController.configurar);
router.get("/:id", viajeController.obtener);
router.patch("/:id", viajeController.actualizar);
router.delete("/:id", viajeController.borrar);

module.exports = router;
