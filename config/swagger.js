const swaggerJsdoc = require("swagger-jsdoc");
const { TIPOS: TIPOS_TRANSPORTE } = require("../services/transportes");

const idPath = [{ name: "id", in: "path", required: true, description: "Identificador del viaje.", schema: { type: "string" }, example: "1" }];
const jsonBody = (schema, example) => ({
    required: true,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` }, ...(example ? { example } : {}) } }
});
const secured = [{ sessionToken: [] }];
const ok = (description) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Mensaje" } } } });
const errorResponses = {
    400: { $ref: "#/components/responses/Error400" },
    401: { $ref: "#/components/responses/Error401" },
    404: { $ref: "#/components/responses/Error404" },
    500: { $ref: "#/components/responses/Error500" }
};

const definition = {
    openapi: "3.0.3",
    info: {
        title: "SmartTrip API",
        version: "1.0.0",
        description: "API REST de SmartTrip. Los datos se envían y reciben en JSON. Para rutas protegidas, inicia sesión y autoriza el token Bearer usando el botón **Authorize**."
    },
    // Ruta relativa: Swagger llama al mismo servidor que sirve la página (local o Render).
    servers: [{ url: "/", description: "Este servidor" }],
    tags: [
        { name: "Estado", description: "Estado del backend" },
        { name: "Usuarios", description: "Registro, acceso, perfil y sesión" },
        { name: "Viajes", description: "Viajes, itinerarios y presupuesto" },
        { name: "Destinos", description: "Búsqueda y detalle de destinos" }
    ],
    components: {
        securitySchemes: {
            sessionToken: { type: "http", scheme: "bearer", bearerFormat: "Token de sesión", description: "Usa el token devuelto por `POST /usuarios/login`. Swagger agrega el prefijo `Bearer` automáticamente; pega solo el token." }
        },
        schemas: {
            Mensaje: { type: "object", properties: { mensaje: { type: "string", example: "Operación completada" } } },
            Error: {
                type: "object", required: ["mensaje"],
                properties: {
                    mensaje: { type: "string", example: "Hay errores en los datos enviados" },
                    errores: { oneOf: [{ type: "object", additionalProperties: { type: "string" } }, { type: "array", items: {} }] }
                }
            },
            RegistroUsuario: {
                type: "object", required: ["nombre", "email", "contraseña"], additionalProperties: false,
                properties: {
                    nombre: { type: "string", minLength: 1, maxLength: 150, example: "Ana Pérez" },
                    email: { type: "string", format: "email", maxLength: 320, example: "ana@example.com" },
                    contraseña: { type: "string", minLength: 15, maxLength: 72, description: "Al menos 15 caracteres y como máximo 72 bytes en UTF-8.", example: "una frase larga de ejemplo" }
                }
            },
            Credenciales: {
                type: "object", required: ["email", "contraseña"], additionalProperties: false,
                properties: { email: { type: "string", format: "email", example: "ana@example.com" }, contraseña: { type: "string", example: "una frase larga de ejemplo" } }
            },
            TokenConfirmacion: { type: "object", required: ["token"], properties: { token: { type: "string", pattern: "^[a-f0-9]{64}$", description: "Token de 64 caracteres hexadecimales recibido para confirmar el correo." } } },
            ActualizarPerfil: {
                type: "object", minProperties: 1, additionalProperties: false,
                properties: {
                    nombre: { type: "string", minLength: 1, maxLength: 150 },
                    email: { type: "string", format: "email", maxLength: 320, description: "Correo nuevo. Si cambia, exige contrasenaActual y cierra las demás sesiones." },
                    contrasenaActual: { type: "string", description: "Obligatoria solo para cambiar el correo." },
                    transportePreferido: { type: "string", enum: [...TIPOS_TRANSPORTE] },
                    prioridades: { $ref: "#/components/schemas/Prioridades" }
                }, example: { nombre: "Ana Pérez", transportePreferido: "tren", prioridades: { ahorro: 60, atractivos: 40 } }
            },
            CambioContrasena: {
                type: "object", required: ["contrasenaActual", "nuevaContrasena"], additionalProperties: false,
                properties: {
                    contrasenaActual: { type: "string", example: "contraseña actual" },
                    nuevaContrasena: { type: "string", minLength: 15, maxLength: 72, description: "Al menos 15 caracteres y como máximo 72 bytes en UTF-8.", example: "mi nueva frase segura" }
                }
            },
            Prioridades: {
                type: "object", additionalProperties: false,
                properties: {
                    ahorro: { type: "integer", minimum: 0, maximum: 100, description: "Minimizar costos", example: 30 },
                    distancia: { type: "integer", minimum: 0, maximum: 100, description: "Reducir kilómetros recorridos", example: 10 },
                    atractivos: { type: "integer", minimum: 0, maximum: 100, description: "Maximizar lugares turísticos", example: 30 },
                    alojamiento: { type: "integer", minimum: 0, maximum: 100, description: "Minimizar cambios de alojamiento", example: 10 },
                    tren: { type: "integer", minimum: 0, maximum: 100, description: "Priorizar tren sobre avión", example: 10 },
                    panoramicas: { type: "integer", minimum: 0, maximum: 100, description: "Priorizar rutas panorámicas", example: 10 }
                },
                description: "Porcentajes de importancia (RF08). Los valores deben sumar 100; los criterios omitidos valen 0, así que también se acepta el formato anterior { ahorro, atractivos }."
            },
            Ciudad: {
                oneOf: [
                    { type: "string", description: "Nombre de ciudad ya presente en el catálogo." },
                    {
                        type: "object", required: ["nombre"],
                        properties: {
                            nombre: { type: "string", maxLength: 120, example: "Madrid" }, pais: { type: "string", maxLength: 100, example: "España" },
                            idExterno: { type: "string", maxLength: 80 }, wikiDataId: { type: "string", pattern: "^Q\\d+$" },
                            latitud: { type: "number", minimum: -90, maximum: 90, example: 40.4168 }, longitud: { type: "number", minimum: -180, maximum: 180, example: -3.7038 },
                            puntajeTuristico: { type: "integer", minimum: 0, maximum: 100 }
                        }
                    }
                ]
            },
            ViajeNuevo: {
                type: "object", required: ["nombre", "paises", "ciudadesObligatorias", "fechaInicio", "duracionDias", "cantidadPersonas"], additionalProperties: false,
                properties: {
                    nombre: { type: "string", minLength: 1, maxLength: 150, example: "España, a tu ritmo" },
                    paises: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", maxLength: 100 }, example: ["España"] },
                    ciudadesObligatorias: { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/Ciudad" } },
                    fechaInicio: { type: "string", format: "date", example: "2026-10-12" }, duracionDias: { type: "integer", minimum: 1, maximum: 60, example: 10 },
                    cantidadPersonas: { type: "integer", minimum: 1, maximum: 20, example: 2 }, presupuestoTotal: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 100000000, example: 3000 },
                    moneda: { type: "string", pattern: "^[A-Za-z]{3}$", example: "USD" }, transportePreferido: { type: "string", enum: [...TIPOS_TRANSPORTE] }, prioridades: { $ref: "#/components/schemas/Prioridades" }
                }, example: {
                    nombre: "España, a tu ritmo", paises: ["España"],
                    ciudadesObligatorias: [{ nombre: "Madrid", pais: "España", latitud: 40.4168, longitud: -3.7038 }, { nombre: "Barcelona", pais: "España", latitud: 41.3874, longitud: 2.1686 }],
                    fechaInicio: "2026-10-12", duracionDias: 10, cantidadPersonas: 2
                }
            },
            ViajeParcial: {
                type: "object", minProperties: 1, additionalProperties: false,
                properties: {
                    nombre: { type: "string", minLength: 1, maxLength: 150 }, paises: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
                    ciudadesObligatorias: { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/Ciudad" } },
                    fechaInicio: { type: "string", format: "date" }, duracionDias: { type: "integer", minimum: 1, maximum: 60 }, cantidadPersonas: { type: "integer", minimum: 1, maximum: 20 },
                    presupuestoTotal: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 100000000 }, moneda: { type: "string", pattern: "^[A-Za-z]{3}$" },
                    transportePreferido: { type: "string", enum: [...TIPOS_TRANSPORTE] }, prioridades: { $ref: "#/components/schemas/Prioridades" }
                }
            },
            ConfiguracionViaje: {
                type: "object", minProperties: 1, additionalProperties: false,
                properties: {
                    presupuestoTotal: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 100000000, example: 3000 }, moneda: { type: "string", pattern: "^[A-Za-z]{3}$", example: "USD" },
                    transportePreferido: { type: "string", enum: [...TIPOS_TRANSPORTE] }, prioridades: { $ref: "#/components/schemas/Prioridades" }
                }, example: { presupuestoTotal: 3000, moneda: "USD", transportePreferido: "tren", prioridades: { ahorro: 60, atractivos: 40 } }
            },
            SeleccionarItinerario: { type: "object", required: ["itinerarioId"], properties: { itinerarioId: { type: "string", description: "ID devuelto al generar o listar itinerarios." } }, example: { itinerarioId: "id-devuelto-por-generar" } },
            ResultadoGenerico: { type: "object", additionalProperties: true, description: "Objeto de resultado cuya forma concreta depende del recurso solicitado." }
        },
        responses: {
            Error400: { description: "Solicitud inválida", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            Error401: { description: "Falta un token Bearer válido o la sesión venció", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            Error404: { description: "No se encontró el recurso", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            Error500: { description: "Error interno del servidor", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
        }
    },
    paths: {
        "/": { get: { tags: ["Estado"], summary: "Comprobar que el backend está activo", responses: { 200: { description: "Backend funcionando", content: { "application/json": { schema: { $ref: "#/components/schemas/Mensaje" }, example: { mensaje: "Backend de SmartTrip funcionando" } } } } } } },
        "/opciones": { get: { tags: ["Estado"], summary: "Transportes y criterios de prioridad admitidos", responses: { 200: { description: "Listas que usa la interfaz", content: { "application/json": { example: { transportes: [{ tipo: "tren", etiqueta: "Tren" }], criterios: [{ clave: "ahorro", etiqueta: "Minimizar costos" }], prioridadesPorDefecto: { ahorro: 60, distancia: 0, atractivos: 40, alojamiento: 0, tren: 0, panoramicas: 0 } } } } } } } },
        "/usuarios/registro": { post: { tags: ["Usuarios"], summary: "Registrar una cuenta", description: "Envía un correo de verificación si SMTP está configurado.", requestBody: jsonBody("RegistroUsuario"), responses: { 201: { description: "Cuenta creada" }, 400: errorResponses[400], 409: { description: "El correo ya está registrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }, 500: errorResponses[500] } } },
        "/usuarios/reenviar-verificacion": { post: { tags: ["Usuarios"], summary: "Reenviar verificación de correo", description: "La respuesta no revela si el correo pertenece a una cuenta pendiente.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email", example: "ana@example.com" } } }, example: { email: "ana@example.com" } } } }, responses: { 200: ok("Solicitud procesada"), 400: errorResponses[400] } } },
        "/usuarios/login": { post: { tags: ["Usuarios"], summary: "Iniciar sesión", requestBody: jsonBody("Credenciales"), responses: { 200: { description: "Sesión iniciada; la respuesta contiene el token Bearer", content: { "application/json": { schema: { $ref: "#/components/schemas/ResultadoGenerico" }, example: { mensaje: "Sesión iniciada", token: "token-de-sesion", tipo: "Bearer", usuario: { id: "1", nombre: "Ana Pérez", email: "ana@example.com" } } } } }, 400: errorResponses[400], 401: errorResponses[401], 403: { description: "El correo aún no está verificado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
        "/usuarios/confirmar-correo": { post: { tags: ["Usuarios"], summary: "Confirmar correo", requestBody: jsonBody("TokenConfirmacion"), responses: { 200: ok("Correo confirmado"), 400: errorResponses[400] } } },
        "/usuarios/me": {
            get: { tags: ["Usuarios"], summary: "Obtener mi perfil", security: secured, responses: { 200: { description: "Perfil obtenido" }, 401: errorResponses[401] } },
            patch: { tags: ["Usuarios"], summary: "Actualizar mi perfil", description: "Para cambiar el correo enviá email y contrasenaActual: 401 si la contraseña no coincide y 409 si el correo ya está en uso.", security: secured, requestBody: jsonBody("ActualizarPerfil"), responses: { 200: ok("Perfil actualizado"), 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404], 409: { description: "El correo ya pertenece a otra cuenta", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } }
        },
        "/usuarios/me/contrasena": { patch: { tags: ["Usuarios"], summary: "Cambiar mi contraseña", security: secured, requestBody: jsonBody("CambioContrasena"), responses: { 200: ok("Contraseña actualizada"), 400: errorResponses[400], 401: { description: "Sesión inválida o contraseña actual incorrecta", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
        "/usuarios/logout": { post: { tags: ["Usuarios"], summary: "Cerrar mi sesión", security: secured, responses: { 204: { description: "Sesión cerrada; sin contenido" }, 401: errorResponses[401] } } },
        "/viajes": {
            get: { tags: ["Viajes"], summary: "Listar mis viajes", security: secured, responses: { 200: { description: "Lista de viajes", content: { "application/json": { schema: { $ref: "#/components/schemas/ResultadoGenerico" }, example: { viajes: [] } } } }, 401: errorResponses[401] } },
            post: { tags: ["Viajes"], summary: "Crear un viaje", description: "Requiere entre 2 y 20 ciudades obligatorias con nombre. Las coordenadas son necesarias para generar itinerarios; el país ayuda a identificar ciudades con nombres repetidos.", security: secured, requestBody: jsonBody("ViajeNuevo"), responses: { 201: { description: "Viaje creado" }, 400: errorResponses[400], 401: errorResponses[401] } }
        },
        "/viajes/{id}": {
            parameters: idPath,
            get: { tags: ["Viajes"], summary: "Obtener un viaje", security: secured, responses: { 200: { description: "Detalle del viaje" }, 401: errorResponses[401], 404: errorResponses[404] } },
            patch: { tags: ["Viajes"], summary: "Actualizar un viaje", description: "Acepta uno o más campos del objeto de viaje. Al editarlo se eliminan las alternativas anteriores.", security: secured, requestBody: jsonBody("ViajeParcial"), responses: { 200: { description: "Viaje actualizado" }, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404] } },
            delete: { tags: ["Viajes"], summary: "Eliminar un viaje", security: secured, responses: { 204: { description: "Viaje eliminado; sin contenido" }, 401: errorResponses[401], 404: errorResponses[404] } }
        },
        "/viajes/{id}/itinerarios/generar": { post: { tags: ["Viajes"], summary: "Generar alternativas de itinerario", description: "El viaje debe tener ciudades con coordenadas. Puede usar servicios externos de rutas según la configuración.", parameters: idPath, security: secured, responses: { 201: { description: "Alternativas generadas" }, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/itinerarios": { get: { tags: ["Viajes"], summary: "Listar alternativas de itinerario", parameters: idPath, security: secured, responses: { 200: { description: "Alternativas del viaje" }, 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/itinerario-seleccionado": { put: { tags: ["Viajes"], summary: "Elegir una alternativa", parameters: idPath, security: secured, requestBody: jsonBody("SeleccionarItinerario"), responses: { 200: { description: "Itinerario seleccionado" }, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/itinerario": { get: { tags: ["Viajes"], summary: "Obtener el itinerario seleccionado y su geometría", parameters: idPath, security: secured, responses: { 200: { description: "Itinerario y geometría para el mapa" }, 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/calendario": { get: { tags: ["Viajes"], summary: "Obtener el calendario del viaje", parameters: idPath, security: secured, responses: { 200: { description: "Calendario y ciudades" }, 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/presupuesto": { get: { tags: ["Viajes"], summary: "Obtener el presupuesto estimado", parameters: idPath, security: secured, responses: { 200: { description: "Presupuesto, indicador de estimación y notas" }, 401: errorResponses[401], 404: errorResponses[404] } } },
        "/viajes/{id}/configuracion": { patch: { tags: ["Viajes"], summary: "Guardar presupuesto y preferencias", parameters: idPath, security: secured, requestBody: jsonBody("ConfiguracionViaje"), responses: { 200: { description: "Preferencias guardadas" }, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404] } } },
        "/destinos/paises": { get: { tags: ["Destinos"], summary: "Buscar países", description: "La consulta debe tener entre 2 y 100 caracteres.", security: secured, parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 100 }, example: "Esp" }], responses: { 200: { description: "Países coincidentes" }, 400: errorResponses[400], 401: errorResponses[401] } } },
        "/destinos/buscar": { get: { tags: ["Destinos"], summary: "Buscar ciudades o destinos", description: "La consulta debe tener entre 2 y 100 caracteres. Los códigos de país son ISO de dos letras separados por coma.", security: secured, parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 100 }, example: "Bar" },
            { name: "paises", in: "query", required: false, description: "Hasta 10 códigos ISO 3166-1 alfa-2 separados por coma.", schema: { type: "string", example: "ES,AR" } }
        ], responses: { 200: { description: "Destinos coincidentes" }, 400: errorResponses[400], 401: errorResponses[401], 503: { description: "Servicio de búsqueda no disponible o con límite temporal" } } } },
        "/destinos/{id}": { get: { tags: ["Destinos"], summary: "Ficha de un destino (RF16)", description: "Para ciudades del catálogo (id \"local-...\", por ejemplo local-PE-cusco) devuelve descripción, fotos, puntosInteres (atracciones, museos, monumentos, parques, restaurantes), puntajeTuristico y tiempoSugeridoDias, cargados por el batch geográfico. Si la ciudad no está en la base se consulta en el momento; \"avisos\" indica qué información no pudo recuperarse y \"categoriasSinDatos\" qué tipos de lugares no tienen resultados.", security: secured, parameters: [
            { name: "id", in: "path", required: true, description: "Identificador externo devuelto por la búsqueda.", schema: { type: "string", maxLength: 80 }, example: "osm-N-12345" },
            { name: "nombre", in: "query", required: false, description: "Nombre del destino; ayuda a resolver identificadores de OpenStreetMap.", schema: { type: "string" }, example: "Barcelona" },
            { name: "pais", in: "query", required: false, schema: { type: "string" }, example: "España" }
        ], responses: { 200: { description: "Ficha del destino" }, 400: errorResponses[400], 401: errorResponses[401], 404: errorResponses[404], 503: { description: "Servicio externo no disponible o sin configurar" } } } }
    }
};

module.exports = swaggerJsdoc({ definition, apis: [] });
