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
// ============================================================

const INTERNAL_SB_URL = 'https://xyqmtqsczscdejcwusce.supabase.co';
const SYNC_DAYS = 30;

// Deben coincidir con las constantes de la app interna y de los HTML.
const SECTORES = ['Coyuntura general','Consumo masivo','Medios de pago','Tecnologia','Automotriz','Agroindustria','Petroquimicos','Mineria','Turismo','Salud','Ambiente'];
const PROVINCIAS = ['CABA','Buenos Aires','Catamarca','Chaco','Chubut','Cordoba','Corrientes','Entre Rios','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquen','Rio Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucuman'];
const JUR_ORDER = ['Nacional', ...PROVINCIAS, 'Municipal'];
const SECTOR_OTRO = 'Otros', JUR_OTRA = 'Otras';

// Campos que se publican de cada proyecto (whitelist: todo lo demás se descarta).
const PROJ_FIELDS = ['id','num','sector','jur','tema','org','autor','title','resumen','linkExpediente','linkTexto','fecha'];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const canonSector = s => SECTORES.find(x => norm(x) === norm(s)) || SECTOR_OTRO;
const canonJur = j => JUR_ORDER.find(x => norm(x) === norm(j)) || JUR_OTRA;

function sanitizeProject(p) {
  const out = {};
  for (const f of PROJ_FIELDS) if (p[f] != null) out[f] = p[f];
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
    const clean = (row.data || []).map(sanitizeProject);
    try {
      await dlsRpc('admin_sync_projects', { p_admin: adminPass, p_date: row.date, p_data: clean });
      log.push({ date: row.date, count: clean.length, ok: true });
    } catch (e) {
      failed++;
      log.push({ date: row.date, count: clean.length, ok: false, error: e.message.slice(0, 150) });
    }
  }

  const body = { ok: failed === 0, source: isCron ? 'cron' : 'manual', days: log.length, failed, log };
  return res.status(failed ? 207 : 200).json(body);
}
