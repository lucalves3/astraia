const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { updateAll } = require('./updater/scraper');
const site = require('./config/site.json');

const root = __dirname;
const seedDir = path.join(root, 'seed');
const dataDir = path.resolve(process.env.DATA_DIR || seedDir);
fs.mkdirSync(dataDir, { recursive: true });
const app = express();
app.disable('x-powered-by');

const catalogPath = () => (fs.existsSync(path.join(dataDir, 'catalog.json')) ? path.join(dataDir, 'catalog.json') : path.join(seedDir, 'catalog.json'));

app.get('/catalog.json', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(catalogPath()); });
app.get('/site.json', (req, res) => res.json({ nome: site.nome, whatsapp: site.whatsapp, sinalPercentual: site.sinalPercentual, textoRestante: site.textoRestante }));
// fotos: primeiro a pasta de dados (atualizada), depois as que vêm no projeto
const imgOpts = { maxAge: '30d', immutable: true, fallthrough: true };
app.use('/img', express.static(path.join(dataDir, 'img'), imgOpts));
if (dataDir !== seedDir) app.use('/img', express.static(path.join(seedDir, 'img'), imgOpts));
app.use(express.static(path.join(root, 'public'), { maxAge: '1h', extensions: ['html'] }));

// ---- atualização automática ----
let state = { running: false, startedAt: null, finishedAt: null, last: null, error: null };
async function runUpdate(reason) {
  if (state.running) return false;
  state = { ...state, running: true, startedAt: new Date().toISOString(), error: null };
  console.log(`[update] iniciada (${reason})`);
  try {
    state.last = await updateAll({ dataDir, seedDir, log: m => console.log('[update]', m) });
  } catch (e) { state.error = e.message; console.error('[update] erro:', e.message); }
  state.running = false; state.finishedAt = new Date().toISOString();
  return true;
}
// todo domingo às 03:00 (horário de Fortaleza)
cron.schedule(process.env.UPDATE_CRON || '0 3 * * 0', () => runUpdate('agendada'), { timezone: 'America/Fortaleza' });

const token = process.env.ADMIN_TOKEN;
app.get('/admin/update', (req, res) => {
  if (!token || req.query.token !== token) return res.status(403).send('não autorizado');
  runUpdate('manual');
  res.send('atualização iniciada; acompanhe em /admin/status?token=...');
});
app.get('/admin/status', (req, res) => {
  if (!token || req.query.token !== token) return res.status(403).send('não autorizado');
  res.json(state);
});

app.listen(process.env.PORT || 3000, () => console.log('Astraia Catálogo no ar na porta', process.env.PORT || 3000, '| dados:', dataDir));
