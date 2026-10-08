/* Lead form proxy: the browser posts here, and the intake endpoint and token
   stay server-side in Netlify environment variables (INTAKE_ENDPOINT, INTAKE_TOKEN). */

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'message'];
const MAX_LEN = { message: 4000 };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const { INTAKE_ENDPOINT, INTAKE_TOKEN } = process.env;
  if (!INTAKE_ENDPOINT || !INTAKE_TOKEN) {
    console.error('INTAKE_ENDPOINT or INTAKE_TOKEN is not set');
    return json(500, { error: 'Form is not configured' });
  }

  /* Only accept posts from this site's own pages */
  const origin = req.headers.get('origin');
  const siteOrigin = new URL(req.url).origin;
  if (origin && origin !== siteOrigin) return json(403, { error: 'Forbidden' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object') return json(400, { error: 'Invalid body' });

  /* Honeypot: pretend success so bots move on */
  if (body.website_url) return json(200, { ok: true });

  const lead = {};
  for (const k of FIELDS) {
    const v = typeof body[k] === 'string' ? body[k].trim() : '';
    lead[k] = v.slice(0, MAX_LEN[k] || 200);
  }
  if (!lead.first_name || !lead.last_name || !emailRe.test(lead.email)) {
    return json(400, { error: 'Missing or invalid fields' });
  }

  try {
    const res = await fetch(INTAKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: INTAKE_TOKEN, ...lead, source: 'website' })
    });
    if (!res.ok) {
      console.error('Intake responded', res.status, await res.text().catch(() => ''));
      return json(502, { error: 'Submission failed' });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('Intake request failed', err);
    return json(502, { error: 'Submission failed' });
  }
};

export const config = { path: '/api/lead' };
