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
  "fechaInicio": "2026-10-12",
  "duracionDias": 10,
  "cantidadPersonas": 2
}
```

Las fechas usan `AAAA-MM-DD`; la fecha de fin se calcula contando ambos extremos. Cada ciudad acepta `idExterno`, `latitud`, `longitud` y un `puntajeTuristico` entero entre 0 y 100 opcionales. Para generar itinerarios sí se requieren coordenadas.

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

La búsqueda usa GeoDB Cities. El detalle consulta artículos de Wikipedia y, cuando hay un identificador Wikidata asociado, devuelve atractivos con coordenadas. La respuesta incluye enlaces de origen; el frontend debe mantenerlos visibles al mostrar contenido de terceros.

La búsqueda requiere configurar `GEODB_RAPIDAPI_KEY`. Las búsquedas repetidas se guardan en caché durante 15 minutos. El detalle puede incluir artículos de Wikipedia y enlaces a la fuente.

El detalle combina artículos de Wikipedia con atractivos y coordenadas de Wikidata. Las fotos aparecen cuando `UNSPLASH_ACCESS_KEY` está configurada; el frontend debe mostrar la atribución `Foto de … en Unsplash`, enlazar al fotógrafo y a Unsplash con las URL devueltas y cargar la URL de la imagen sin descargarla ni volver a alojarla.

## Perfil

| Acción | Método y ruta |
| --- | --- |
| Ver perfil | `GET /usuarios/me` |
| Actualizar nombre y preferencias | `PATCH /usuarios/me` |
| Cambiar contraseña | `PATCH /usuarios/me/contrasena` |
| Cerrar sesión | `POST /usuarios/logout` |

El cierre de sesión invalida el token actual.

## Registro y verificacion de correo

| Accion | Metodo y ruta | Respuesta |
| --- | --- | --- |
| Registrar cuenta | `POST /usuarios/registro` | `201 { "usuario": {}, "correoEnviado": true }` |
| Confirmar correo | `POST /usuarios/confirmar-correo` | `200 { "usuario": {} }` |
| Reenviar confirmacion | `POST /usuarios/reenviar-verificacion` | `200 { "mensaje": "..." }` |

El reenvio recibe `{ "email": "ana@example.com" }` y responde igual si la cuenta no existe o ya fue confirmada. El envio requiere SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`); sin esa configuracion, el registro igual se crea y se informa `correoEnviado: false`. Para probar localmente se puede habilitar `PRINT_VERIFICATION_TOKENS`; los tokens nunca se registran ni devuelven en produccion.

## Estado de persistencia

El repositorio de viajes y las sesiones siguen en memoria: se reinician junto con el servidor. La configuración de conexión a PostgreSQL y el comando de inspección de solo lectura ya están preparados; la implementación sobre Supabase debe ajustarse al esquema existente del equipo antes de guardar datos allí.
