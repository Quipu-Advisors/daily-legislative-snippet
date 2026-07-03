# Daily Legal Snippet — Guía del proyecto

Vitrina **gratuita para potenciales clientes** del monitoreo legislativo de Quipu Advisors.
Es el hermano público del **Smart Snippet** interno (repo `camila509/Snippet-digital`): misma
estética, pero **solo lectura**, con login por cuenta y filtros por sector/jurisdicción definidos
desde un módulo admin.

> Mantenimiento con **Claude Code**: abrí esta carpeta y pedí el cambio en lenguaje natural.

---

## Regla de oro (no romper)

**Esta app vive en una base Supabase SEPARADA de la interna.** La base de prospectos solo
contiene proyectos de ley (información pública). **Nunca** debe recibir calificaciones de
impacto, nombres de clientes ni nada de la tabla `selections` interna. El sync copia solo la
tabla `projects` y pasa cada proyecto por una whitelist de campos (`PROJ_FIELDS` en admin.html).

---

## Arquitectura

- **`index.html`** — app del prospecto. Login (usuario+contraseña por cuenta), lista de
  proyectos de los últimos 30 días filtrada por servidor según la cuenta, solo lectura.
- **`admin.html`** — módulo de Research: crear/editar cuentas, definir sectores y
  jurisdicciones por cuenta, vencimiento del trial, y el botón de sincronización.
- **`setup.sql`** — esquema completo de la base nueva. Se corre una vez en el SQL Editor
  de Supabase (y de nuevo si se quiere cambiar la contraseña admin).
- **Hosting:** GitHub Pages. **Datos:** proyecto Supabase propio (distinto del interno).
- Sin build, sin frameworks, sin servidor — igual que el Smart Snippet.

### Modelo de seguridad (distinto del interno, a propósito)

- RLS habilitado sin policies → la clave anon **no puede leer ninguna tabla directamente**.
- Todo pasa por funciones RPC `SECURITY DEFINER` que validan credenciales con bcrypt
  (pgcrypto) en cada llamada: `prospect_login`, `prospect_projects`, `admin_*`.
- El filtrado por sector/jurisdicción y la ventana de 30 días se aplican **en el servidor**:
  el prospecto nunca recibe datos que no le corresponden, ni mirando el network tab.
- Las contraseñas se guardan hasheadas: no se recuperan, se resetean.
- La clave anon de la base **interna** NO está en este repo: el admin la pega una vez en la
  pestaña Sincronizar y queda en localStorage de su navegador.

---

## Flujo de uso

1. **Research carga el snippet del día en el Smart Snippet interno** (flujo de siempre, sin cambios).
2. Abre `admin.html` → pestaña **Sincronizar** → un clic. Eso publica los últimos 30 días.
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
| Cambiar la contraseña de admin | Re-correr el INSERT de la sección 2 de `setup.sql` |
| Cambiar la ventana de días | `SYNC_DAYS` en admin.html **y** los `30`/`45` en `setup.sql` (`prospect_projects` y `admin_sync_projects`) |
| Agregar sectores/provincias | `SECTORES`/`PROVINCIAS` en ambos HTML (deben coincidir con la app interna) |
| Texto del disclaimer / CTA | función `renderMain()` en `index.html` |
| URL de la base interna (solo sync) | `INTERNAL_SB_URL` en admin.html |

---

## Qué NO tiene (decisiones, no faltantes)

- Sin calificación de impacto, sin cutoff de fechas, sin consolidado, sin export a Sheets.
- Sin histórico más allá de 30 días (la muestra abre el apetito, no regala el archivo).
- Sin auto-registro: las cuentas las crea Research desde el admin.

## Verificar un cambio

Los HTML son autocontenidos: abrilos en el navegador. Para chequear sintaxis JS tras un
cambio grande, Claude Code puede extraer el `<script>` y correr `node --check`.
