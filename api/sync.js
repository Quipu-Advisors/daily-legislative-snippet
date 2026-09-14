// ============================================================
// /api/sync — Sincroniza los proyectos del Smart Snippet interno
// a la base de prospectos del Daily Legal Snippet.
//
// Se dispara de dos formas:
//   1. CRON de Vercel (diario, ver vercel.json): autenticado con el
//      header "Authorization: Bearer <CRON_SECRET>" que Vercel agrega solo.
//   2. Manual desde admin.html: POST {admin: "<contraseña admin>"} —
//      la contraseña se valida contra la base (RPC admin_check).
//
// Variables de entorno requeridas (Settings → Environment Variables en Vercel):
//   INTERNAL_SB_ANON  clave pública (anon) de la base INTERNA del Smart Snippet
//   DLS_SB_URL        URL del proyecto Supabase del Daily Legal Snippet
//   DLS_SB_ANON       clave pública (anon) del Daily Legal Snippet
//   DLS_ADMIN_PASS    contraseña del módulo admin (la del setup.sql) — la usa el cron
//   CRON_SECRET       cualquier string largo aleatorio (Vercel lo manda en el cron)
//
// Regla de oro: solo se lee la tabla `projects` interna (proyectos de ley,
// información pública). NUNCA `selections` ni nada con clientes pagos.
// Cada proyecto pasa por una whitelist de campos antes de publicarse.
//
// Monitoreo regional (2026-09): Smart Snippet sumó Chile/Uruguay/Paraguay como valores de `jur`.
// Ese contenido NO se sincroniza a DLS por ahora (decisión de producto, no técnica) — se filtra
// antes de publicar. Si en algún momento DLS pasa a ofrecer LatAm regional, sacar el filtro de
// PAISES_REGIONALES de abajo y sumar el país como filtro por cuenta en admin.html.
// ============================================================

const INTERNAL_SB_URL = 'https://xyqmtqsczscdejcwusce.supabase.co';
const SYNC_DAYS = 30;

// Deben coincidir con las constantes de la app interna y de los HTML.
const SECTORES = ['Coyuntura general','Consumo masivo','Medios de pago','Tecnologia','Automotriz','Agroindustria','Petroquimicos','Mineria','Turismo','Salud','Ambiente'];
const PROVINCIAS = ['CABA','Buenos Aires','Catamarca','Chaco','Chubut','Cordoba','Corrientes','Entre Rios','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquen','Rio Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucuman'];
const PAISES_REGIONALES = ['Chile','Uruguay','Paraguay'];
const JUR_ORDER = ['Nacional', ...PROVINCIAS, 'Municipal', ...PAISES_REGIONALES];
const SECTOR_OTRO = 'Otros', JUR_OTRA = 'Otras';
const TIPOS = ['proyecto_ley','norma','resumen_sesion'];

// Campos que se publican de cada proyecto (whitelist: todo lo demás se descarta).
const PROJ_FIELDS = ['id','tipo','num','sector','jur','tema','org','autor','title','resumen','linkExpediente','linkTexto','fecha'];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const canonSector = s => SECTORES.find(x => norm(x) === norm(s)) || SECTOR_OTRO;
const canonJur = j => JUR_ORDER.find(x => norm(x) === norm(j)) || JUR_OTRA;
const canonTipo = t => TIPOS.includes(t) ? t : 'proyecto_ley';

function sanitizeProject(p) {
  const out = {};
  for (const f of PROJ_FIELDS) if (p[f] != null) out[f] = p[f];
  out.tipo = canonTipo(out.tipo);
  out.sector = canonSector(out.sector);
  out.jur = canonJur(out.jur);
  return out;
}

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

async function dlsRpc(fn, args) {
  const r = await fetch(`${process.env.DLS_SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: process.env.DLS_SB_ANON,
      Authorization: `Bearer ${process.env.DLS_SB_ANON}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`DLS ${r.status}: ${t.slice(0, 150)}`);
  return t ? JSON.parse(t) : null;
}

// ============================================================
// Resumen diario por mail (2026-09-09) — una vez por día, con lo que haya
// para HOY (fecha ART) recién sincronizado. Mismo mail para todos los
// destinatarios (sin personalizar por sector/jurisdicción — el que quiera
// filtrar entra al portal). Ver admin_digest_try_claim en setup.sql para
// el mecanismo anti-duplicado (cron corre 2 veces/día + botón manual).
// Variables de entorno adicionales:
//   RESEND_API_KEY     API key de Resend (resend.com)
//   DIGEST_FROM_EMAIL  remitente verificado en Resend, ej. notificaciones@quipuadvisors.com
// ============================================================

const PORTAL_URL = 'https://monitoreolegislativo.quipuadvisors.com/';

// Argentina es UTC-3 fijo (no usa horario de verano) — evita el desfasaje de tomar
// la fecha UTC cruda, que rotaría al día siguiente unas horas antes de medianoche ART.
function isoTodayART() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Aviso sin contenido: solo el conteo y el link al portal — quien quiera el detalle entra ahí.
function renderDigestHTML(itemCount) {
  const n = itemCount;
  return `
<meta charset="utf-8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3EF;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="background:#395279;padding:20px 24px">
    <span style="color:#FFFFFF;font-size:18px;font-weight:700">DAILY LEGISLATIVE <span style="color:#C0714D">SNIPPET</span></span>
  </td></tr>
  <tr><td style="padding:24px">
    <div style="font-size:15px;color:#2C2C2A;line-height:1.6;margin-bottom:20px">
      Hay <b>${n} novedad${n === 1 ? '' : 'es'} regulatoria${n === 1 ? '' : 's'}</b> que podrían interesarte.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#C0714D;border-radius:6px">
        <a href="${PORTAL_URL}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none">Ver en el portal</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 24px;background:#F4F3EF;font-size:11px;color:#888780;line-height:1.5">
    Quipu Advisors — Daily Legislative Snippet es una muestra de cortesía del monitoreo legislativo (últimos 30 días). No constituye asesoramiento legal.<br>
    Este resumen se manda una vez por día cuando hay novedades. Si no querés recibirlo más, respondé este mail.
  </td></tr>
</table>
</td></tr>
</table>`;
}

async function sendDigestEmail(toEmails, html, subject) {
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) throw new Error('Falta RESEND_API_KEY o DIGEST_FROM_EMAIL');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // to: el propio remitente (visible); bcc: los prospectos reales, ocultos entre sí.
    body: JSON.stringify({ from, to: [from], bcc: toEmails, subject, html })
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// Intenta mandar el resumen del día (si hay novedades, hay destinatarios, y no se mandó ya hoy).
// Nunca tira: un fallo acá no debe romper la respuesta del sync (que ya movió los datos bien).
async function tryDailyDigest(adminPass, rows) {
  const todayIso = isoTodayART();
  const todayRow = rows.find(r => r.date === todayIso);
  const items = todayRow ? (todayRow.data || []).filter(p => !PAISES_REGIONALES.includes(p && p.jur)).map(sanitizeProject) : [];
  if (!items.length) return { sent: false, reason: 'sin novedades hoy' };

  let emails;
  try { emails = await dlsRpc('admin_active_emails', { p_admin: adminPass }); }
  catch (e) { return { sent: false, reason: 'no se pudo leer emails: ' + e.message }; }
  if (!emails || !emails.length) return { sent: false, reason: 'sin destinatarios con email cargado' };

  let claim;
  try { claim = await dlsRpc('admin_digest_try_claim', { p_admin: adminPass, p_date: todayIso, p_item_count: items.length, p_recipient_count: emails.length }); }
  catch (e) { return { sent: false, reason: 'no se pudo reservar el envío: ' + e.message }; }
  if (!claim || !claim.ok) return { sent: false, reason: 'ya se mandó hoy' };

  try {
    const subject = `${items.length} novedad${items.length === 1 ? '' : 'es'} regulatoria${items.length === 1 ? '' : 's'} para revisar`;
    await sendDigestEmail(emails, renderDigestHTML(items.length), subject);
    return { sent: true, item_count: items.length, recipient_count: emails.length };
  } catch (e) {
    // Libera la reserva para que el proximo sync del dia (cron o manual) reintente.
    await dlsRpc('admin_digest_release', { p_admin: adminPass, p_date: todayIso }).catch(() => {});
    return { sent: false, reason: 'fallo el envío, se reintenta en el próximo sync: ' + e.message };
  }
}

export default async function handler(req, res) {
  // --- Autenticación: cron de Vercel o contraseña admin manual ---
  const isCron = !!process.env.CRON_SECRET &&
    req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  let adminPass;
  if (isCron) {
    adminPass = process.env.DLS_ADMIN_PASS;
  } else {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
    adminPass = (req.body && req.body.admin) || '';
    let valid = false;
    try { valid = await dlsRpc('admin_check', { p_admin: adminPass }); }
    catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo validar: ' + e.message }); }
    if (!valid) return res.status(401).json({ ok: false, error: 'Contraseña de administración incorrecta' });
  }

  // --- Leer la base interna (solo tabla projects, últimos SYNC_DAYS días) ---
  let rows;
  try {
    const r = await fetch(
      `${INTERNAL_SB_URL}/rest/v1/projects?select=date,data&date=gte.${isoDaysAgo(SYNC_DAYS)}&order=date.desc`,
      { headers: { apikey: process.env.INTERNAL_SB_ANON, Authorization: `Bearer ${process.env.INTERNAL_SB_ANON}` } }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    rows = await r.json();
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'No se pudo leer la base interna: ' + e.message });
  }

  // --- Publicar día por día ---
  const log = [];
  let failed = 0;
  for (const row of rows) {
    // Regional (Chile/Uruguay/Paraguay) no se publica a DLS por ahora — ver nota arriba.
    const clean = (row.data || [])
      .filter(p => !PAISES_REGIONALES.includes(p && p.jur))
      .map(sanitizeProject);
    try {
      await dlsRpc('admin_sync_projects', { p_admin: adminPass, p_date: row.date, p_data: clean });
      log.push({ date: row.date, count: clean.length, ok: true });
    } catch (e) {
      failed++;
      log.push({ date: row.date, count: clean.length, ok: false, error: e.message.slice(0, 150) });
    }
  }

  // --- Resumen diario por mail (best-effort, no afecta el resultado del sync) ---
  let digest = { sent: false, reason: 'no evaluado' };
  try { digest = await tryDailyDigest(adminPass, rows); }
  catch (e) { digest = { sent: false, reason: 'error inesperado: ' + e.message }; }

  const body = { ok: failed === 0, source: isCron ? 'cron' : 'manual', days: log.length, failed, log, digest };
  return res.status(failed ? 207 : 200).json(body);
}
