# SmartTrip — Manual Técnico del Sistema

> **Documentación de Arquitectura, Despliegue, Convenciones y Estrategia de Pruebas**  
> **Estándares de Referencia:** ISO/IEC 12207 (Ciclo de Vida del Software), IEEE 829 / ISO 29119-3 (Documentación de Pruebas)  
> **Sistema:** SmartTrip Backend & Web Platform | **Versión:** 1.0 | **Fecha:** Octubre 2026

---

## Tabla de Contenidos

1. [Descripción General de la Arquitectura](#1-descripción-general-de-la-arquitectura)
2. [Stack Tecnológico y Versiones](#2-stack-tecnológico-y-versiones)
3. [Variables de Entorno y Configuración](#3-variables-de-entorno-y-configuración)
4. [Instalación y Puesta en Marcha](#4-instalación-y-puesta-en-marcha)
5. [Estructura del Proyecto y Convenciones de Código](#5-estructura-del-proyecto-y-convenciones-de-código)
6. [Estrategia de Pruebas y Reporte de Cobertura (Testing)](#6-estrategia-de-pruebas-y-reporte-de-cobertura-testing)
   - 6.1 Framework y Organización de Tests
   - 6.2 Ejecución de Pruebas Unitarias
   - 6.3 Modo Watch e Inspección Continua
   - 6.4 Generación y Lectura del Reporte de Cobertura
   - 6.5 Catálogo de Suites de Prueba Existentes
   - 6.6 Pruebas del Frontend (React + Vitest + React Testing Library)
7. [Documentación de APIs y Colección de Endpoints](#7-documentación-de-apis-y-colección-de-endpoints)

---

## 1. Descripción General de la Arquitectura

SmartTrip implementa una **arquitectura por capas orientada a servicios (Layered Architecture)**, separando estrictamente responsabilidades para garantizar mantenibilidad, testabilidad y desacoplamiento:

```
                  ┌──────────────────────────────────────────────┐
                  │           Frontend (React + Vite)            │
                  │  (SPA cliente, Mapa Interactivo, UI/UX)      │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP REST / JSON
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           Backend (Node.js / Express)                          │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Capa de Rutas y Middlewares (routes/, middlewares/)                   │  │
│  │    • Autenticación (Bearer JWT / Sesiones)                               │  │
│  │    • Validación de esquemas y CORS                                       │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. Capa de Controladores (controllers/)                                  │  │
│  │    • Recepción y deserialización de requests HTTP                        │  │
│  │    • Formateo de respuestas y códigos de estado                          │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Capa de Servicios y Lógica de Negocio (services/)                     │  │
│  │    • itinerarioService.js: Algoritmo de optimización y ponderación       │  │
│  │    • routingService.js: Cálculo de distancias y tramos                   │  │
│  │    • usuarioService.js: Hash bcrypt, verificación y sesiones             │  │
│  │    • viajeService.js: Gestión de presupuestos, cronogramas y estados     │  │
│  │    • destinoService.js / catalogoDestinos.js: Catálogos y puntos interés │  │
│  └───────────────────────────────────┬──────────────────────────────────────┘  │
│                                      ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Capa de Acceso a Datos / Repositorios (repositories/)                 │  │
│  │    • PostgreSQL / Supabase Driver (pg Pool)                              │  │
│  │    • In-Memory Cache & Fallback de contingencia                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológico y Versiones

| Componente | Tecnología | Versión | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Entorno de Ejecución** | Node.js | `>= 20.x LTS` | Soporte nativo para APIs modernas, alto rendimiento en I/O asíncrono. |
| **Framework Web** | Express.js | `^5.2.1` | Manejo nativo de promesas en middleware y routing HTTP minimalista. |
| **Módulo de Módulos** | CommonJS (`require`) | Estándar Node | Compatibilidad homogénea con tooling de pruebas (Jest). |
| **Base de Datos** | PostgreSQL / Supabase | `^8.23.0` (`pg`) | Persistencia relacional ACID, indexación geoespacial y consultas complejas. |
| **Seguridad / Cifrado** | bcryptjs | `^3.0.3` | Hashing adaptativo y seguro de credenciales con salt rounds configurables. |
| **Correo Transaccional** | Nodemailer | `^10.0.11` | Envío asíncrono SMTP de tokens para verificación de cuentas. |
| **Motor de Pruebas** | Jest | `^30.5.2` | Test runner con assertions, mocking integrado y motor de cobertura Istanbul. |
| **Frontend** | React + Vite | `^18.x` / `^5.x` | Renderizado reactivo rápido, bundling optimizado vía Rollup/ESBuild. |

---

## 3. Variables de Entorno y Configuración

El archivo `.env` concentra la configuración local y de producción. Debe crearse a partir de la plantilla `.env.example`:

```bash
cp .env.example .env
```

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `HOST` | Interfaz de red de escucha del servidor | `localhost` (o `0.0.0.0` para despliegue) |
| `PORT` | Puerto de escucha HTTP | `3000` |
| `CORS_ORIGINS` | Orígenes web habilitados para peticiones cruzadas | `http://localhost:5173` |
| `BCRYPT_ROUNDS` | Costo computacional para hashing de claves | `12` |
| `SESSION_TTL_MS` | Tiempo de vida de la sesión activa en milisegundos | `28800000` (8 horas) |
| `VERIFICATION_TOKEN_TTL_MS` | Tiempo de validez del token de verificación de email | `86400000` (24 horas) |
| `PRINT_VERIFICATION_TOKENS` | Muestra tokens de confirmación en la consola (desarrollo) | `false` |
| `RETURN_VERIFICATION_TOKENS`| Devuelve el token en la respuesta HTTP local de registro | `false` |
| `DATABASE_URL` | String de conexión a base de datos PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `SMTP_HOST`, `SMTP_PORT` | Parámetros del servidor SMTP para envío de correos | Sin configurar (modo simulado) |
| `ORS_API_KEY` | Clave de API para enrutamiento OpenRouteService | Opcional (fallback a Haversine) |
| `GEODB_RAPIDAPI_KEY` | Clave para búsqueda enriquecida de ciudades en vivo | Opcional (fallback a catálogo local) |

---

## 4. Instalación y Puesta en Marcha

### Prerrequisitos
- Tener instalado **Node.js v20+** y **npm v10+**.
- Git configurado en el sistema operativo.

### Pasos de Inicio
1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/CaroMzz/SmartTrip-Backend.git
   cd SmartTrip-Backend
   ```
2. **Instalar dependencias del proyecto:**
   ```bash
   npm install
   ```
3. **Configurar el entorno:**
   ```bash
   cp .env.example .env
   ```
4. **Verificar estado de base de datos (Opcional):**
   ```bash
   npm run db:inspect
   ```
5. **Iniciar el servidor en modo desarrollo:**
   ```bash
   npm start
   ```
   El servidor responderá en `http://localhost:3000`.

---

## 5. Estructura del Proyecto y Convenciones de Código

```
SmartTrip-Backend/
├── __tests__/                  # Pruebas unitarias automatizadas (Jest)
│   ├── catalogoDestinos.test.js
│   ├── destinoService.test.js
│   ├── emailService.test.js
│   ├── itinerarioService.test.js
│   ├── routingService.test.js
│   ├── usuarioService.test.js
│   └── viajeService.test.js
├── config/                     # Configuraciones centralizadas y variables de entorno
├── controllers/                # Controladores HTTP (Express route handlers)
├── coverage/                   # Reportes de cobertura generados por Jest (lcov, html)
├── docs/                       # Documentación técnica y funcional
│   ├── API-VIAJES.md
│   ├── MANUAL_DE_USUARIO.md
│   └── MANUAL_TECNICO.md
├── middlewares/                # Middlewares de autenticación, validación y errores
├── repositories/               # Acceso a base de datos y persistencia
├── routes/                     # Definición de rutas y endpoints de la API
├── scripts/                    # Scripts de inspección y migración de BD
├── services/                   # Lógica de negocio y algoritmos de optimización
├── src/                        # Entrada principal (app.js)
├── .env.example                # Plantilla de variables de entorno
├── package.json                # Dependencias, scripts y configuración de Jest
└── README.md                   # Resumen del proyecto
```

### Convenciones
* **Nomenclatura:** `camelCase` para variables, funciones y métodos; `PascalCase` para clases y modelos; `UPPER_SNAKE_CASE` para constantes y variables de entorno.
* **Manejo de Errores:** Se implementa una clase centralizada `AppError` con códigos de estado HTTP explícitos (`400`, `401`, `404`, `500`).
* **Inmutabilidad:** Las funciones puras en `services/` evitan mutar directamente los objetos de configuración o listas de destinos recibidos.

---

## 6. Estrategia de Pruebas y Reporte de Cobertura (Testing)

Siguiendo el estándar **IEEE 829 / ISO 29119-3**, las pruebas automatizadas de SmartTrip aseguran que cada regla de negocio, algoritmo de optimización y mecanismo de seguridad sea verificable y repetible.

### 6.1 Framework y Organización de Tests
* **Runner:** [Jest](https://jestjs.io/) configurado en entorno Node (`"testEnvironment": "node"`).
* **Ubicación:** Todos los archivos de prueba residen en la carpeta `__tests__/` con la extensión `*.test.js`.
* **Aislamiento:** Los servicios se prueban de forma aislada, mockeando dependencias de infraestructura (como el transporte SMTP de Nodemailer o consultas remotas de red).

### 6.2 Ejecución de Pruebas Unitarias
Para ejecutar la suite completa de pruebas:

```bash
npm test
```

**Resultado esperado:**
```text
PASS __tests__/destinoService.test.js
PASS __tests__/itinerarioService.test.js
PASS __tests__/viajeService.test.js
PASS __tests__/usuarioService.test.js
PASS __tests__/emailService.test.js
PASS __tests__/catalogoDestinos.test.js
PASS __tests__/routingService.test.js

Test Suites: 7 passed, 7 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        ~0.8 s
```

### 6.3 Modo Watch e Inspección Continua
Para desarrollo guiado por pruebas (TDD):
```bash
npm run test:watch
```
Jest re-ejecuta automáticamente las suites afectadas cada vez que se detectan cambios en el código fuente.

### 6.4 Generación y Lectura del Reporte de Cobertura
Para generar el reporte métrico detallado de cobertura:

```bash
npm run test:coverage
```

#### Interpretación de las Métricas de la Tabla:
* **% Stmts (Sentencias):** Porcentaje de sentencias del código ejecutadas durante los tests.
* **% Branch (Ramas):** Porcentaje de caminos condicionales (`if`, `else`, `switch`, operadores ternarios) evaluados en ambos sentidos.
* **% Funcs (Funciones):** Porcentaje de funciones declaradas que fueron invocadas.
* **% Lines (Líneas):** Porcentaje de líneas de código cubiertas.
* **Uncovered Line #s:** Indica exactamente qué números de línea no fueron recorridos por los tests.

#### Reporte de Cobertura Actual del Núcleo:
| Módulo / Servicio | % Stmts | % Branch | % Funcs | % Lines | Estado y Calidad |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`services/itinerarioService.js`** | **97.57%** | **81.01%** | **100%** | **98.52%** | Excelente cobertura del algoritmo de cálculo de rutas y ponderación. |
| **`services/routingService.js`** | **95.23%** | **90.90%** | **100%** | **100%** | Validación completa de cálculos de distancias y tramos. |
| **`services/catalogoDestinos.js`** | **100%** | **86.20%** | **100%** | **100%** | Cobertura total de catálogo y puntos de interés. |
| **`services/emailService.js`** | **92.59%** | **70.00%** | **100%** | **100%** | Mocks de transporte y validación de generación de tokens. |
| **`services/viajeService.js`** | **81.64%** | **53.52%** | **100%** | **85.71%** | Cobertura de lógica de viajes, validaciones de fechas y costos. |
| **`services/usuarioService.js`** | **71.13%** | **57.44%** | **70%** | **73.86%** | Autenticación, hash bcrypt y gestión de sesiones. |
| **`services/appError.js`** | **100%** | **100%** | **100%** | **100%** | Cobertura total de excepciones controladas. |

> **Reporte HTML Interactivo:**  
> Jest genera automáticamente un informe interactivo en la carpeta `coverage/lcov-report/index.html`. Puede abrirse en cualquier navegador para navegar visualmente línea por línea por el código fuente.

### 6.5 Catálogo de Suites de Prueba Existentes

1. **`itinerarioService.test.js` (Lógica de Generación de Rutas):**
   * Verificación de cálculo de alternativas (Económica, Balanceada, Turística).
   * Ponderación por sliders (Costo vs Tiempo vs Turismo vs Confort).
   * Asignación coherente de días de permanencia por ciudad según presupuesto.
2. **`viajeService.test.js` (Ciclo de Vida de Viajes):**
   * Creación con validaciones de presupuesto mayor a cero y fechas futuras.
   * Manejo de errores de validación y fallbacks.
   * Cálculo de desglose de 4 rubros presupuestarios.
3. **`usuarioService.test.js` (Seguridad y Usuarios):**
   * Registro con verificación de contraseñas de al menos 15 caracteres.
   * Hashing con bcrypt y prevención de correos duplicados.
   * Generación y caducidad de tokens de sesión y confirmación.
4. **`routingService.test.js` (Enrutamiento Geográfico):**
   * Cálculo de distancias directas Haversine.
   * Manejo de respuestas y contingencia ante indisponibilidad de APIs externas.
5. **`catalogoDestinos.test.js` y `destinoService.test.js`:**
   * Búsqueda y filtrado de ciudades por país o nombre.
   * Categorización de puntos de interés (`PuntoInteres`).
6. **`emailService.test.js`:**
   * Envío simulado en entorno de desarrollo.
   * Construcción de plantillas de confirmación con URLs dinámicas.

### 6.6 Pruebas del Frontend (React + Vitest + React Testing Library)

En cumplimiento de la norma **IEEE 829 / ISO 29119-3**, el frontend (`SmartTrip-Frontend`) posee su propia suite de pruebas unitarias y de integración para validar la interfaz de usuario, navegación y servicios API.

#### Ejecución de Pruebas en el Frontend:
```bash
cd SmartTrip-Frontend
npm test
```

#### Suites de Prueba del Frontend (`src/__tests__/`):
* **`Faq.test.jsx` (Centro de Ayuda y FAQ - ISO/IEC/IEEE 26514):**
  * Verificación de renderizado de insignias normativas y título.
  * Comportamiento interactivo de acordeones (apertura y cierre de respuestas atómicas).
  * Filtro reactivo en tiempo real mediante el input de búsqueda.
  * Filtrado por categorías de tarea (*Planificar Viaje*, *Presupuesto*, *Problemas*, etc.).
  * Manejo del estado vacío ante términos inexistentes.
* **`Login.test.jsx` (Autenticación y Formularios):**
  * Validación de renderizado de campos de correo y contraseña.
  * Verificación de enlaces de navegación pública (Registro y Centro de Ayuda).
  * Envío de formulario y navegación exitosa.
* **`Registration.test.jsx` (Alta de Usuarios):**
  * Validación de campos obligatorios (nombre, correo, contraseñas coincidentes).
* **`Sidebar.test.jsx` (Navegación y Estados de Interfaz):**
  * Presencia de la marca y enlaces a módulos internos y de ayuda.
  * Marcado dinámico de la clase `.active` según la ruta URL actual.
* **`api.test.js` (Módulo Cliente HTTP):**
  * Simulación de llamadas REST (`fetch`) para `registrar`, `iniciarSesion`, `confirmarCorreo` y `obtenerMiPerfil`.
  * Verificación de cabeceras de autorización (`Bearer <token>`) y manejo de errores HTTP.

### 6.7 Panel de Gestión y Reporte en la Nube (Qase TestOps)

Los casos de prueba formalizados, precondiciones y la trazabilidad de ejecución según **IEEE 829 / ISO 29119-3** están sincronizados y accesibles públicamente en la plataforma **Qase**:

* 🌐 **URL del Proyecto en Qase:** [https://app.qase.io/project/ST](https://app.qase.io/project/ST)
* 📊 **Reporte de Ejecución (Test Run #1 - 100% Passed):** [https://app.qase.io/run/ST/dashboard/1](https://app.qase.io/run/ST/dashboard/1)
* **Total de casos gestionados:** 18 casos divididos en 4 suites modulares (Autenticación, Itinerarios, FAQ y Frontend).
* **Métrica de éxito:** 100% Passed (18/18 pruebas aprobadas).

---

## 7. Documentación de APIs y Colección de Endpoints

Todas las solicitudes y respuestas utilizan formato `application/json`. La URL base predeterminada en desarrollo es `http://localhost:3000`.

### Autenticación y Cuentas
* `POST /usuarios/registro` — Creación de cuenta nueva (requiere `nombre`, `email`, `contraseña`).
* `POST /usuarios/confirmar-correo` — Validación del token único recibido por email.
* `POST /usuarios/login` — Autenticación y obtención de Bearer Token de sesión.
* `GET /usuarios/me` — Consulta del perfil autenticado actual (requiere encabezado `Authorization: Bearer <token>`).

### Planificación, Itinerarios y Destinos
Para la especificación detallada de los modelos de solicitud y respuesta de los módulos de itinerarios, mapas y presupuestos, consulte la documentación dedicada en:
👉 [**Documentación de API de Viajes y Destinos (docs/API-VIAJES.md)**](API-VIAJES.md)

---

## 8. Trazabilidad con Estándares Internacionales

* **ISO/IEC/IEEE 26514:** Cumplido a través del [Manual de Usuario](MANUAL_DE_USUARIO.md), proporcionando una guía modular orientada a tareas y FAQs para el usuario final.
* **ISO/IEC 12207:** Cumplido mediante la documentación de procesos del ciclo de vida, desarrollo modular, separación de capas y versionado en Git.
* **IEEE 829 / ISO 29119-3:** Cumplido mediante el diseño estructurado de suites de prueba, casos de test rastreables a requisitos funcionales y reportes métricos de cobertura con Jest.
