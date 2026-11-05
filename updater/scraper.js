// Coleta o catálogo do fornecedor (listagens + página de cada produto), calcula o preço de venda
// e grava catalog.json + img/*.webp em dataDir. Peças que falharem mantêm os dados da última atualização.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const CATEGORIES = require('../config/categories');
const PRICING = require('../config/pricing.json');

const BASE = 'https://veraluiza.com.br';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; AstraiaCatalogo/1.0)' };
const IMG_W = 600;

const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// copia a string para soltar a página HTML de onde ela foi recortada (evita estourar a memória)
const flat = s => Buffer.from(String(s == null ? '' : s), 'utf8').toString('utf8');
const keyOf = url => crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, n = 6) {
  for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { if (i === n - 1) throw e; await sleep(2500 * (i + 1)); } }
}
const getText = u => retry(async () => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
const getBuf = (...urls) => retry(async () => {
  for (const u of urls) { const r = await fetch(u, { headers: UA }); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
  throw new Error('imagem indisponível');
});
async function pool(list, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } }));
}

// preço de venda: (custo + fixos + custo×margem) × (1 + cartão + comissão), arredondado para cima até o próximo "…9,90"
function sellPrice(cost, P = PRICING) {
  const raw = (cost + P.fixo + P.embalagem + P.impostos + P.frete + P.brinde + cost * P.margem) * (1 + P.cartao + P.comissao);
  const end = P.terminaEm;
  const n = Math.max(0, Math.ceil((raw - end) / 10 - 1e-9));
  return Math.round((n * 10 + end) * 100) / 100;
}

async function listing(p) {
  const out = [];
  for (let n = 1; n < 80; n++) {
    const html = await getText(`${BASE}/${p}/` + (n > 1 ? `?page=${n}` : ''));
    let added = 0;
    for (const chunk of html.split('js-product-item-private product-item js-product-container').slice(1)) {
      const m = chunk.match(/<a href="(https:\/\/veraluiza\.com\.br\/produtos\/[^"]+)" title="([^"]*)"/);
      if (!m || out.find(o => o.url === m[1])) continue;
      out.push({ url: flat(m[1]), name: flat(dec(m[2])) });
      added++;
    }
    if (!added) break;
  }
  return out;
}
// a paginação do fornecedor oscila; duas passadas e união evitam perder peças
async function union(p) {
  const m = new Map();
  for (let pass = 0; pass < 2; pass++) for (const it of await listing(p)) if (!m.has(it.url)) m.set(it.url, it);
  return [...m.values()];
}

async function parseProduct(url) {
  const html = await getText(url);
  const meta = n => dec((html.match(new RegExp(`<meta property="${n}" content="([^"]*)"`)) || [])[1] || '');
  const name = meta('og:title').trim();
  const desc = meta('og:description').replace(/\s+/g, ' ');
  const img = (html.match(/<meta property="og:image:secure_url" content="([^"]*)"/) || [])[1] || '';
  let sizes = [], hasVariants = false, sku = '', cost = null;
  const vm = html.match(/data-variants="([^"]*)"/);
  if (vm) {
    const vs = JSON.parse(dec(vm[1]));
    hasVariants = vs.some(v => v.option0);
    for (const v of vs) if (v.option0 && v.available && v.stock !== 0) sizes.push(String(v.option0).trim());
    sizes.sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
    sku = (vs[0] && vs[0].sku) || '';
    const ps = vs.map(v => v.price_number).filter(x => typeof x === 'number' && x > 0);
    if (ps.length) cost = Math.min(...ps);
  }
  const fromImg = img && (img.match(/\/products\/([A-Za-z0-9]+)-[0-9a-f]{20,}/) || [])[1];
  return {
    name, img, sizes, hasVariants, cost,
    code: sku || fromImg || '',
    peso: (desc.match(/Peso:\s*([\d.,]+\s*g)/i) || [])[1] || '',
    comprimento: (desc.match(/Comprimento:\s*([\d.,]+\s*cm)/i) || [])[1] || '',
  };
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };

/**
 * @param {{dataDir:string, seedDir?:string, legacyDir?:string, log?:Function, concurrency?:number}} o
 */
async function updateAll(o) {
  const { dataDir, seedDir, legacyDir } = o;
  const log = o.log || console.log;
  const imgDir = path.join(dataDir, 'img');
  fs.mkdirSync(imgDir, { recursive: true });
  const prev = readJson(path.join(dataDir, 'catalog.json')) || (seedDir && readJson(path.join(seedDir, 'catalog.json'))) || { products: [] };
  const prevById = new Map(prev.products.map(p => [p.id, p]));
  const seedPrev = seedDir && seedDir !== dataDir ? readJson(path.join(seedDir, 'catalog.json')) : null;
  const seedById = new Map(((seedPrev && seedPrev.products) || []).map(p => [p.id, p]));

  // 1) listagens
  const entries = []; // {url, cat, sub}
  const seen = new Set();
  for (const c of CATEGORIES) {
    const all = await union(c.slug);
    const subOf = new Map();
    for (const [s, label] of c.subs) {
      for (const it of await union(`${c.slug}/${s}`)) { if (!subOf.has(it.url)) subOf.set(it.url, label); if (!all.find(a => a.url === it.url)) all.push(it); }
    }
    for (const it of all) if (!seen.has(it.url)) { seen.add(it.url); entries.push({ url: it.url, name: it.name, cat: c.slug, sub: subOf.get(it.url) || 'Outros' }); }
    log(`listagem ${c.name}: ${all.length}`);
  }
  // salvaguarda: se o site devolveu muito menos que da última vez, não atualiza
  if (prev.products.length > 200 && entries.length < prev.products.length * 0.6) {
    throw new Error(`listagem suspeita (${entries.length} peças contra ${prev.products.length}); atualização cancelada`);
  }

  // 2) página de cada produto + imagem
  const products = [];
  let falhas = 0, done = 0;
  await pool(entries, o.concurrency || 5, async e => {
    const id = keyOf(e.url);
    try {
      const d = await parseProduct(e.url);
      if (!d.name || !d.img || !d.cost) throw new Error('dados incompletos');
      const file = path.join(imgDir, id + '.webp');
      const old = prevById.get(id);
      let ok = fs.existsSync(file) && old && old.imgSrc === d.img;
      if (!ok && seedDir && seedDir !== dataDir) {
        const sf = path.join(seedDir, 'img', id + '.webp'), sp = seedById.get(id);
        if (fs.existsSync(sf) && sp && sp.imgSrc === d.img) { fs.copyFileSync(sf, file); ok = true; }
      }
      if (!ok && legacyDir) {
        const lf = path.join(legacyDir, 'img_' + e.cat, id + '.jpg'), ls = lf + '.src';
        if (fs.existsSync(lf) && fs.existsSync(ls) && fs.readFileSync(ls, 'utf8') === d.img) {
          await sharp(lf).resize(IMG_W, IMG_W, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile(file); ok = true;
        }
      }
      if (!ok) {
        const buf = await getBuf(d.img.replace(/-\d+-0\.webp/, '-1024-1024.webp'), d.img);
        await sharp(buf).resize(IMG_W, IMG_W, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).webp({ quality: 72 }).toFile(file);
      }
      products.push({ id, code: flat(d.code), name: flat(d.name), cat: e.cat, sub: flat(e.sub), price: sellPrice(d.cost), peso: flat(d.peso), comprimento: flat(d.comprimento), sizes: d.sizes.map(flat), hasVariants: d.hasVariants, imgSrc: flat(d.img) });
    } catch (err) {
      falhas++;
      const old = prevById.get(id);
      if (old) products.push({ ...old, cat: e.cat, sub: e.sub }); // mantém a versão anterior
      log(`falha em ${e.url}: ${err.message}${old ? ' (mantida versão anterior)' : ' (ignorada)'}`);
    }
    if (++done % 250 === 0) log(`produtos ${done}/${entries.length}`);
  });

  // 3) grava (troca atômica) e limpa imagens órfãs
  const order = new Map(entries.map((e, i) => [keyOf(e.url), i]));
  products.sort((a, b) => order.get(a.id) - order.get(b.id));
  const cats = CATEGORIES.map(c => ({ slug: c.slug, name: c.name, subs: [...c.subs.map(s => s[1]), 'Outros'].filter(s => products.some(p => p.cat === c.slug && p.sub === s)) }));
  const catalog = { updatedAt: new Date().toISOString(), categories: cats, products };
  const tmp = path.join(dataDir, 'catalog.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(catalog));
  fs.renameSync(tmp, path.join(dataDir, 'catalog.json'));
  const keep = new Set(products.map(p => p.id + '.webp'));
  for (const f of fs.readdirSync(imgDir)) if (!keep.has(f)) fs.rmSync(path.join(imgDir, f), { force: true });
  log(`catálogo atualizado: ${products.length} peças, ${falhas} falhas`);
  return { total: products.length, falhas };
}

module.exports = { updateAll, sellPrice };

