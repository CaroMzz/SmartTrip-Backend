// ==================================================
// IMPORTACIONES
// ==================================================

const express = require("express");
const usuarioController = require("../controllers/usuarioController");
const autenticarSesion = require("../middlewares/autenticarSesion");


// ==================================================
// ROUTER
// ==================================================

const router = express.Router();


// ==================================================
// REGISTRO DE USUARIO
// ==================================================

// POST /usuarios/registro
//
// Recibe los datos del nuevo usuario
// y los envía al Controller.

router.post("/registro", usuarioController.registrarUsuario);

// POST /usuarios/login: valida el correo y la contraseña.
router.post("/login", usuarioController.iniciarSesion);

// POST /usuarios/confirmar-correo: recibe { "token": "..." }.
router.post("/confirmar-correo", usuarioController.confirmarCorreo);

// GET /usuarios/me: ejemplo de endpoint protegido con el token de sesión.
router.get("/me", autenticarSesion, usuarioController.obtenerPerfil);


// ==================================================
// EXPORTACIÓN
// ==================================================

module.exports = router;
