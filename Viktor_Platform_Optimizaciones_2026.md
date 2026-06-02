# Viktor Platform — Plan de Optimizaciones
**GF Innovative Solutions · Viktor v2 · Q2 2026**
*Documento de trabajo interno · Junio 2026*

---

## Contexto / Context

Esta plataforma funciona como el panel de control central para gestionar a **Víktor**, el agente de inteligencia artificial de marketing que opera vía Telegram. El objetivo es que sea el intermediario inteligente entre el cliente y el agente — bidireccional, en tiempo real y bilingüe.

**Principio rector:** La plataforma se adapta a Víktor, no al revés. Todo cambio en la plataforma debe notificar automáticamente a Víktor, y toda conversación con Víktor debe reflejarse en la plataforma.

---

## MEJORAS GLOBALES

### G1 · Sincronización bidireccional Víktor ↔ Plataforma
`Prioridad: ALTA`

Cualquier cambio en la plataforma debe llegar a Víktor automáticamente vía Telegram, sin que el usuario tenga que notificarlo manualmente.

- Implementar webhook o integración de Telegram Bot API para notificaciones push al agente cuando se detecte un cambio en la plataforma.
- Mostrar un log visible de sincronización: *"Cambio enviado a Víktor · hace 2 min"*.
- Agregar un chat embebido de Telegram dentro de la plataforma para centralizar toda la comunicación en un solo lugar.
- Garantizar que cada conversación con Víktor también se refleje en la plataforma (historial unificado).

---

### G2 · Interfaz bilingüe (ES / EN)
`Prioridad: ALTA`

Permitir cambiar el idioma de la interfaz entre español e inglés en cualquier momento.

- Agregar un selector de idioma visible en el header (ES / EN toggle).
- Todos los labels, tooltips, botones y mensajes del sistema deben estar traducidos.
- El idioma preferido del usuario se guarda automáticamente.

---

### G3 · Diseño visual más rico e intuitivo
`Prioridad: MEDIA`

La interfaz actual es funcional pero monótona. Agregar jerarquía visual, íconos y color para facilitar la lectura rápida.

- Usar íconos descriptivos en cada sección del menú lateral y en cada cuadro de información.
- Aplicar colores de acento diferenciados por sección (Business = azul, Audience = verde, Voice = violeta, etc.).
- Agregar hover states y micro-animaciones para feedback visual al interactuar.
- Usar tipografía con mayor jerarquía: H1 / H2 / body bien diferenciados.

---

### G4 · Edición inline en toda la plataforma
`Prioridad: ALTA`

El usuario debe poder editar cualquier campo directamente desde donde lo ve, sin redirigirse a otra pantalla.

- Cada bloque de texto / card debe tener un ícono de lápiz (✏️) al hacer hover, que abre edición inline.
- Botón de "Guardar" y "Cancelar" disponibles dentro del mismo bloque.
- Al guardar, el cambio se sincroniza automáticamente con Víktor (ver G1).
- Opción de "Revisar con Víktor" para abrir el chat directamente con contexto del campo editado.

---

### G5 · Dos nuevas secciones en el menú lateral
`Prioridad: MEDIA`

Agregar **Brand Identity Kit** y **Referencias** como botones permanentes en el menú.

- **Brand Identity Kit:** repositorio de fuentes, paleta de colores, logos, guías de uso fotográfico y gráfico. Si no existe todavía, Víktor sugerirá los elementos básicos.
- **Referencias:** espacio para subir posts de competidores, ejemplos de contenido que el cliente admira, y benchmarks de la industria.

---

## COMPANY CONTEXT

### CC1 · Agregar canales de publicación
`Prioridad: ALTA`

La sección debe incluir los canales activos donde se publica contenido.

- Agregar un bloque "Canales activos" con íconos seleccionables: LinkedIn, Instagram, Facebook, X (Twitter).
- Cada canal habilitado debe ser un acceso directo clickeable al perfil real de la empresa.
- El canal seleccionado debe integrarse con la lógica de Weekly Focus y Content Calendar.

---

### CC2 · Sección "What success looks like" → incluir Objetivos
`Prioridad: MEDIA`

Renombrar o ampliar esta sección para que sea más orientada a metas concretas y medibles.

- Agregar el concepto de "Objetivos del trimestre" con fecha de vencimiento visible.
- Mostrar el progreso hacia cada objetivo con una barra de porcentaje simple.
- Vincular cada objetivo con los KPIs correspondientes de la sección Goals vs Actuals.

---

## GOALS VS ACTUALS

### GV1 · Indicador de fecha actual en Monthly Reach
`Prioridad: ALTA`

El usuario no sabe en qué punto del mes está mientras mira el gráfico.

- Agregar una línea vertical etiquetada "HOY" / "TODAY" en el gráfico de Monthly Reach.
- Mostrar la fecha actual visible en el header del gráfico: *"Junio 2026 · Semana 1"*.

---

### GV2 · Filtros de fecha dinámicos
`Prioridad: MEDIA`

Permitir ver datos de períodos específicos o comparar semanas/meses pasados.

- Selector de rango de fechas: semana actual, mes, trimestre, o rango personalizado.
- Filtro por semana específica dentro del trimestre (Semana 1, 2, 3…).
- Opción de comparar período actual vs período anterior (ej: Abril vs Mayo).

---

### GV3 · Acceso directo a cada canal desde sus KPIs
`Prioridad: MEDIA`

Cada KPI de canal debe llevar directamente al perfil de ese canal.

- En la card de LinkedIn Impressions, agregar un botón "→ Ver LinkedIn" que abre el perfil.
- Aplicar lo mismo a Workshop Sign-ups (link a página de registro), Newsletter, etc.

---

### GV4 · Weekly Focus basado en buenas prácticas de marketing
`Prioridad: ALTA`

Restructurar el Weekly Focus para reflejar los tres ejes del marketing moderno.

- Cada semana debe mostrar claramente: **¿Por qué canal?** · **¿Qué decimos?** · **¿A quién?**
- Agregar un campo de KPI asociado a esa semana con el objetivo numérico.
- El Weekly Focus debe poder editarse directamente desde esta vista.
- Víktor debe recibir automáticamente el Weekly Focus actualizado al inicio de cada semana.

---

## STRATEGY

### ST1 · Edición y revisión de estrategia con Víktor
`Prioridad: ALTA`

El usuario debe poder revisar y modificar la estrategia, y abrir una conversación de revisión con Víktor.

- Cada bloque de estrategia tiene botón ✏️ para edición inline.
- Agregar botón "💬 Revisar con Víktor" que abre el chat embebido con el contexto de ese bloque pre-cargado.
- Mostrar la fecha de última modificación en cada bloque de estrategia.

---

### ST2 · Colores diferenciados por tipo de contenido estratégico
`Prioridad: BAJA`

La sección de estrategia actualmente es visualmente plana.

- Usar colores distintos para: Posicionamiento (azul), Tono de voz (verde), Audiencia target (violeta), Restricciones (rojo suave).
- Agregar íconos por categoría para facilitar el escaneo visual rápido.

---

## AI SUGGESTIONS + APPROVALS → UNIFICACIÓN

### AS1 · Unificar AI Suggestions y Approvals en un panel "Pendientes"
`Prioridad: ALTA`

Actualmente hay confusión entre ambas secciones. Unificarlas mejora la claridad para el usuario.

- Crear un panel unificado llamado **"Pendientes"** (o "Your Next Actions").
- Separar por categorías dentro del panel: "Sugerencias de Víktor" y "Esperando tu aprobación".
- Mantener el badge de contador numérico visible en el menú lateral.
- Cada ítem debe tener opciones: **Aprobar · Rechazar · Revisar con Víktor**.

---

### AS2 · Chat directo con Víktor desde el panel de Sugerencias
`Prioridad: ALTA`

Eliminar el paso de "copy and paste in Telegram" — el chat debe estar integrado.

- Agregar un panel de chat de Telegram embebido en la plataforma (widget o mini-ventana).
- Al clickear "Discutir con Víktor" en cualquier sugerencia, el chat se abre con el contexto pre-cargado.
- El historial del chat se sincroniza con la plataforma para que sea consultable.

---

## CONTENT CALENDAR

### CAL1 · Vista de calendario trimestral
`Prioridad: ALTA`

El usuario necesita ver el panorama completo de publicaciones del trimestre.

- Agregar una vista de 3 meses (trimestre completo) con las fechas de publicación marcadas.
- Vista mensual con indicadores visuales de días con contenido programado.
- Toggle entre vista: semana / mes / trimestre.

---

### CAL2 · Edición directa de copy e imágenes desde el calendario
`Prioridad: ALTA`

El usuario debe poder modificar captions y subir imágenes sin pasar por Víktor.

- Cada publicación en el calendario tiene botón de edición de caption/copy directamente.
- Opción de subir imagen/diseño propio directamente en la publicación, sin necesidad de que Víktor la diseñe.
- Al modificar, el cambio se sincroniza con Víktor automáticamente.
- Indicador de estado por publicación: `Borrador` / `Pendiente aprobación` / `Aprobado` / `Publicado`.

---

## PIPELINE

### PP1 · Corrección de visibilidad de botones
`Prioridad: ALTA`

Los botones actuales son transparentes y difíciles de leer.

- Revisar contraste de todos los botones del pipeline — deben cumplir estándar WCAG AA mínimo.
- Aplicar color de fondo sólido a todos los botones de acción dentro del pipeline.

---

### PP2 · Espacio para ideas del usuario
`Prioridad: MEDIA`

Los emprendedores tienen ideas que deben poder capturarse en el mismo flujo del pipeline.

- Agregar un estado inicial en el pipeline llamado **"💡 Idea"** o "Inspiration".
- El usuario puede crear una idea con un prompt libre: título + descripción corta.
- Las ideas del usuario se diferencian visualmente de las propuestas de Víktor.
- Víktor recibe notificación automática cuando el usuario agrega una nueva idea.

---

## VISUAL LIBRARY / ASSETS

### VL1 · Estructura de carpetas dentro de Visual Library
`Prioridad: MEDIA`

Organizar los recursos visuales de forma lógica y accesible.

- 📁 **Brand Identity Kit** — fuentes, colores, logos, guías de uso.
- 📁 **Referencias** — posts de competidores, benchmarks, inspiración.
- 📁 **Diseños de Víktor** — producción centralizada del agente.
- 📁 **Mis uploads** — imágenes y diseños propios del cliente.
- Opción de agregar tags a cada recurso para búsqueda rápida.

---

## PERFORMANCE

### PF1 · Dashboard de KPIs personalizable
`Prioridad: MEDIA`

El usuario debe poder elegir qué KPIs ver y combinarlos según su análisis.

- Vista general con los KPIs más importantes (resumen ejecutivo).
- Modo avanzado: selección de KPIs individuales para análisis específico.
- Posibilidad de combinar dos KPIs en un mismo gráfico para cruzar datos.
- Filtro de fechas: semana, mes, trimestre, rango personalizado.
- Conectar con Google Analytics para datos en tiempo real (cuando esté disponible).

---

## LEARNINGS

### LE1 · Filtros por fecha y confianza en Learnings
`Prioridad: BAJA`

Permitir navegar el historial de aprendizajes de forma más flexible.

- Agregar selector de período en Learnings: semana X, mes X, o trimestre.
- El filtro por confianza (High / Medium / Low) ya existe — mantenerlo y mejorarlo visualmente.
- Opción de marcar un Learning como "aplicado" cuando ya se implementó el cambio de comportamiento.

---

### LE2 · Ciclo hipótesis → resultado → aprendizaje visible
`Prioridad: MEDIA`

La lógica de testing es la columna vertebral del sistema — debe ser más explícita.

- Cada Learning debe mostrar claramente: **Hipótesis → Qué pasó → Aprendizaje → Cambio de comportamiento**.
- Agregar un campo "Nueva hipótesis generada" que alimenta el siguiente ciclo.
- Víktor debe poder proponer nuevos Learnings automáticamente basados en resultados de Performance.

---

## Resumen de Prioridades

### 🔴 Prioridad Alta
- G1 · Sincronización Telegram ↔ Plataforma
- G4 · Edición inline global
- CC1 · Canales de publicación
- GV1 · Indicador HOY en Monthly Reach
- GV4 · Weekly Focus marketing-first (canal / mensaje / audiencia)
- ST1 · Edición + revisión con Víktor
- AS1 · Unificar Sugerencias + Approvals en panel "Pendientes"
- AS2 · Chat Telegram embebido en la plataforma
- CAL1 · Vista trimestral del calendario
- CAL2 · Edición directa de copy + imágenes
- PP1 · Botones visibles en Pipeline

### 🟡 Prioridad Media
- G2 · Interfaz bilingüe ES/EN
- G3 · Diseño visual más rico con íconos y color
- G5 · Brand Identity Kit + Referencias en menú
- CC2 · Objetivos en "What success looks like"
- GV2 · Filtros de fecha dinámicos
- GV3 · Acceso directo a canales desde KPIs
- PP2 · Ideas del usuario en Pipeline
- VL1 · Estructura de carpetas en Visual Library
- PF1 · Dashboard KPIs personalizable
- LE2 · Ciclo hipótesis → aprendizaje visible

### 🟢 Prioridad Baja
- ST2 · Colores diferenciados en Estrategia
- LE1 · Filtros por fecha en Learnings

---

*GF Innovative Solutions · Viktor Platform · Optimization Plan · Junio 2026*
