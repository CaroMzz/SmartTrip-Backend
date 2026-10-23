# SmartTrip — Manual de Usuario

> **Guía Orientada a Tareas y Preguntas Frecuentes**  
> **Estándar de Referencia:** Norma Internacional ISO/IEC/IEEE 26514  
> **Sistema:** SmartTrip Web Platform | **Versión:** 1.0 | **Fecha:** Octubre 2026 | **Documentación Oficial**

---

## Tabla de Contenidos

Este manual está estructurado por módulos funcionales y tareas específicas para facilitar la búsqueda rápida y autónoma de soluciones por parte del usuario final.

| Módulo / Sección | Tipo de Contenido | Referencia |
| :--- | :--- | :--- |
| **1. Introducción y Preguntas Frecuentes Generales** | **Módulo 1** | [Sección 1](#1-introducción-y-preguntas-frecuentes-generales) |
| &emsp; 1.1 ¿Qué es SmartTrip y cuál es su objetivo? | FAQ | [1.1](#11-qué-es-smarttrip-y-cuál-es-su-objetivo-principal) |
| &emsp; 1.2 ¿Qué requisitos de navegador o sistema necesito? | Requisitos | [1.2](#12-qué-requisitos-de-navegador-o-sistema-necesito) |
| **2. Gestión de Cuenta y Perfil de Usuario** | **Módulo 2** | [Sección 2](#2-gestión-de-cuenta-y-perfil-de-usuario) |
| &emsp; 2.1 ¿Cómo creo una cuenta nueva en SmartTrip? | Tarea | [2.1](#21-cómo-creo-una-cuenta-nueva-en-smarttrip) |
| &emsp; 2.2 ¿Cómo inicio y cierro sesión de forma segura? | Tarea | [2.2](#22-cómo-inicio-y-cierro-sesión-de-forma-segura) |
| &emsp; 2.3 ¿Cómo modifico mi perfil y preferencias de viaje? | Tarea | [2.3](#23-cómo-modifico-mi-perfil-y-mis-preferencias-de-viaje) |
| **3. Creación y Configuración de un Viaje** | **Módulo 3** | [Sección 3](#3-creación-y-configuración-de-un-viaje) |
| &emsp; 3.1 ¿Cómo inicio la planificación de un nuevo viaje? | Tarea | [3.1](#31-cómo-inicio-la-planificación-de-un-nuevo-viaje) |
| &emsp; 3.2 ¿Cómo selecciono los destinos y medios de transporte? | Tarea | [3.2](#32-cómo-selecciono-los-destinos-y-medios-de-transporte) |
| &emsp; 3.3 ¿Cómo configuro las prioridades de optimización? | Tarea | [3.3](#33-cómo-configuro-las-prioridades-de-optimización) |
| **4. Generación y Comparación de Itinerarios** | **Módulo 4** | [Sección 4](#4-generación-y-comparación-de-itinerarios) |
| &emsp; 4.1 ¿Cómo genera SmartTrip las propuestas de itinerario? | FAQ | [4.1](#41-cómo-genera-smarttrip-las-propuestas-de-itinerario) |
| &emsp; 4.2 ¿Cómo comparo las diferentes alternativas de ruta? | Tarea | [4.2](#42-cómo-comparo-las-diferentes-alternativas-de-ruta) |
| &emsp; 4.3 ¿Cómo selecciono o regenero una ruta optimizada? | Tarea | [4.3](#43-cómo-selecciono-o-regenero-una-ruta-optimizada) |
| **5. Visualización en Mapa Interactivo y Ficha de Destinos** | **Módulo 5** | [Sección 5](#5-visualización-en-mapa-interactivo-y-ficha-de-destinos) |
| &emsp; 5.1 ¿Cómo exploro mi ruta en el mapa interactivo? | Tarea | [5.1](#51-cómo-exploro-mi-ruta-en-el-mapa-interactivo) |
| &emsp; 5.2 ¿Cómo consulto la información de cada ciudad y punto de interés? | Tarea | [5.2](#52-cómo-consulto-la-información-de-cada-ciudad-y-punto-de-interés) |
| **6. Calendario de Viaje y Estimación Presupuestaria** | **Módulo 6** | [Sección 6](#6-calendario-de-viaje-y-estimación-presupuestaria) |
| &emsp; 6.1 ¿Cómo se organiza el calendario diario de mi viaje? | Tarea | [6.1](#61-cómo-se-organiza-el-calendario-diario-de-mi-viaje) |
| &emsp; 6.2 ¿Cómo controlo y desgloso mi presupuesto estimado? | Tarea | [6.2](#62-cómo-controlo-y-desgloso-mi-presupuesto-estimado) |
| **7. Guía de Solución de Problemas (Troubleshooting)** | **Módulo 7** | [Sección 7](#7-guía-de-solución-de-problemas-troubleshooting) |
| &emsp; 7.1 Errores frecuentes de validación y cómo resolverlos | Soporte | [7.1](#71-errores-frecuentes-de-validación-y-cómo-resolverlos) |
| &emsp; 7.2 Respuestas de fallback ante fallas en APIs externas | Soporte | [7.2](#72-respuestas-de-fallback-ante-fallas-en-apis-externas) |

---

## 1. Introducción y Preguntas Frecuentes Generales

### 1.1 ¿Qué es SmartTrip y cuál es su objetivo principal?
**SmartTrip** es una plataforma web integral diseñada para resolver la fragmentación de información en la planificación de viajes. Su objetivo principal es automatizar el cálculo de rutas óptimas, la estimación de presupuestos y la distribución de días de permanencia entre múltiples destinos, permitiendo al usuario personalizar sus prioridades (costo, distancia, turismo o comodidad).

> **ALCANCE DEL SISTEMA:**  
> SmartTrip no realiza transacciones comerciales directas (como reservas de vuelos o pagos de hoteles). Funciona como un **motor inteligente de recomendación y planificación de itinerarios**.

### 1.2 ¿Qué requisitos de navegador o sistema necesito?
Al ser una aplicación web moderna (construida en React y Vite), únicamente requiere:
* **Navegador web actualizado:** Google Chrome, Mozilla Firefox, Microsoft Edge o Safari.
* **Conexión activa a Internet:** Para el despliegue del mapa interactivo y sincronización de datos con el servidor Node.js/PostgreSQL.
* **Diseño responsivo:** Compatible con computadoras de escritorio, tablets y dispositivos móviles.

---

## 2. Gestión de Cuenta y Perfil de Usuario

### 2.1 ¿Cómo creo una cuenta nueva en SmartTrip?
Pasos para registrarse en la aplicación:
1. Ingrese a la pantalla principal y haga clic en el botón **Registrarse**.
2. Complete los campos obligatorios:
   * **Nombre completo**
   * **Correo electrónico**
   * **Contraseña segura** (mínimo 15 caracteres)
3. Presione el botón **Crear Cuenta**.
4. El sistema validará que el correo no se encuentre registrado previamente y creará su perfil encriptando su clave mediante `bcrypt`. Si la confirmación por correo está habilitada, recibirá el enlace de verificación correspondiente.

### 2.2 ¿Cómo inicio y cierro sesión de forma segura?
* **Inicio de sesión:** Ingrese su email y contraseña en el formulario de Login. Al autenticarse correctamente, el servidor generará un token de sesión seguro (JWT / Bearer Token).
* **Cierre de sesión:** Diríjase al menú superior derecho del perfil y haga clic en **Cerrar Sesión**. Esto eliminará inmediatamente el token de autenticación del almacenamiento local del navegador.

### 2.3 ¿Cómo modifico mi perfil y mis preferencias de viaje?
En la sección **Mi Perfil**, puede configurar sus preferencias por defecto para la generación de itinerarios, tales como:
* **Prioridad de transporte:** Tren, Auto o Avión.
* **Balances predeterminados de optimización:** Costo vs. Tiempo vs. Turismo.
* **Preferencias de alojamiento:** Minimizar cambios de hospedaje o maximizar cercanía a atracciones.

---

## 3. Creación y Configuración de un Viaje

### 3.1 ¿Cómo inicio la planificación de un nuevo viaje?
Haga clic en el botón **+ Nuevo Viaje** desde su panel principal. Se desplegará el formulario inicial donde debe ingresar los datos básicos obligatorios:

| Campo | Tipo de Dato | Descripción y Regla de Validación |
| :--- | :--- | :--- |
| **Nombre del Viaje** | Texto (máx 150 caracteres) | Identificador del viaje (ej. *Eurotrip 2026*). |
| **Fecha de Inicio** | Fecha (`YYYY-MM-DD`) | Debe ser igual o posterior a la fecha actual. |
| **Cantidad de Días** | Número entero (`> 0`) | Duración total del viaje en días. |
| **Presupuesto Estimado** | Decimal (USD) | Presupuesto máximo disponible mayor a cero. |

### 3.2 ¿Cómo selecciono los destinos y medios de transporte?
1. Utilice el buscador de ciudades para agregar los destinos deseados (ej. París, Bruselas, Ámsterdam).
2. El sistema sugerirá tiempo de permanencia recomendable por ciudad según sus puntos de interés.
3. Indique el orden deseado o active la opción **Permitir al sistema optimizar el orden geográfico**.
4. Seleccione los medios de transporte permitidos:
   * ✈️ **Avión**
   * 🚆 **Tren**
   * 🚗 **Automóvil / Ómnibus**

### 3.3 ¿Cómo configuro las prioridades de optimización?
Mediante controles deslizantes (*sliders*), puede ajustar el grado de ponderación asignado a cada criterio:
* **Minimizar Costo Total (Económico):** Prioriza pasajes baratos y alojamiento económico.
* **Reducir Distancia / Tiempo de Traslado (Rápido):** Prioriza trayectos directos de menor duración.
* **Maximizar Atractivos Turísticos (Cultural):** Selecciona paradas con mayor valor patrimonial y cultural.
* **Minimizar Cambios de Alojamiento (Confort):** Agrupa noches en ciudades base para evitar traslados diarios de equipaje.

---

## 4. Generación y Comparación de Itinerarios

### 4.1 ¿Cómo genera SmartTrip las propuestas de itinerario?
Al presionar el botón **Generar Itinerario**, el motor inteligente del backend (`itinerarioService` y `routingService`) procesa sus preferencias, consulta datos geográficos y calcula típicamente **3 alternativas de ruta**:
1. **Opción Económica:** Enfocada en minimizar el gasto global de hospedaje y transporte.
2. **Opción Recomendada / Balanceada:** Equilibrio óptimo entre tiempo de viaje, costo y aprovechamiento turístico.
3. **Opción Turística / Panorámica:** Prioriza puntos de interés destacados y trayectos de alto valor escénico.

### 4.2 ¿Cómo comparo las diferentes alternativas de ruta?
El módulo de Comparación presenta una matriz resumen donde podrá contrastar lado a lado cada propuesta según los siguientes indicadores clave:

| Indicador | Opción Económica | Opción Recomendada | Opción Turística |
| :--- | :---: | :---: | :---: |
| **Costo Estimado Total** | Menor ($) | Intermedio ($$) | Mayor ($$$) |
| **Tiempo en Traslados** | Mayor duración | Optimizado | Rutas panorámicas |
| **Atractivos Incluidos** | Principales | Amplio catálogo | Máxima cobertura |
| **Puntaje Turístico** | 7.5 / 10 | 9.2 / 10 | 9.8 / 10 |

### 4.3 ¿Cómo selecciono o regenero una ruta optimizada?
* **Para seleccionar:** Haga clic en **Seleccionar esta Ruta** en la tarjeta de la alternativa deseada. Quedará guardada como el itinerario activo de su viaje.
* **Para regenerar:** Si ninguna opción se ajusta totalmente a sus necesidades, ajuste los controles de preferencia (sliders) y presione **Recalcular Itinerarios**.

---

## 5. Visualización en Mapa Interactivo y Ficha de Destinos

### 5.1 ¿Cómo exploro mi ruta en el mapa interactivo?
El módulo de Mapa dibuja geográficamente su trayecto utilizando coordenadas precisas (latitud/longitud):
* **Marcadores (Pins):** Representan las ciudades de origen, paradas intermedias y destinos finales.
* **Líneas de Tramo:** Muestran la conexión entre ciudades con códigos de color según el medio de transporte asignado.
* **Interactividad:** Haga clic sobre cualquier marcador para ver una ventana emergente (*popup*) con el tiempo sugerido y distancia al siguiente punto.

### 5.2 ¿Cómo consulto la información de cada ciudad y punto de interés?
Al hacer clic en el botón **Ver Detalles de la Ciudad**, accederá a la Ficha de Destino, la cual contiene:
* Descripción general de la ciudad y país.
* Galería fotográfica descriptiva.
* Lista de **Puntos de Interés (`PuntoInteres`)** categorizados (monumentos históricos, museos, parques naturales, gastronomía).

---

## 6. Calendario de Viaje y Estimación Presupuestaria

### 6.1 ¿Cómo se organiza el calendario diario de mi viaje?
El módulo Calendario distribuye los días asignando actividades concretas:
* **Días de Permanencia/Estadía:** Días completos dedicados al recorrido turístico de una ciudad.
* **Días de Traslado:** Muestra el tramo de transporte de un origen a un destino incluyendo tiempos estimados de viaje.
* **Vista Gantt / Cronograma:** Visualización gráfica y cronológica del progreso día por día durante todo el viaje.

### 6.2 ¿Cómo controlo y desgloso mi presupuesto estimado?
El módulo de Costos desglosa el presupuesto en **4 rubros principales**:
1. **Transporte:** Pasajes aéreos/ferroviarios o combustible/peajes según el vehículo.
2. **Alojamiento:** Estadías calculadas por noche en cada destino.
3. **Actividades y Entradas:** Puntos de interés y atracciones seleccionadas.
4. **Comidas y Gastos Diarios Estimados:** Estimación base diaria de alimentación y traslados urbanos.

> ⚠️ **Control de Presupuesto:**  
> Si el costo total estimado supera el presupuesto configurado en el paso inicial, la barra de estado se mostrará en color rojo indicando claramente el monto excedente.

---

## 7. Guía de Solución de Problemas (Troubleshooting)

### 7.1 Errores frecuentes de validación y cómo resolverlos

* **Error: *"Presupuesto insuficiente para la cantidad de días"***  
  * *Causa:* El costo mínimo calculado de transporte y estadía excede el límite fijado.  
  * *Solución:* Incremente el presupuesto o reduzca la cantidad de días / destinos.
* **Error: *"Correo electrónico ya registrado"***  
  * *Causa:* Ya existe un usuario creado con ese email.  
  * *Solución:* Utilice la opción de Iniciar Sesión o el formulario de recuperación de contraseña.
* **Error: *"Seleccione al menos un medio de transporte"***  
  * *Causa:* El formulario requiere definir qué transportes admite el viajero.  
  * *Solución:* Verifique haber tildado al menos un transporte válido (Auto, Tren o Avión).

### 7.2 Respuestas de fallback ante fallas en APIs externas
Si los servicios externos de mapas o proveedores de datos de ciudades sufren una interrupción o corte de red, SmartTrip activará el **modo de contingencia (fallback data)** utilizando la base de datos PostgreSQL local y catálogos precargados para mantener la estabilidad del sistema sin perder la información cargada por el usuario.

---

> **SOPORTE TÉCNICO Y COMUNIDAD:**  
> Para consultas sobre la arquitectura interna, ejecución de pruebas o reporte de incidentes, consulte el [Manual Técnico](MANUAL_TECNICO.md) y los repositorios oficiales de GitHub del proyecto SmartTrip.
