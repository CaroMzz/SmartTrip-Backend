const express = require("express");
const autenticarSesion = require("../middlewares/autenticarSesion");
const viajeController = require("../controllers/viajeController");
const AppError = require("../services/appError");

const router = express.Router();

router.use(autenticarSesion);
// Los ids son bigint: un valor no numérico respondía 500 (error 22P02 de PostgreSQL) en vez de 400.
router.param("id", (req, res, next, id) => (
    /^\d{1,18}$/.test(id) ? next() : next(new AppError(400, "El identificador del viaje no es válido"))
));
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
