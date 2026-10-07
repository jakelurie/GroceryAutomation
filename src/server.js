import express from 'express';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { preferences } from './selector.js';
import { plan } from './planner.js';
import { connect, shop, stores } from './shopper.js';

fs.mkdirSync('.local', { recursive: true });
const file = '.local/runs.json';
const runs = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(runs, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
for (const run of runs) if (run.status === 'running') {
  run.status = 'interrupted';
  for (const item of run.items) if (['pending', 'searching', 'collected', 'ranked'].includes(item.status)) { item.status = 'skipped'; item.message = 'Server restarted before this item finished.'; }
}
save();
const app = express();
const csrf = crypto.randomBytes(32).toString('hex');
app.use(express.json({ limit: '30kb' }));
app.use((req, res, next) => {
  const host = req.hostname;
  if (!['127.0.0.1', 'localhost', 'jakes-macbook-air.tail5785a3.ts.net'].includes(host)) return res.status(403).json({ error: 'Unrecognized host.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-CSRF-Token') !== csrf) return res.status(403).json({ error: 'Refresh the page and try again.' });
  next();
});
let active = null, stop = false, connecting = false;
app.get('/api/state', (req, res) => res.json({ csrf, runs, active, connecting }));
app.post('/api/plan', (req, res) => res.json({ items: plan(req.body.text, Number(req.body.people), Number(req.body.days)) }));
app.post('/api/connect', async (req, res) => {
  if (active || connecting) return res.status(409).json({ error: 'Wait for the current operation to finish.' });
  if (!stores[req.body.store]) return res.status(400).json({ error: 'Choose a supported store.' });
  connecting = true;
  try { await connect(req.body.store); res.json({ message: 'Shopping browser opened on your laptop. Sign in and set your delivery address there, then return here.' }); }
  finally { connecting = false; }
});
app.post('/api/runs', (req, res) => {
  if (active || connecting) return res.status(409).json({ error: 'A shopping operation is already in progress.' });
  const { items, store } = req.body;
  const prefs = preferences(req.body.preferences);
  if (!stores[store] || !Array.isArray(items) || !items.length || items.length > 60) throw new Error('Review your grocery list first.');
  const clean = items.map(item => {
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error('Invalid item or quantity.');
    return { name: item.name.trim(), quantity: item.quantity, explicit: item.explicit === true, status: 'pending' };
  });
  const run = { id: crypto.randomUUID(), store, createdAt: new Date().toISOString(), status: 'running', preferences: prefs, items: clean };
  runs.unshift(run); active = run.id; stop = false; save();
  res.status(202).json(run);
  shop(run, save, () => stop).finally(() => { active = null; });
});
app.post('/api/stop', (req, res) => { stop = true; res.json({ message: 'Stop requested. The current Amazon action may finish; remaining items will be skipped.' }); });
app.use(express.static('public'));
app.use((error, req, res, next) => res.status(400).json({ error: error.message.split('\n')[0] }));
app.listen(Number(process.env.PORT || 4320), '127.0.0.1', () => console.log('Pantry Pilot listening at http://127.0.0.1:' + (process.env.PORT || 4320)));
