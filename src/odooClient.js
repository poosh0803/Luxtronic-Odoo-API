import 'dotenv/config';

const url = (process.env.ODOO_URL || '').replace(/\/$/, '');
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const apiKey = process.env.ODOO_API_KEY;

let requestId = 0;
let cachedUid = null;

async function call(service, method, args) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: ++requestId,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || 'Odoo RPC error');
  }
  return data.result;
}

export async function getVersion() {
  return call('common', 'version', []);
}

export async function authenticate() {
  if (cachedUid) return cachedUid;
  const missing = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing values in .env: ${missing.join(', ')}`);
  cachedUid = await call('common', 'authenticate', [db, username, apiKey, {}]);
  if (!cachedUid) throw new Error("Authentication failed. Check ODOO_DB / ODOO_USERNAME / ODOO_API_KEY.");
  return cachedUid;
}

export async function executeKw(model, method, args = [], kwargs = {}) {
  const uid = await authenticate();
  return call('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs]);
}
