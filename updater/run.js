// node updater/run.js [pastaDeDados] — atualiza o catálogo manualmente
const path = require('path');
const { updateAll } = require('./scraper');
const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || path.join(root, 'seed'));
updateAll({ dataDir, seedDir: path.join(root, 'seed'), legacyDir: process.env.LEGACY_IMG_DIR })
  .then(r => { console.log('ok', r); process.exit(0); })
  .catch(e => { console.error('erro:', e.message); process.exit(1); });
