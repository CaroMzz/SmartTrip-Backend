# SmartTrip Backend

Backend de la aplicación SmartTrip (Express y CommonJS).

## Configuración

Copiá `.env.example` a `.env` y ajustá las variables para tu entorno. El archivo `.env` se carga al iniciar y no se incluye en Git. Para que el backend arranque y persista los datos, configurá `DATABASE_URL` con la URI de PostgreSQL de Supabase. La URI y las demás credenciales deben quedar solo en `.env` o en las variables del servicio de despliegue.

Antes de iniciar el backend, comprobá la conexión y las tablas del esquema `smarttrip`:

```bash
npm run db:inspect
npm start
```

El comando de inspección es de solo lectura. `npm run db:migrate` aplica cambios al esquema; revisá `scripts/migrateDatabase.js` y asegurate de tener una copia de seguridad antes de ejecutarlo.

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `HOST` | Interfaz de escucha del servidor; usar `0.0.0.0` para acceso desde la red | `localhost` |
| `PORT` | Puerto HTTP | `3000` |
| `CORS_ORIGINS` | Orígenes del frontend autorizados, separados por coma | vacío (sin orígenes de navegador autorizados) |
| `BCRYPT_ROUNDS` | Costo de bcrypt para las contraseñas | `12` |
| `VERIFICATION_TOKEN_TTL_MS` | Vigencia del token de verificación en milisegundos | `86400000` (24 h) |
| `SESSION_TTL_MS` | Vigencia de la sesión en milisegundos | `28800000` (8 h) |
| `PRINT_VERIFICATION_TOKENS` | Muestra el token de verificación en consola solo en desarrollo | `false` |
| `RETURN_VERIFICATION_TOKENS` | Devuelve el token HTTP solo en desarrollo local | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Datos SMTP para los emails de verificación | Sin configurar |
| `FRONTEND_URL`, `EMAIL_VERIFICATION_PATH` | URL y ruta de confirmación del frontend | `http://localhost:5173`, `/confirmar-correo` |

Iniciá el backend con `npm start`. Los valores numéricos deben ser enteros positivos y la opción para imprimir tokens acepta `true` o `false`.

## Pruebas

`npm test` ejecuta la suite de Jest (`__tests__/`). Usa dobles de la base y de los servicios externos, así que no necesita `DATABASE_URL` ni conexión a internet.

## Autenticación y persistencia

El flujo permite registro, inicio de sesión, confirmación de correo, actualización del perfil, cambio de contraseña y cierre de sesión. Usuarios, verificaciones, sesiones, viajes e itinerarios se guardan en PostgreSQL, en el esquema `smarttrip`; no se pierden al reiniciar el proceso del backend. La conexión es obligatoria y se configura mediante `DATABASE_URL`.

El correo de verificación se envía cuando SMTP está configurado. En desarrollo local, si SMTP no está configurado, las cuentas se marcan como verificadas para permitir probar la aplicación. `PRINT_VERIFICATION_TOKENS` y `RETURN_VERIFICATION_TOKENS` son opciones de desarrollo y no deben activarse en un entorno publicado.

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

Devuelve un token de sesión temporal (Bearer) cuando las credenciales son correctas y el correo está confirmado. Se almacena el hash del token de sesión en PostgreSQL; el token vence según `SESSION_TTL_MS`.

### Consultar la sesión

`GET /usuarios/me` requiere el token devuelto por el login en el encabezado `Authorization: Bearer <token>`. La sesión vence a las 8 horas por defecto. Las rutas de viajes y destinos también requieren autenticación.

## Token de confirmacion recibido por React

Para desarrollo local, si quieres que el navegador reciba el token directamente, configura `RETURN_VERIFICATION_TOKENS=true` en el `.env` del backend. La respuesta de registro incluira `tokenVerificacion`; el frontend puede pasarlo a `confirmarCorreo(tokenVerificacion)`. Esta opcion esta apagada por defecto y no debe activarse en un backend publico.

## API de viajes y destinos

Los endpoints para perfil, viajes, alternativas, recorrido, calendario, presupuesto y destinos están documentados en [`docs/API-VIAJES.md`](docs/API-VIAJES.md). El backend persiste esos datos en PostgreSQL. La búsqueda de ciudades usa el catálogo local y la completa con Photon (OpenStreetMap, sin clave); los ids de GeoDB necesitan `GEODB_RAPIDAPI_KEY`. Las rutas en auto usan OpenRouteService cuando se configura `ORS_API_KEY` y, si no está disponible, recurren a una aproximación geográfica.

La configuración de Render está en [`render.yaml`](render.yaml). El despliegue todavía requiere cargar allí las variables secretas y configurar `CORS_ORIGINS` y `FRONTEND_URL` con la URL real del frontend.
