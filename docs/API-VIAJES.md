# API de viajes de SmartTrip

Todos los endpoints de viajes y destinos requieren `Authorization: Bearer <token>` obtenido de `POST /usuarios/login`. Los cuerpos y respuestas usan JSON.

## Viajes

| Acción | Método y ruta | Respuesta |
| --- | --- | --- |
| Listar mis viajes | `GET /viajes` | `{ "viajes": [] }` |
| Crear viaje | `POST /viajes` | `201 { "viaje": {} }` |
| Ver un viaje | `GET /viajes/:id` | `{ "viaje": {} }` |
| Editar viaje | `PATCH /viajes/:id` | `{ "viaje": {} }` |
| Guardar presupuesto y preferencias | `PATCH /viajes/:id/configuracion` | `{ "viaje": {} }` |
| Eliminar viaje | `DELETE /viajes/:id` | `204` |

Ejemplo para crear el primer paso del formulario:

```json
{
  "nombre": "España, a tu ritmo",
  "paises": ["España"],
  "ciudadesObligatorias": [
    { "nombre": "Madrid", "pais": "España", "latitud": 40.4168, "longitud": -3.7038 },
    { "nombre": "Valencia", "pais": "España", "latitud": 39.4699, "longitud": -0.3763 },
    { "nombre": "Barcelona", "pais": "España", "latitud": 41.3874, "longitud": 2.1686 }
  ],
  "fechaInicio": "2027-10-12",
  "duracionDias": 10,
  "cantidadPersonas": 2
}
```

Las fechas usan `AAAA-MM-DD`; la fecha de fin se calcula contando ambos extremos y la de inicio no puede ser anterior a hoy (un viaje ya iniciado se puede editar mientras no cambie su fecha). El nombre admite hasta 150 caracteres. Se indican de 1 a 20 ciudades.

Cada ciudad tiene que existir: se acepta si está en el catálogo local (por `idExterno` `local-…` o por nombre y país) o si OpenStreetMap la confirma, ya sea por su `idExterno` `osm-…` (el que devuelve la búsqueda) o, sin id, por nombre, país y coordenadas a menos de 50 km. Una ciudad inexistente responde `422`. Cada ciudad acepta además `latitud`, `longitud` y un `puntajeTuristico` entero entre 0 y 100 opcionales.

`GET /viajes/:id` devuelve `paises` (nombres) y `paisesDetalle` (`[{ "nombre": "Espana", "codigo": "ES" }]`) para precargar el autocompletado. Editar un viaje vuelve a borrador y descarta las alternativas generadas; países, ciudades y preferencias solo se reescriben si cambiaron.

Ejemplo para el segundo paso:

```json
{
  "presupuestoTotal": 3000,
  "moneda": "USD",
  "transportePreferido": "tren",
  "prioridades": { "ahorro": 60, "atractivos": 40 }
}
```

Las prioridades deben sumar 100. Los transportes aceptados son `tren`, `avion` y `auto`.

`GET /opciones` (sin autenticación) devuelve los transportes y los seis criterios de prioridad con sus etiquetas. Están definidos en `services/transportes.js` y `services/prioridades.js`: para agregar un transporte se suma una entrada en ese módulo y su fila activa en `smarttrip.transporte`, y la interfaz lo toma de este endpoint.

## Itinerarios, mapa, calendario y presupuesto

| Acción | Método y ruta | Respuesta |
| --- | --- | --- |
| Generar alternativas | `POST /viajes/:id/itinerarios/generar` | `201 { "itinerarios": [] }` |
| Comparar alternativas | `GET /viajes/:id/itinerarios` | `{ "itinerarios": [] }` |
| Elegir una alternativa | `PUT /viajes/:id/itinerario-seleccionado` | `{ "itinerario": {} }` |
| Ver recorrido para el mapa | `GET /viajes/:id/itinerario` | `{ "itinerario": {}, "geometria": {} }` |
| Ver calendario | `GET /viajes/:id/calendario` | `{ "calendario": [], "ciudades": [] }` |
| Ver presupuesto | `GET /viajes/:id/presupuesto` | `{ "presupuesto": {}, "esEstimacion": true }` |

Para elegir una alternativa:

```json
{ "itinerarioId": "id-devuelto-por-generar" }
```

Las distancias de tren y avión se aproximan entre coordenadas. Para auto, OpenRouteService ofrece geometría vial cuando `ORS_API_KEY` está configurada; sin ella, se devuelve una línea aproximada. Los costos salen de tasas configurables en `.env.example`. La respuesta los marca como estimaciones; no incluye tarifas ni disponibilidad en vivo. Por ahora las estimaciones solo aceptan USD. Editar un viaje invalida sus alternativas anteriores.

## Destinos

| Acción | Método y ruta | Respuesta |
| --- | --- | --- |
| Buscar países por prefijo | `GET /destinos/paises?q=Esp` | `{ "resultados": [] }` |
| Buscar ciudades por prefijo | `GET /destinos/buscar?q=Bar&paises=ES` | `{ "resultados": [] }` |
| Ver detalles y artículos relacionados | `GET /destinos/:id?nombre=Barcelona&pais=España` | `{ "destino": {} }` |

La búsqueda usa el catálogo local y, cuando encuentra menos de 5 ciudades, la completa con Photon (OpenStreetMap, sin clave) limitado a los países del catálogo. Si Photon no responde, devuelve solo el catálogo. Las búsquedas repetidas se guardan en caché durante 15 minutos.

Para destinos de OpenStreetMap el detalle toma la descripción del artículo de Wikipedia cuyo título es la ciudad y los atractivos de artículos geolocalizados a menos de 10 km; el frontend envía `nombre` y `pais` en la consulta. Los ids de GeoDB solo responden si está configurada `GEODB_RAPIDAPI_KEY`. La respuesta incluye enlaces de origen; el frontend debe mantenerlos visibles al mostrar contenido de terceros.

El detalle combina artículos de Wikipedia con atractivos y coordenadas de Wikidata. Las fotos aparecen cuando `UNSPLASH_ACCESS_KEY` está configurada; el frontend debe mostrar la atribución `Foto de … en Unsplash`, enlazar al fotógrafo y a Unsplash con las URL devueltas y cargar la URL de la imagen sin descargarla ni volver a alojarla.

## Perfil

| Acción | Método y ruta |
| --- | --- |
| Ver perfil | `GET /usuarios/me` |
| Actualizar nombre, correo y preferencias | `PATCH /usuarios/me` |
| Cambiar contraseña | `PATCH /usuarios/me/contrasena` |
| Cerrar sesión | `POST /usuarios/logout` |

El cierre de sesión invalida el token actual.

Para cambiar el correo se envía `email` (o `correo`) junto con `contrasenaActual`: responde `400` sin contraseña, `401` si no coincide y `409` si el correo ya es de otra cuenta. Al cambiarlo se cierran las demás sesiones y la actual sigue activa.

## Registro y verificacion de correo

| Accion | Metodo y ruta | Respuesta |
| --- | --- | --- |
| Registrar cuenta | `POST /usuarios/registro` | `201 { "usuario": {}, "correoEnviado": true }` |
| Confirmar correo | `POST /usuarios/confirmar-correo` | `200 { "usuario": {} }` |
| Reenviar confirmacion | `POST /usuarios/reenviar-verificacion` | `200 { "mensaje": "..." }` |

El reenvio recibe `{ "email": "ana@example.com" }` y responde igual si la cuenta no existe o ya fue confirmada. El envio requiere SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`); sin esa configuracion, el registro igual se crea y se informa `correoEnviado: false`. Para probar localmente se puede habilitar `PRINT_VERIFICATION_TOKENS`; los tokens nunca se registran ni devuelven en produccion.

## Estado de persistencia

Los repositorios de usuarios y viajes guardan usuarios, sesiones, viajes, alternativas y calendarios en PostgreSQL, en el esquema `smarttrip`. La conexión requiere `DATABASE_URL`. `npm run db:inspect` consulta tablas y columnas sin modificarlas; `npm run db:migrate` aplica cambios al esquema y debe revisarse antes de ejecutarse.
