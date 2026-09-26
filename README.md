# SmartTrip Backend

Backend de la aplicación SmartTrip (Express y CommonJS).

## Configuración

Copiá `.env.example` a `.env` y ajustá las variables para tu entorno. El archivo `.env` se carga al iniciar y no se incluye en Git.

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `HOST` | Interfaz de escucha del servidor; usar `0.0.0.0` para acceso desde la red | `localhost` |
| `PORT` | Puerto HTTP | `3000` |
| `CORS_ORIGINS` | Orígenes del frontend autorizados, separados por coma | vacío (sin orígenes de navegador autorizados) |
| `BCRYPT_ROUNDS` | Costo de bcrypt para las contraseñas | `12` |
| `VERIFICATION_TOKEN_TTL_MS` | Vigencia del token de verificación en milisegundos | `86400000` (24 h) |
| `SESSION_TTL_MS` | Vigencia de la sesión en milisegundos | `28800000` (8 h) |
| `PRINT_VERIFICATION_TOKENS` | Muestra el token de verificación en la consola | `false` |

Iniciá el backend con `npm start`. Los valores numéricos deben ser enteros positivos y la opción para imprimir tokens acepta `true` o `false`.

## Autenticación en desarrollo

El flujo actual permite probar registro, inicio de sesión y confirmación de correo. **Los datos viven solo en memoria:** se borran cuando se reinicia el servidor. El envío de correo todavía no está conectado; la migración PostgreSQL compartida se usará cuando se conozcan los datos de conexión.

Para mostrar el token de confirmación localmente en la consola del servidor, cambiá `PRINT_VERIFICATION_TOKENS` a `true` en `.env` o habilitá la variable solo durante la ejecución. En PowerShell:

```powershell
$env:PRINT_VERIFICATION_TOKENS = "true"
node src/app.js
```

No habilites esa opción en un entorno publicado. El token no se devuelve en la respuesta HTTP.

## Endpoints

Todos reciben y responden JSON. La base URL local por defecto es `http://localhost:3000`; cambia según `HOST` y `PORT`.

### Registro

`POST /usuarios/registro`

```json
{
  "nombre": "Ana Pérez",
  "email": "ana@example.com",
  "contraseña": "una frase larga de ejemplo"
}
```

La contraseña debe tener al menos 15 caracteres y no superar 72 bytes en UTF-8, por el formato bcrypt que exige la migración. Se permiten espacios y símbolos; no se exige una mezcla de tipos de caracteres.

### Confirmación de correo

`POST /usuarios/confirmar-correo`

```json
{
  "token": "token mostrado por el servidor en modo de desarrollo"
}
```

El token vence a las 24 horas y solo puede usarse una vez.

### Inicio de sesión

`POST /usuarios/login`

```json
{
  "email": "ana@example.com",
  "contraseña": "una frase larga de ejemplo"
}
```

Devuelve un token de sesión temporal (Bearer) cuando las credenciales son correctas y el correo está confirmado. Las sesiones también se pierden al reiniciar el servidor.

### Consultar la sesión

`GET /usuarios/me` requiere el token devuelto por el login en el encabezado `Authorization: Bearer <token>`. La sesión vence a las 8 horas. Este endpoint sirve como ejemplo de cómo proteger futuras rutas.

## Token de confirmacion recibido por React

Para desarrollo local, si quieres que el navegador reciba el token directamente, configura `RETURN_VERIFICATION_TOKENS=true` en el `.env` del backend. La respuesta de registro incluira `tokenVerificacion`; el frontend puede pasarlo a `confirmarCorreo(tokenVerificacion)`. Esta opcion esta apagada por defecto y no debe activarse en un backend publico.
