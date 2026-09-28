# Guía para conectar el frontend React

Compartí este archivo con la persona que desarrolla el frontend.

## Conexión entre computadoras en la misma red

El backend corre en tu computadora y React en la de tu compañera. En el frontend, `localhost` apuntaría a la computadora de ella, así que deben usar la IP local de la computadora donde corre el backend.

1. En la computadora del backend, abre PowerShell y ejecuta `ipconfig`. Busca la dirección IPv4 del adaptador Wi-Fi o Ethernet conectado a la misma red (por ejemplo `192.168.1.25`). No compartas la dirección IPv4 de VPN, Docker ni adaptadores virtuales.
2. En el `.env` del backend, configura:

   ```env
   HOST=0.0.0.0
   PORT=3000
   CORS_ORIGINS=http://localhost:5173
   ```

   `CORS_ORIGINS` debe coincidir exactamente con la dirección que muestra la terminal del frontend. Vite suele usar `http://localhost:5173`; si usa otro puerto, reemplázalo.
3. Reinicia el backend después de editar `.env`. Comparte con tu compañera la URL `http://<IP-LOCAL-DEL-BACKEND>:3000`, por ejemplo `http://192.168.1.25:3000`.
4. Ella configura esa URL en el `.env.local` de React como `VITE_API_URL=http://192.168.1.25:3000` (reemplazar por la IP real) y reinicia React.
5. Ambos equipos deben estar en la misma red. Desde la computadora de ella, abran `http://<IP-LOCAL-DEL-BACKEND>:3000/` en el navegador; debe aparecer el mensaje de que el backend funciona.

Si Windows pregunta si Node.js puede aceptar conexiones en redes privadas, permite el acceso para la red privada de confianza. Si no aparece la pregunta y la conexión no funciona, revisa el Firewall de Windows para permitir conexiones entrantes al puerto 3000 en redes privadas. No expongas ese puerto en redes públicas.

Si el frontend no corre en `localhost` (por ejemplo, lo sirven desde otra IP o dominio), agrega su origen exacto a `CORS_ORIGINS`, incluyendo esquema y puerto. Para varios orígenes, sepáralos con comas.

## Contrato de la API

Todas las rutas reciben JSON. En `fetch`, incluir `Content-Type: application/json` al enviar un cuerpo.

| Acción | Método y ruta | Cuerpo | Respuesta útil |
| --- | --- | --- | --- |
| Crear cuenta | `POST /usuarios/registro` | `{ "nombre": "Ana", "email": "ana@example.com", "contraseña": "frase de al menos 15 caracteres" }` | `201`: `{ mensaje, usuario: { id, nombre, email } }` |
| Reenviar verificación | `POST /usuarios/reenviar-verificacion` | `{ "email": "ana@example.com" }` | `200`: `{ mensaje }` |
| Confirmar correo | `POST /usuarios/confirmar-correo` | `{ "token": "token de 64 caracteres hexadecimales" }` | `200`: `{ mensaje, usuario: { id, correo } }` |
| Iniciar sesión | `POST /usuarios/login` | `{ "email": "ana@example.com", "contraseña": "frase de al menos 15 caracteres" }` | `200`: `{ mensaje, token, tipo: "Bearer", usuario }` |
| Consultar sesión | `GET /usuarios/me` | Sin cuerpo | `200`: `{ usuario }` |

Para `/usuarios/me`, mandar `Authorization: Bearer <token>` con el token obtenido en login. El token de sesión dura 8 horas por defecto y se pierde si se reinicia el backend.

Los errores responden JSON con `mensaje`; por ejemplo, credenciales incorrectas devuelven `401`, correo no confirmado `403` y correo ya registrado `409`. El registro exige contraseña de al menos 15 caracteres y no más de 72 bytes UTF-8.

## Ejemplo de módulo API

Crear `src/api.js` en React:

```js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function solicitar(ruta, opciones = {}) {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers: {
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...opciones.headers,
    },
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos.mensaje || `Error HTTP ${respuesta.status}`);
  }
  return datos;
}

export const registrar = (datos) =>
  solicitar("/usuarios/registro", {
    method: "POST",
    body: JSON.stringify(datos),
  });

export const confirmarCorreo = (token) =>
  solicitar("/usuarios/confirmar-correo", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const iniciarSesion = (email, contraseña) =>
  solicitar("/usuarios/login", {
    method: "POST",
    body: JSON.stringify({ email, contraseña }),
  });

export const obtenerMiPerfil = (token) =>
  solicitar("/usuarios/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
```

El ejemplo usa Vite. En el frontend, crear `.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

Si el proyecto React usa Create React App en vez de Vite, cambiar la primera línea de `api.js` por:

```js
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";
```

Y en `.env.local` usar `REACT_APP_API_URL=http://localhost:3000`. Reiniciar el servidor de React después de cambiar variables `.env`.

## Ejemplo de uso desde React

```js
import { iniciarSesion } from "./api";

async function handleLogin(email, contraseña) {
  try {
    const datos = await iniciarSesion(email, contraseña);
    sessionStorage.setItem("token", datos.token);
    // Usar datos.usuario para mostrar el perfil o navegar.
  } catch (error) {
    // Mostrar error.message en la interfaz.
  }
}
```

Para probar confirmación local, el backend puede imprimir el token en su consola si `PRINT_VERIFICATION_TOKENS=true` está configurado en su `.env`. Luego se envía ese valor a `confirmarCorreo(token)`. No activar esta opción en producción.

## Arranque local

1. Backend: copiar `.env.example` a `.env`, instalar dependencias con `npm install` y ejecutar `npm start`.
2. Frontend: definir `VITE_API_URL` (o `REACT_APP_API_URL`) en `.env.local` y arrancar React.
3. Hacer registro, confirmar correo usando el token de desarrollo e iniciar sesión.

El almacenamiento de usuarios y sesiones del backend actual es temporal y en memoria; se borra al reiniciar el proceso.

## Recibir el token directamente en React (desarrollo local)

Si tu amiga ejecuta el backend en su computadora, copia `.env.example` a `.env` y cambia `RETURN_VERIFICATION_TOKENS=true`. Reinicia el backend con `npm start`. El registro respondera con `tokenVerificacion` en el JSON; el frontend ya puede pasarlo a `confirmarCorreo(tokenVerificacion)`. Asi el token llega al navegador que hizo el registro y no necesita copiarse desde una consola.

Para este flujo local, React debe usar `VITE_API_URL=http://localhost:3000` y ella debe iniciar tambien el backend en esa misma computadora. No hace falta ngrok. La opcion solo es para desarrollo; mantenla en `false` en cualquier backend publico o productivo.
