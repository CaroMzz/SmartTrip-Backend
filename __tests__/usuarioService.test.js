/**
 * PRUEBAS UNITARIAS - usuarioService
 *
 * ¿Qué es un test unitario?
 * Es una prueba que verifica que UNA unidad de código (una función) hace
 * exactamente lo que se supone que tiene que hacer, de forma aislada.
 *
 * Conceptos clave que vas a ver acá:
 * - jest.mock()   → Reemplaza una dependencia real con una "falsa" controlable
 * - describe()    → Agrupa tests relacionados bajo un nombre
 * - it() / test() → Define un test individual (son sinónimos)
 * - expect()      → Afirma que algo tiene un valor o comportamiento esperado
 * - beforeEach()  → Código que corre ANTES de cada test (limpia el estado)
 */

// ─── MOCKS ───────────────────────────────────────────────────────────────────
// Le decimos a Jest que cuando el servicio haga require("bcryptjs"),
// en vez del módulo real le dé uno controlado por nosotros.
jest.mock("bcryptjs");
jest.mock("../repositories/usuarioRepository");
// Mockeamos el pool para evitar que intente conectarse a la BD al cargar
jest.mock("../src/database/pool", () => ({ query: jest.fn() }));
jest.mock("../config", () => ({
  rondasBcrypt: 10,
  duracionTokenVerificacionMs: 86400000, // 24 horas
  duracionSesionMs: 604800000            // 7 días
}));

const bcrypt = require("bcryptjs");
const repository = require("../repositories/usuarioRepository");
const usuarioService = require("../services/usuarioService");

// ─── DATOS DE PRUEBA ──────────────────────────────────────────────────────────
// Definimos datos "de juguete" que usaremos en los tests
const USUARIO_MOCK = {
  id: 1,
  nombre: "Ana García",
  correo: "ana@ejemplo.com",
  contrasena_hash: "hash_seguro_123",
  correo_verificado_en: "2024-01-01T00:00:00.000Z",
  preferencias: { transportePreferido: null, prioridades: { ahorro: 60, atractivos: 40 } }
};

// ─── SUITE DE TESTS ───────────────────────────────────────────────────────────
describe("usuarioService", () => {

  // beforeEach corre antes de CADA test para limpiar los mocks
  // Esto evita que un test "contamine" al siguiente
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── registrarUsuario ────────────────────────────────────────────────────────
  describe("registrarUsuario", () => {

    it("debería registrar un usuario nuevo y devolver el usuario + token", async () => {
      // ARRANGE (Preparar): configuramos qué van a devolver los mocks
      bcrypt.hash.mockResolvedValue("hash_seguro_123");
      repository.crearUsuario.mockResolvedValue({ ...USUARIO_MOCK, correo_verificado_en: null });
      repository.guardarVerificacion.mockResolvedValue();

      // ACT (Actuar): llamamos a la función que queremos probar
      const resultado = await usuarioService.registrarUsuario(
        "Ana García",
        "ANA@EJEMPLO.COM",   // notar mayúsculas → el servicio debe normalizarlo
        "contrasena123"
      );

      // ASSERT (Afirmar): verificamos que el resultado sea el esperado
      expect(resultado).toHaveProperty("token");   // debe devolver un token
      expect(resultado).toHaveProperty("usuario"); // debe devolver el usuario

      // Verificamos que el correo se normalizó a minúsculas
      expect(repository.crearUsuario).toHaveBeenCalledWith(
        expect.objectContaining({ correo: "ana@ejemplo.com" })
      );

      // Verificamos que el hash se guardó, no la contraseña en texto plano
      expect(repository.crearUsuario).toHaveBeenCalledWith(
        expect.objectContaining({ contrasena_hash: "hash_seguro_123" })
      );
    });

    it("debería propagar el error si el correo ya existe", async () => {
      // Simulamos que la BD rechaza por correo duplicado
      const errorDuplicado = new Error("Correo en uso");
      errorDuplicado.codigo = "CORREO_DUPLICADO";
      bcrypt.hash.mockResolvedValue("hash_cualquiera");
      repository.crearUsuario.mockRejectedValue(errorDuplicado);

      // expect(...).rejects → forma de testear que una promesa FALLA
      await expect(
        usuarioService.registrarUsuario("Ana", "ana@ejemplo.com", "pass")
      ).rejects.toMatchObject({ codigo: "CORREO_DUPLICADO" });
    });
  });

  // ── iniciarSesion ───────────────────────────────────────────────────────────
  describe("iniciarSesion", () => {

    it("debería devolver token y perfil cuando las credenciales son correctas", async () => {
      repository.buscarPorCorreo.mockResolvedValue(USUARIO_MOCK);
      bcrypt.compare.mockResolvedValue(true); // contraseña correcta
      repository.guardarSesion.mockResolvedValue();

      const resultado = await usuarioService.iniciarSesion("ana@ejemplo.com", "contrasena123");

      expect(resultado).toHaveProperty("token");
      expect(resultado.usuario).toEqual({
        id: 1,
        nombre: "Ana García",
        correo: "ana@ejemplo.com",
        preferencias: USUARIO_MOCK.preferencias
      });
    });

    it("debería lanzar CREDENCIALES_INVALIDAS si el usuario no existe", async () => {
      repository.buscarPorCorreo.mockResolvedValue(null); // usuario no encontrado

      await expect(
        usuarioService.iniciarSesion("noexiste@mail.com", "pass")
      ).rejects.toMatchObject({ codigo: "CREDENCIALES_INVALIDAS" });
    });

    it("debería lanzar CREDENCIALES_INVALIDAS si la contraseña es incorrecta", async () => {
      repository.buscarPorCorreo.mockResolvedValue(USUARIO_MOCK);
      bcrypt.compare.mockResolvedValue(false); // contraseña INCORRECTA

      await expect(
        usuarioService.iniciarSesion("ana@ejemplo.com", "contrasena_mal")
      ).rejects.toMatchObject({ codigo: "CREDENCIALES_INVALIDAS" });
    });

    it("debería lanzar CORREO_NO_VERIFICADO si el correo no fue confirmado", async () => {
      const usuarioSinVerificar = { ...USUARIO_MOCK, correo_verificado_en: null };
      repository.buscarPorCorreo.mockResolvedValue(usuarioSinVerificar);
      bcrypt.compare.mockResolvedValue(true);

      await expect(
        usuarioService.iniciarSesion("ana@ejemplo.com", "contrasena123")
      ).rejects.toMatchObject({ codigo: "CORREO_NO_VERIFICADO" });
    });
  });

  // ── obtenerUsuarioDeSesion ──────────────────────────────────────────────────
  describe("obtenerUsuarioDeSesion", () => {

    it("debería devolver el perfil del usuario si la sesión es válida", async () => {
      const sesionValida = {
        usuarioId: 1,
        venceEn: Date.now() + 9999999 // sesión futura → válida
      };
      repository.buscarSesion.mockResolvedValue(sesionValida);
      repository.buscarPorId.mockResolvedValue(USUARIO_MOCK);

      const resultado = await usuarioService.obtenerUsuarioDeSesion("token_cualquiera");

      expect(resultado).toHaveProperty("id", 1);
      expect(resultado).toHaveProperty("correo", "ana@ejemplo.com");
    });

    it("debería devolver null y eliminar la sesión si venció", async () => {
      const sesionVencida = {
        usuarioId: 1,
        venceEn: Date.now() - 1000 // sesión en el pasado → vencida
      };
      repository.buscarSesion.mockResolvedValue(sesionVencida);
      repository.eliminarSesion.mockResolvedValue();

      const resultado = await usuarioService.obtenerUsuarioDeSesion("token_vencido");

      expect(resultado).toBeNull();
      expect(repository.eliminarSesion).toHaveBeenCalled(); // debe limpiarla
    });

    it("debería devolver null si no existe la sesión", async () => {
      repository.buscarSesion.mockResolvedValue(null);

      const resultado = await usuarioService.obtenerUsuarioDeSesion("token_inexistente");
      expect(resultado).toBeNull();
    });
  });

  // ── confirmarCorreo ─────────────────────────────────────────────────────────
  describe("confirmarCorreo", () => {

    it("debería verificar el correo del usuario con token válido", async () => {
      const verificacion = {
        usuarioId: 1,
        usadoEn: null,
        venceEn: Date.now() + 9999999
      };
      repository.buscarVerificacion.mockResolvedValue(verificacion);
      repository.buscarPorId.mockResolvedValue({ ...USUARIO_MOCK, correo_verificado_en: null });
      repository.guardarUsuario.mockResolvedValue();
      repository.guardarVerificacion.mockResolvedValue();

      const resultado = await usuarioService.confirmarCorreo("token_valido");

      expect(resultado).toHaveProperty("id", 1);
      expect(resultado).toHaveProperty("correo", "ana@ejemplo.com");
    });

    it("debería lanzar TOKEN_INVALIDO si el token ya fue usado", async () => {
      const verificacionUsada = {
        usuarioId: 1,
        usadoEn: Date.now() - 1000, // ya fue usado
        venceEn: Date.now() + 9999999
      };
      repository.buscarVerificacion.mockResolvedValue(verificacionUsada);

      await expect(
        usuarioService.confirmarCorreo("token_ya_usado")
      ).rejects.toMatchObject({ codigo: "TOKEN_INVALIDO" });
    });
  });

  // ── cambiarContrasena ───────────────────────────────────────────────────────
  describe("cambiarContrasena", () => {

    it("debería cambiar la contraseña y revocar las otras sesiones", async () => {
      repository.buscarPorId.mockResolvedValue(USUARIO_MOCK);
      bcrypt.compare.mockResolvedValue(true); // contraseña actual correcta
      bcrypt.hash.mockResolvedValue("nuevo_hash_456");
      repository.guardarUsuario.mockResolvedValue();
      repository.revocarSesionesUsuario.mockResolvedValue();

      await usuarioService.cambiarContrasena(1, "actual", "nueva", "token_sesion");

      expect(repository.guardarUsuario).toHaveBeenCalledWith(
        expect.objectContaining({ contrasena_hash: "nuevo_hash_456" })
      );
      expect(repository.revocarSesionesUsuario).toHaveBeenCalled();
    });

    it("debería lanzar CONTRASENA_ACTUAL_INCORRECTA si la actual no coincide", async () => {
      repository.buscarPorId.mockResolvedValue(USUARIO_MOCK);
      bcrypt.compare.mockResolvedValue(false); // contraseña INCORRECTA

      await expect(
        usuarioService.cambiarContrasena(1, "actual_mal", "nueva", "token")
      ).rejects.toMatchObject({ codigo: "CONTRASENA_ACTUAL_INCORRECTA" });
    });
  });

});
