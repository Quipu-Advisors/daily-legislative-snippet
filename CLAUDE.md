# Daily Legislative Snippet — Guía del proyecto

Vitrina **gratuita para potenciales clientes** del monitoreo legislativo de Quipu Advisors.
Es el hermano público del **Smart Snippet** interno (repo `Quipu-Advisors/Snippet-digital`): misma
estética, pero **solo lectura**, con login por cuenta y filtros por sector/jurisdicción definidos
desde un módulo admin, y vencimiento de acceso configurable a **cualquier fecha** (así se resuelve
"dar el monitoreo gratis por X meses" — no hay que tocar código para eso, es un campo del admin).

> Mantenimiento con **Claude Code**: abrí esta carpeta y pedí el cambio en lenguaje natural.

---

## Estado actual (actualizado 2026-09-02) — leer esto primero

Deploy end-to-end funcionando, en producción, con datos reales sincronizándose desde Smart
Snippet. Repo **privado** (pasó de público a privado el 2026-09-01 — GitHub Pages se desactivó
solo como efecto colateral, ver [[snippet-digital]] para el motivo). Cambios recientes de fondo:

- **Pipeline ampliado (2026-09-02):** el sync ahora pasa el campo `tipo` (`proyecto_ley` / `norma`
  / `resumen_sesion`) y excluye el contenido regional (Chile/Uruguay/Paraguay) — ver sección
  "Tipos de ítem" más abajo. `index.html` ya no antepone "El proyecto de ley tiene por objeto"
  para ítems que no son `proyecto_ley`, y muestra "Argentina" en vez de "Nacional".
- **`PASS_ENC_KEY` ya no está hardcodeada en `setup.sql`** — vive en la tabla `app_secrets` (RLS
  cerrado), leída por la función `_pass_enc_key()`. Verificado funcionando (login de prospecto +
  "Ver contraseña" desde `admin.html`, confirmado por Lucas). Si hace falta tocar esto de nuevo:
  el primer intento con `alter database ... set app.settings...` **falló** por permisos de
  Supabase gestionado — no repetir ese camino, usar la tabla.

El detalle completo de la puesta en marcha original (Supabase, Vercel, dominio, GitHub Pages)
queda abajo como historial — ya no hace falta releerlo para entender el estado actual, pero sirve
si hay que retomar algo puntual de esa etapa.

---

## Estado en la puesta en marcha (histórico, 2026-08-24 — ya no es el estado actual)

**Deploy completo y funcionando end-to-end**, salvo dominio propio (cosmético, no bloquea).
Verificado hoy en producción (`daily-legislative-snippet.vercel.app`): login de admin confirmado
funcionando con la contraseña real, `/api/sync` responde (probado sin credenciales reales, devolvió
401 como corresponde — confirma que las env vars de Vercel están bien cargadas). Falta crear la
primera cuenta de prueba desde `admin.html` y correr una sincronización real para ver datos de
verdad en `index.html`.

**⚠️ Bug crítico ya arreglado — si algo similar vuelve a pasar, leer esto:** `crypt`/`gen_salt`
(pgcrypto) viven en el schema `extensions` de Supabase, no en `public`. Las funciones
`SECURITY DEFINER` de `setup.sql` fijan `search_path = public` por seguridad, así que cualquier
llamada sin calificar a `crypt`/`gen_salt` fallaba en tiempo de ejecución. Esto rompía **todo** lo
que use contraseñas: `admin_check()` atrapaba el error y devolvía `false` siempre (parecía
"contraseña incorrecta" con cualquier contraseña), y `prospect_login`/`admin_create_account`/
`admin_reset_password` habrían tirado error directo. Ya está arreglado en el código (calificado
como `extensions.crypt(...)`/`extensions.gen_salt(...)` en las 5 llamadas) y parchado en la base
de Lucas. Si se crea otro proyecto Supabase Free con este mismo patrón, aplicar la calificación
desde el arranque.

Resto del historial de la puesta en marcha, por si hace falta retomar algo puntual:

- ✅ Repo renombrado de `daily-legal-snippet` a `daily-legislative-snippet` (2026-08-24, para no
  confundirlo con el correo interno homónimo) y transferido a la organización de GitHub de Quipu:
  **`Quipu-Advisors/daily-legislative-snippet`**. Carpeta local y remote actualizados. Limpio,
  sincronizado con `origin/main`.
- 📋 **Plan de consolidación de hosting (2026-08-24):** hoy Smart Snippet vive en GitHub Pages
  bajo la cuenta personal de Camila (`camila509/Snippet-digital`) y este repo iba a Vercel bajo
  la cuenta personal de Lucas. Se decidió: (1) los dos repos pasan a la organización
  `Quipu-Advisors` — este ya migrado, **falta que Camila transfiera `camila509/Snippet-digital`**
  a la organización (Settings → Danger Zone → Transfer, en su repo — Lucas es admin de la org y
  puede aceptar la transferencia, pero solo Camila puede iniciarla porque Lucas no tiene permiso
  admin sobre ese repo, solo push); (2) las dos apps se despliegan en Vercel (no en GitHub Pages),
  conectadas a la organización; (3) este repo obtiene dominio propio
  **`monitoreolegislativo.quipuadvisors.com`** (CNAME a cargar en el DNS de GoDaddy una vez que
  Vercel esté configurado); Smart Snippet, al ser 100% interno, no necesita dominio propio.
- ✅ `index.html`, `admin.html`, `api/sync.js`, `setup.sql`, `vercel.json` completos y
  consistentes entre sí (mismas listas de sectores/jurisdicciones que el Smart Snippet).
- ✅ El propio `index.html` detecta la falta de configuración y muestra un aviso prolijo
  ("Configuración pendiente...") en vez de romperse — probado local hoy, sin errores de consola.
- ✅ Los filtros de sector/jurisdicción del prospecto ahora se **recuerdan entre sesiones**
  (localStorage por cuenta, igual que Smart Snippet) — antes se reseteaban a "todos" en cada
  login. Falta de todos modos la prueba end-to-end con Supabase real (ver "Verificar un cambio").
- ⚠️ **GitHub Pages de este repo YA ESTÁ PRENDIDO** y sirviendo esa pantalla de "Configuración
  pendiente" en `https://quipu-advisors.github.io/daily-legislative-snippet/` — público, pero sin
  datos reales ni credenciales (son placeholders). No es urgente apagarlo, pero se apaga cuando
  Vercel + el dominio propio estén vivos (ver Paso 4 más abajo).
- ✅ **Vercel ya está deployado** (2026-08-24): `daily-legislative-snippet.vercel.app`, cuenta
  personal de Lucas en plan Hobby (gratis — decisión consciente, ver memoria del proyecto).
  Muestra "Configuración pendiente" como es esperable — todavía sin Supabase ni env vars.
  Smart Snippet también deployado en paralelo: `snippet-digital.vercel.app`, funcionando.
- ❌ **Falta el proyecto Supabase propio** de este proyecto (Paso 1 abajo). `SB_URL`/`SB_ANON`
  en `index.html` y `admin.html` siguen como `'PEGAR_URL_SUPABASE'` / `'PEGAR_ANON_KEY'`, y el
  proyecto de Vercel todavía no tiene las 5 variables de entorno cargadas (Paso 3).
- 📌 **Decisión pendiente, no bloqueante:** notificación por email al prospecto. Lucas se
  inclina (2026-08-24, "vamos viendo") por un correo **general** (no personalizado por cuenta)
  con las novedades del día + link al sitio, pero todavía no está resuelto el proveedor de email
  transaccional ni el contenido exacto. No se construye hasta que se decida — no forma parte del
  deploy actual.

**Qué falta para que esto quede funcionando (en orden, ~20-30 min, una sola vez):**

### Paso 1 — Crear el proyecto Supabase (nuevo, separado del interno)

1. Andá a [supabase.com](https://supabase.com) → **New Project**. Nombre sugerido:
   `daily-legislative-snippet` (organización: la misma que uses para el resto de Quipu, o una nueva
   gratis — no importa, es un proyecto Free Tier aparte del Smart Snippet).
2. Anotá la contraseña de la base que te pida crear (no la vas a necesitar de nuevo si no la
   perdés, Supabase la pide solo para el Postgres directo, no para esto).
3. Una vez creado, andá a **SQL Editor** → pegá **todo** el contenido de [`setup.sql`](setup.sql)
   de esta carpeta.
4. **Antes de correrlo**, en la línea marcada `>>> CAMBIAR <<<` (sección 2, cerca de la línea 66)
   reemplazá `'CAMBIAME_ADMIN'` por la contraseña que quieras usar para entrar a `admin.html`.
   Guardala — es la que vas a usar vos/Ventas para crear cuentas de prospectos.
5. Click **Run**. Tiene que terminar sin error (crea 3 tablas + 9 funciones RPC).
6. Andá a **Project Settings → API** y copiá dos valores:
   - **Project URL** (algo como `https://xxxxxxxx.supabase.co`)
   - **anon / public key** (empieza con `eyJ...` o `sb_publishable_...`)
7. **Pasame esos dos valores** (URL + anon key) — con eso termino de pegarlos en `index.html` y
   `admin.html` y hago el commit + push. No hace falta que los pegues vos a mano si preferís
   dármelos en el chat: no son secretos sensibles (la clave anon está pensada para ser pública,
   es la misma lógica que ya usa el Smart Snippet), pero **la contraseña de admin del Paso 4 no
   me la pases** — esa se guarda hasheada en Supabase, no en el código, y solo la necesitás vos
   para entrar a `admin.html` y para el env var `DLS_ADMIN_PASS` del Paso 3.

### Paso 2 — Probar local (te lo hago yo)

Con los dos valores del Paso 1, pego `SB_URL`/`SB_ANON` reales en ambos HTML, abro el preview
local y confirmo que el login de `admin.html` funciona con tu contraseña y que se puede crear una
cuenta de prueba. Recién ahí seguimos al deploy.

### Paso 3 — Cargar las variables de entorno en Vercel

**Ya hecho (2026-08-24):** proyecto de Vercel creado e importado (`daily-legislative-snippet.vercel.app`,
cuenta personal de Lucas, plan Hobby gratis — decisión consciente). Falta cargar las 5 variables
de entorno (**Settings → Environment Variables** del proyecto en Vercel):

   | Variable | Valor |
   |---|---|
   | `INTERNAL_SB_URL` | *(no hace falta, ya está hardcodeada en `api/sync.js` — no la agregues)* |
   | `INTERNAL_SB_ANON` | `sb_publishable_LHaQlBOrhJ5CRyISMiuXhg_0s6Unaxf` (la clave anon del Smart Snippet — pública, ya está en `snippet-digital-repo/index.html`, la copio yo si preferís) |
   | `DLS_SB_URL` | La **Project URL** de Supabase que sacaste en el Paso 1 |
   | `DLS_SB_ANON` | La **anon key** de Supabase que sacaste en el Paso 1 |
   | `DLS_ADMIN_PASS` | La contraseña de admin que pusiste en el Paso 1.4 (la real, no `CAMBIAME_ADMIN`) |
   | `CRON_SECRET` | Cualquier string largo random — generalo vos, ej. pegando 40 caracteres random; no hace falta anotarlo en ningún otro lado, Vercel lo usa solo para autenticar su propio cron |

Después de cargar las 5 variables, hay que forzar un **Redeploy** (Vercel no las aplica solo con
guardarlas — pestaña **Deployments** del proyecto → "..." del último deploy → **Redeploy**). Ya
queda funcionando en `daily-legislative-snippet.vercel.app` (podés probar `admin.html` con tu
contraseña, crear una cuenta de prueba, y tocar "Sincronizar ahora" para traer los últimos 30
días del Smart Snippet). El cron diario (`vercel.json`, `0 15 * * *` = 12:00 ART) sincroniza
solo desde ese momento en adelante — no hace falta hacer nada más.

### Paso 4 — Dominio propio (✅ listo, 2026-08-24) + apagar GitHub Pages (pendiente)

- **Dominio propio activo**: `https://monitoreolegislativo.quipuadvisors.com` (y `/admin.html`).
  CNAME en GoDaddy apuntando a `5c926fa0efe8b83f.vercel-dns-017.com`. Verificado con `curl`:
  200 OK, HTTPS válido. Smart Snippet también tiene el suyo:
  `smartsnippet.quipuadvisors.com` (CNAME a `1c7a9ac1d03b311b.vercel-dns-017.com`).
- Pendiente: avisar cuando el dominio propio esté siendo usado de verdad y apagar el GitHub
  Pages de este repo (`gh api -X DELETE repos/Quipu-Advisors/daily-legislative-snippet/pages`)
  para que no quede una copia vieja/placeholder dando vueltas en dos URLs distintas.

**Resumen de quién hace qué:** Vos hacés Supabase (Paso 1, ~10 min) y Vercel (Paso 3, ~10 min,
requiere tu login). Yo hago el resto: pegar las claves en el código, probar, pushear, y avisarte
cuando esté todo verificado end-to-end.

---

## Regla de oro (no romper)

**Esta app vive en una base Supabase SEPARADA de la interna.** La base de prospectos solo
contiene proyectos de ley (información pública). **Nunca** debe recibir calificaciones de
impacto, nombres de clientes ni nada de la tabla `selections` interna. El sync copia solo la
tabla `projects` y pasa cada proyecto por una whitelist de campos (`PROJ_FIELDS` en `api/sync.js`).

**Decisión tomada (no pendiente):** el prospecto ve *todo* lo monitoreado ese día, acotado solo
por el sector/jurisdicción de su cuenta — no solo lo que el equipo marcó como relevante para
algún cliente en Smart Snippet. Cambiar esto exigiría tocar el sync para leer `selections` sin
exponer clientes, y no está planeado.

**Tipos de ítem (2026-09):** Smart Snippet ahora publica tres tipos (`tipo`: `proyecto_ley` /
`norma` / `resumen_sesion` — ver su `CLAUDE.md`, sección "Tipos de ítem"). Los tres llegan acá
igual, `sanitizeProject` solo pasa el campo. `index.html` no antepone "El proyecto de ley tiene
por objeto" salvo para `proyecto_ley`, usa `white-space:pre-wrap` en `.cresumen` para no aplastar
los párrafos de un `resumen_sesion` largo, el link `linkTexto` dice "Fuente oficial" en vez de
"Texto" para ese tipo (ahí es un video/registro de sesión, no un documento), `org` pasa por
`mapOrg()` (igual que Smart Snippet) antes de mostrarse en el pill — sin esto, el organismo de un
`resumen_sesion` (lista larga de comisiones) sale como un pill gigante en vez de un label corto —
y `tipoIconHTML(p)` antepone un ícono al título (`ti-messages`/`ti-gavel`/`ti-file-text` según
`tipo`) para distinguir el tipo sin abrir la tarjeta. **Este `index.html`
es un codebase separado del de Smart Snippet** — cualquier arreglo de render que se haga en uno
hay que evaluar si también aplica acá; no se sincronizan solos.

**Monitoreo regional NO se publica acá (decisión de producto, no técnica):** Smart Snippet suma
Chile/Uruguay/Paraguay como valores de `jur`. `api/sync.js` filtra y descarta cualquier ítem con
esos valores antes de publicar — DLS se sigue vendiendo como monitoreo de Argentina. Si algún día
se decide ofrecer LatAm regional a prospectos, sacar el filtro de `PAISES_REGIONALES` en
`api/sync.js` y sumar el país como filtro por cuenta en `admin.html` (hoy solo filtra por sector
y jurisdicción argentina).

---

## Arquitectura

- **`index.html`** — app del prospecto. Login (usuario+contraseña por cuenta), lista de
  proyectos de los últimos 30 días filtrada por servidor según la cuenta, solo lectura.
- **`admin.html`** — módulo de Research: crear/editar cuentas, definir sectores y
  jurisdicciones por cuenta, vencimiento del trial, y el botón "Sincronizar ahora".
- **`api/sync.js`** — función serverless (Vercel) que hace el sync: lee la tabla `projects`
  interna con claves en variables de entorno y publica a la base de prospectos. La dispara
  **dos crons diarios, 13:00 y 16:00 ART** (`vercel.json`, expresado en UTC) o el botón del admin.
  Hobby permite varios cron jobs por proyecto mientras cada uno corra ≤1 vez/día (no es "un cron
  total") — igual no asegura el minuto exacto, cada uno puede disparar en cualquier momento
  dentro de esa hora (±59 min, límite documentado de Vercel Hobby). `admin_sync_projects` hace
  `upsert` por fecha (`on conflict (date) do update`), así que correrlo varias veces al día no
  duplica nada — pisa la fila del día con el snapshot más reciente cada vez.
- **`setup.sql`** — esquema completo de la base nueva. Se corre una vez en el SQL Editor
  de Supabase (y de nuevo si se quiere cambiar la contraseña admin).
- **Hosting:** Vercel (estáticos + función + cron), conectado a este repo — cada push a
  `main` redeploya solo. **Datos:** proyecto Supabase propio (distinto del interno).
- Sin build, sin frameworks. El único código de servidor es `api/sync.js`.

### Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Qué es |
|---|---|
| `INTERNAL_SB_ANON` | Clave pública (anon) de la base interna del Smart Snippet |
| `DLS_SB_URL` / `DLS_SB_ANON` | URL y clave pública del Supabase de esta app |
| `DLS_ADMIN_PASS` | Contraseña admin (la del `setup.sql`) — la usa el cron |
| `CRON_SECRET` | String largo aleatorio; Vercel lo manda en el header del cron |

### Modelo de seguridad (distinto del interno, a propósito)

- RLS habilitado sin policies → la clave anon **no puede leer ninguna tabla directamente**.
- Todo pasa por funciones RPC `SECURITY DEFINER` que validan credenciales en cada llamada:
  `prospect_login`, `prospect_projects`, `admin_*`.
- El filtrado por sector/jurisdicción y la ventana de 30 días se aplican **en el servidor**:
  el prospecto nunca recibe datos que no le corresponden, ni mirando el network tab.
- **Contraseña de admin**: hasheada con bcrypt (irreversible) — no se recupera, se resetea.
  Protege todo lo demás, no se toca este criterio.
- **Contraseñas de prospectos**: cifradas de forma **reversible** (pgcrypto
  `pgp_sym_encrypt`/`pgp_sym_decrypt`, columna `pass_enc`), a propósito — decisión de Lucas
  (2026-08-24): son tokens generados por Quipu (no elegidos ni reusados por el prospecto) que
  solo destraban información pública, y el admin necesita poder mostrárselas de nuevo si se
  pierden, sin resetear cada vez. Botón "Ver contraseña" en `admin.html` (RPC
  `admin_show_password`). La clave de cifrado (`PASS_ENC_KEY`) está hardcodeada en las 4
  funciones que la usan en `setup.sql` — cuentas creadas antes de este cambio (con el hash
  bcrypt viejo) no se pueden "ver", solo resetear una vez para pasarlas al formato nuevo.
- La clave anon de la base **interna** NO está en el código: vive como variable de entorno
  en Vercel y solo la usa `api/sync.js`.
- ⚠️ **Ojo con `search_path`**: `crypt`/`gen_salt`/`pgp_sym_encrypt`/`pgp_sym_decrypt` de
  pgcrypto viven en el schema `extensions` de Supabase, no en `public`. Las funciones fijan
  `search_path = public` por seguridad, así que **toda** llamada a estas funciones debe ir
  calificada como `extensions.crypt(...)` etc. — si no, falla en tiempo de ejecución (ver bug
  documentado en "Estado actual" más arriba).

---

## Flujo de uso

1. **Research carga el snippet del día en el Smart Snippet interno** (flujo de siempre, sin cambios).
2. **El cron sincroniza solo a las 12:00** (publica los últimos 30 días). Si cargaron el
   snippet más tarde, botón "Sincronizar ahora" en `admin.html`.
3. Ventas crea cuentas en la pestaña **Cuentas**: usuario + contraseña generada + sectores +
   jurisdicciones + vencimiento (default 30 días; se puede sacar). Copia las credenciales al crearlas.
4. El prospecto entra a la URL pública con su usuario. Ve solo lo suyo, últimos 30 días.
5. `Último ingreso (n)` en la lista de cuentas = señal de interés para seguimiento comercial.

---

## Cambios comunes (dónde tocar)

| Quiero… | Dónde |
|---|---|
| Pegar URL/clave del Supabase nuevo | `SB_URL` / `SB_ANON` al inicio del `<script>` en **ambos** HTML |
| Cambiar el email de contacto del pie | `CONTACT_EMAIL` en `index.html` |
| Cambiar la contraseña de admin | Re-correr el INSERT de la sección 2 de `setup.sql` **y** actualizar `DLS_ADMIN_PASS` en Vercel |
| Cambiar la hora del cron | array `crons` en `vercel.json` (en UTC: hoy `0 16 * * *` = 13:00 ART y `0 19 * * *` = 16:00 ART). Hobby: cada entrada ≤1 vez/día, precisión ±59 min — no más de una entrada por hora exacta. |
| Cambiar la ventana de días | `SYNC_DAYS` en admin.html y `api/sync.js`, **y** los `30`/`45` en `setup.sql` (`prospect_projects` y `admin_sync_projects`) |
| Agregar sectores/provincias | `SECTORES`/`PROVINCIAS` en ambos HTML y en `api/sync.js` (deben coincidir con la app interna) |
| Texto del disclaimer / CTA | función `renderMain()` en `index.html` |
| URL de la base interna (solo sync) | `INTERNAL_SB_URL` en `api/sync.js` |

---

## Qué NO tiene (decisiones, no faltantes)

- Sin calificación de impacto, sin cutoff de fechas, sin consolidado, sin export a Sheets.
- Sin histórico más allá de 30 días (la muestra abre el apetito, no regala el archivo).
- Sin auto-registro: las cuentas las crea Research desde el admin.

## Verificar un cambio

Los HTML son autocontenidos: abrilos en el navegador. Para chequear sintaxis JS tras un
cambio grande, Claude Code puede extraer el `<script>` y correr `node --check`.
