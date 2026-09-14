// ============================================================
// Lambda: sincroniza los proyectos del Smart Snippet interno a la base de
// prospectos del Daily Legislative Snippet, y manda el resumen diario por mail.
//
// Copia adaptada de ../api/sync.js (que queda como legacy de la época de
// Vercel — ver CLAUDE.md, sección "Arquitectura AWS"). La lógica de negocio
// es idéntica; lo único que cambia es cómo se recibe la invocación:
//
//   1. EventBridge Scheduler (los 2 crons diarios): invoca esta Lambda
//      DIRECTO (no pasa por API Gateway ni por HTTP) — ya viene autenticado
//      por IAM, no hace falta ningún secreto tipo CRON_SECRET.
//   2. Manual desde admin.html: POST /api/sync vía API Gateway (evento con
//      forma de proxy HTTP v2, distingue por event.requestContext.http) con
//      body {admin: "<contraseña admin>"} — se valida contra la base (RPC
//      admin_check), igual que en la versión de Vercel.
//
// Variables de entorno (lambda/env.json, nunca se commitea):
//   INTERNAL_SB_ANON, DLS_SB_URL, DLS_SB_ANON, DLS_ADMIN_PASS,
//   RESEND_API_KEY, DIGEST_FROM_EMAIL
//
// Regla de oro: solo se lee la tabla `projects` interna (proyectos de ley,
// información pública). NUNCA `selections` ni nada con clientes pagos.
// ============================================================

const INTERNAL_SB_URL = 'https://xyqmtqsczscdejcwusce.supabase.co';
const SYNC_DAYS = 30;

const SECTORES = ['Coyuntura general','Consumo masivo','Medios de pago','Tecnologia','Automotriz','Agroindustria','Petroquimicos','Mineria','Turismo','Salud','Ambiente'];
const PROVINCIAS = ['CABA','Buenos Aires','Catamarca','Chaco','Chubut','Cordoba','Corrientes','Entre Rios','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquen','Rio Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucuman'];
const PAISES_REGIONALES = ['Chile','Uruguay','Paraguay'];
const JUR_ORDER = ['Nacional', ...PROVINCIAS, 'Municipal', ...PAISES_REGIONALES];
const SECTOR_OTRO = 'Otros', JUR_OTRA = 'Otras';
const TIPOS = ['proyecto_ley','norma','resumen_sesion'];

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

const PORTAL_URL = 'https://monitoreolegislativo.quipuadvisors.com/';

function isoTodayART() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderDigestHTML(itemCount, sectors) {
  const n = itemCount;
  const sectoresLine = sectors && sectors.length
    ? `<div style="font-size:13px;color:#5F5E5A;margin-bottom:20px">Sectores: ${escHtml(sectors.join(', '))}</div>`
    : '';
  return `
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap" rel="stylesheet">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3EF;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="background:#395279;padding:16px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="middle"><span style="font-family:'Montserrat',Arial,sans-serif;font-weight:900;color:#FFFFFF;font-size:18px">DAILY LEGISLATIVE <span style="color:#C0714D">SNIPPET</span></span></td>
      <td align="right" valign="middle" width="56"><img src="https://monitoreolegislativo.quipuadvisors.com/quipu-logo.png" alt="Quipu Advisors" width="48" style="display:block"></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px">
    <div style="font-size:15px;color:#2C2C2A;line-height:1.6;margin-bottom:${sectoresLine ? '4' : '20'}px">
      Hay <b>${n} novedad${n === 1 ? '' : 'es'} regulatoria${n === 1 ? '' : 's'}</b> que podrían interesarte.
    </div>
    ${sectoresLine}
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#C0714D;border-radius:6px">
        <a href="${PORTAL_URL}" style="font-weight:700;display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:14px;text-decoration:none">Ver en el portal</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 24px;background:#F4F3EF">
    <div style="font-size:11px;color:#888780;line-height:1.5">
      Este resumen se manda una vez por día cuando hay novedades. Si no querés recibirlo más, respondé este mail.
    </div>
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
    body: JSON.stringify({ from, to: [from], bcc: toEmails, subject, html })
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

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
    const sectores = [...new Set(items.map(p => p.sector).filter(Boolean))];
    const subject = `${items.length} novedad${items.length === 1 ? '' : 'es'} regulatoria${items.length === 1 ? '' : 's'} para revisar`;
    await sendDigestEmail(emails, renderDigestHTML(items.length, sectores), subject);
    return { sent: true, item_count: items.length, recipient_count: emails.length };
  } catch (e) {
    await dlsRpc('admin_digest_release', { p_admin: adminPass, p_date: todayIso }).catch(() => {});
    return { sent: false, reason: 'fallo el envío, se reintenta en el próximo sync: ' + e.message };
  }
}

function httpResponse(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function runSync(adminPass) {
  let rows;
  try {
    const r = await fetch(
      `${INTERNAL_SB_URL}/rest/v1/projects?select=date,data&date=gte.${isoDaysAgo(SYNC_DAYS)}&order=date.desc`,
      { headers: { apikey: process.env.INTERNAL_SB_ANON, Authorization: `Bearer ${process.env.INTERNAL_SB_ANON}` } }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    rows = await r.json();
  } catch (e) {
    return { error: 502, body: { ok: false, error: 'No se pudo leer la base interna: ' + e.message } };
  }

  const log = [];
  let failed = 0;
  for (const row of rows) {
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

  let digest = { sent: false, reason: 'no evaluado' };
  try { digest = await tryDailyDigest(adminPass, rows); }
  catch (e) { digest = { sent: false, reason: 'error inesperado: ' + e.message }; }

  return { body: { failed, log, digest } };
}

export const handler = async (event) => {
  const isHttp = !!(event && event.requestContext && event.requestContext.http);

  let adminPass;
  if (isHttp) {
    const method = event.requestContext.http.method;
    if (method !== 'POST') return httpResponse(405, { ok: false, error: 'Método no permitido' });
    let body = {};
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf-8') : (event.body || '{}');
      body = JSON.parse(raw);
    } catch { /* body inválido -> adminPass queda vacío, admin_check lo rechaza */ }
    adminPass = body.admin || '';
    let valid = false;
    try { valid = await dlsRpc('admin_check', { p_admin: adminPass }); }
    catch (e) { return httpResponse(500, { ok: false, error: 'No se pudo validar: ' + e.message }); }
    if (!valid) return httpResponse(401, { ok: false, error: 'Contraseña de administración incorrecta' });
  } else {
    // Invocación directa de EventBridge Scheduler: ya autenticada por IAM, sin secreto adicional.
    adminPass = process.env.DLS_ADMIN_PASS;
  }

  const result = await runSync(adminPass);
  if (result.error) return isHttp ? httpResponse(result.error, result.body) : result.body;

  const responseBody = { ok: result.body.failed === 0, source: isHttp ? 'manual' : 'cron', days: result.body.log.length, ...result.body };
  return isHttp ? httpResponse(result.body.failed ? 207 : 200, responseBody) : responseBody;
};
