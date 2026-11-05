(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = $('app'), catNav = $('catNav');
  const PAGE = 40;
  let site = { whatsapp: '', sinalPercentual: 50, textoRestante: 'restante na entrega' };
  let cat = { categories: [], products: [], updatedAt: '' };
  let byId = new Map();
  let cart = [];            // {id, size, qty, name, code, price}
  let shown = PAGE;
  let sheetState = null;    // peça aberta no modal
  let lastFocus = null;

  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slugOf = c => c.slug;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };
  const imgUrl = p => `/img/${p.id}.webp`;
  const imgTag = (p, cls = '', eager = false) => `<img ${cls ? `class="${cls}" ` : ''}src="${imgUrl(p)}" alt="${esc(p.name)}" width="300" height="300" ${eager ? '' : 'loading="lazy" '}decoding="async" onerror="this.onerror=null;this.src='/assets/icon.png';this.style.objectFit='contain';this.style.padding='28%'">`;

  /* ---------- carrinho ---------- */
  const lineKey = (id, size) => id + '|' + (size || '');
  const cartCount = () => cart.reduce((n, l) => n + l.qty, 0);
  const cartTotal = () => cart.reduce((n, l) => n + l.qty * l.price, 0);
  function saveCart() { store.set('astraia-cart-v1', cart); renderCartUi(); }
  function addToCart(p, size, qty = 1) {
    const l = cart.find(x => lineKey(x.id, x.size) === lineKey(p.id, size));
    if (l) l.qty = Math.min(99, l.qty + qty);
    else cart.push({ id: p.id, size: size || '', qty, name: p.name, code: p.code, price: p.price });
    saveCart();
    toast('Adicionado ao carrinho');
    if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* ignore */ }
  }
  function renderCartUi() {
    const n = cartCount();
    $('cartCount').hidden = n === 0; $('cartCount').textContent = n;
    $('cartBar').hidden = n === 0 || !!document.body.classList.contains('lock');
    $('cbCount').textContent = n === 1 ? '1 item' : `${n} itens`;
    $('cbTotal').textContent = brl(cartTotal());
    if (!$('cartDrawer').hidden) renderDrawer();
  }
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1600);
  }

  /* ---------- WhatsApp ---------- */
  function whatsappUrl() {
    const nome = (store.get('astraia-nome', '') || '').trim();
    const total = cartTotal(), sinal = total * site.sinalPercentual / 100;
    const linhas = cart.map(l => `• ${l.qty}x ${l.name} (cód. ${l.code})${l.size ? ` – numeração ${l.size}` : ''} – ${brl(l.price * l.qty)}`);
    const txt = [
      `Olá! ${nome ? `Sou ${nome}. ` : ''}Quero fazer uma encomenda:`, '',
      ...linhas, '',
      `Total: ${brl(total)}`,
      `Sinal de ${site.sinalPercentual}% para confirmar: ${brl(sinal)} (${site.textoRestante})`,
    ].join('\n');
    return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(txt)}`;
  }

  /* ---------- modais ---------- */
  function openLayer(el) {
    lastFocus = document.activeElement;
    $('overlay').hidden = false; el.hidden = false;
    document.body.classList.add('lock'); renderCartUi();
    const f = el.querySelector('button, input'); if (f) f.focus({ preventScroll: true });
  }
  function closeLayers() {
    $('overlay').hidden = true; $('productSheet').hidden = true; $('cartDrawer').hidden = true;
    document.body.classList.remove('lock'); sheetState = null; renderCartUi();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  $('overlay').addEventListener('click', closeLayers);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLayers(); });

  function openProduct(id) {
    const p = byId.get(id); if (!p) return;
    sheetState = { p, size: '', qty: 1 };
    renderSheet(); openLayer($('productSheet'));
  }
  function renderSheet() {
    const { p, size, qty } = sheetState;
    const semEstoque = p.hasVariants && !p.sizes.length;
    $('productSheet').innerHTML = `
      <div class="sh-head"><h2>Detalhes da peça</h2><button class="x" type="button" data-close aria-label="Fechar">×</button></div>
      <div class="sh-body"><div class="grid2">
        <div class="pimg">${imgTag(p, '', true)}</div>
        <div>
          <p class="pname">${esc(p.name)}</p>
          <div class="pmeta"><span>Cód. ${esc(p.code)}</span>${p.peso ? `<span>Peso: ${esc(p.peso)}</span>` : ''}${p.comprimento ? `<span>Comprimento: ${esc(p.comprimento)}</span>` : ''}</div>
          <div class="pprice">${brl(p.price)}</div>
          ${p.hasVariants ? (semEstoque ? '<p class="warn">Sem numerações disponíveis no momento. Consulte pelo WhatsApp.</p>' : `
            <div class="lbl">Escolha a numeração</div>
            <div class="sizes" role="radiogroup" aria-label="Numeração">${p.sizes.map(s => `<button type="button" class="size${s === size ? ' on' : ''}" role="radio" aria-checked="${s === size}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>
            <p class="warn" id="sizeWarn" hidden>Escolha uma numeração para continuar.</p>`) : ''}
          <div class="lbl">Quantidade</div>
          <div class="qty"><button type="button" data-q="-1" aria-label="Diminuir">−</button><span>${qty}</span><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
        </div>
      </div></div>
      <div class="sh-foot"><button class="btn" type="button" id="sheetAdd" ${semEstoque ? 'disabled' : ''}>Adicionar ao carrinho · ${brl(p.price * qty)}</button></div>`;
  }
  $('productSheet').addEventListener('click', e => {
    if (!sheetState) return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-close')) return closeLayers();
    if (t.dataset.size) { sheetState.size = t.dataset.size; return renderSheet(); }
    if (t.dataset.q) { sheetState.qty = Math.max(1, Math.min(99, sheetState.qty + Number(t.dataset.q))); return renderSheet(); }
    if (t.id === 'sheetAdd') {
      const { p, size, qty } = sheetState;
      if (p.hasVariants && !size) { const w = $('sizeWarn'); if (w) w.hidden = false; return; }
      addToCart(p, size, qty); closeLayers();
    }
  });

  function openCart() { renderDrawer(); openLayer($('cartDrawer')); }
  function renderDrawer() {
    const total = cartTotal(), sinal = total * site.sinalPercentual / 100;
    const body = cart.length ? cart.map((l, i) => `
      <div class="line">
        <img class="th" src="/img/${esc(l.id)}.webp" alt="" onerror="this.onerror=null;this.src='/assets/icon.png'">
        <div><div class="nm">${esc(l.name)}</div><div class="sub">Cód. ${esc(l.code)}${l.size ? ` · numeração ${esc(l.size)}` : ''} · ${brl(l.price)}</div></div>
        <div class="ctl">
          <div class="qty"><button type="button" data-i="${i}" data-d="-1" aria-label="Diminuir">−</button><span>${l.qty}</span><button type="button" data-i="${i}" data-d="1" aria-label="Aumentar">+</button></div>
          <span class="lp">${brl(l.price * l.qty)}</span>
          <button class="rm" type="button" data-rm="${i}">Remover</button>
        </div>
      </div>`).join('') : '<div class="empty">Seu carrinho está vazio.<br>Escolha as peças e volte aqui para finalizar.</div>';
    $('cartDrawer').innerHTML = `
      <div class="sh-head"><h2>Seu carrinho</h2><button class="x" type="button" data-close aria-label="Fechar">×</button></div>
      <div class="sh-body">${body}${cart.length ? '<button class="rm" type="button" data-clear>Esvaziar carrinho</button>' : ''}</div>
      ${cart.length ? `<div class="sh-foot">
        <div class="sum"><div><span>${cartCount()} ${cartCount() === 1 ? 'item' : 'itens'}</span><span class="tot">${brl(total)}</span></div>
          <div class="sinal"><span>Sinal de ${site.sinalPercentual}% para confirmar</span><span>${brl(sinal)}</span></div>
          <div class="muted"><span>${esc(site.textoRestante.charAt(0).toUpperCase() + site.textoRestante.slice(1))}</span></div></div>
        <input class="field" id="nome" type="text" autocomplete="name" placeholder="Seu nome (opcional)" value="${esc(store.get('astraia-nome', ''))}">
        <button class="btn wa" type="button" id="finish">Finalizar pelo WhatsApp</button>
        <p class="note">Você será levada ao WhatsApp com o pedido pronto para enviar.</p></div>` : ''}`;
  }
  $('cartDrawer').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-close')) return closeLayers();
    if (t.dataset.d) { const l = cart[+t.dataset.i]; l.qty = Math.max(1, Math.min(99, l.qty + Number(t.dataset.d))); return saveCart(); }
    if (t.dataset.rm != null && t.dataset.rm !== '') { cart.splice(+t.dataset.rm, 1); return saveCart(); }
    if (t.hasAttribute('data-clear')) { if (confirm('Esvaziar o carrinho?')) { cart = []; saveCart(); } return; }
    if (t.id === 'finish') {
      const nome = $('nome'); if (nome) store.set('astraia-nome', nome.value);
      window.open(whatsappUrl(), '_blank', 'noopener');
    }
  });
  $('cartDrawer').addEventListener('input', e => { if (e.target.id === 'nome') store.set('astraia-nome', e.target.value); });
  $('cartBtn').addEventListener('click', openCart);
  $('cartBar').addEventListener('click', openCart);

  /* ---------- listas ---------- */
  function card(p) {
    const cta = p.hasVariants ? (p.sizes.length ? 'Ver numerações' : 'Indisponível') : 'Adicionar';
    return `<article class="card">
      <button class="ph" type="button" data-open="${p.id}" aria-label="Ver detalhes de ${esc(p.name)}">${imgTag(p)}</button>
      <div class="body">
        <div class="nm">${esc(p.name)}</div>
        <div class="cd">Cód. ${esc(p.code)}</div>
        <div class="pr">${brl(p.price)}</div>
        <button class="btn" type="button" data-add="${p.id}" ${p.hasVariants && !p.sizes.length ? 'disabled' : ''}>${cta}</button>
      </div></article>`;
  }
  function bindGrid(list) {
    const more = $('more');
    if (more) more.onclick = () => { shown += PAGE; paint(list); };
    if (more && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); shown += PAGE; paint(list); } }, { rootMargin: '600px' });
      io.observe(more);
    }
  }
  let paint = () => {};
  function gridHtml(list) {
    if (!list.length) return '<div class="empty">Nenhuma peça encontrada.</div>';
    const part = list.slice(0, shown);
    return `<div class="grid">${part.map(card).join('')}</div>${list.length > shown ? `<button class="btn ghost more" id="more" type="button">Ver mais (${list.length - shown})</button>` : ''}`;
  }
  app.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) return openProduct(o.dataset.open);
    const a = e.target.closest('[data-add]'); if (!a) return;
    const p = byId.get(a.dataset.add); if (!p) return;
    if (p.hasVariants) return openProduct(p.id);
    addToCart(p, '');
  });

  /* ---------- rotas ---------- */
  function chips(items, cls = '') {
    return `<div class="chips ${cls}" ${cls ? 'role="tablist"' : ''}>${items.map(i => `<a class="chip${i.on ? ' on' : ''}" href="${i.href}">${esc(i.label)}</a>`).join('')}</div>`;
  }
  function renderNav(route) {
    catNav.innerHTML = '';
    catNav.className = 'chips';
    catNav.innerHTML = [{ href: '#/', label: 'Início', on: route.t === 'home' }, ...cat.categories.map(c => ({ href: `#/c/${c.slug}`, label: c.name, on: route.c === c.slug }))]
      .map(i => `<a class="chip${i.on ? ' on' : ''}" href="${i.href}">${esc(i.label)}</a>`).join('');
    const on = catNav.querySelector('.chip.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function parse() {
    const h = decodeURIComponent((location.hash || '#/').slice(1));
    const m = h.split('/').filter(Boolean);
    if (m[0] === 'c' && m[1]) return { t: 'cat', c: m[1], s: m[2] || '' };
    if (m[0] === 'busca') return { t: 'q', q: m.slice(1).join('/') };
    return { t: 'home' };
  }
  let sortMode = 'padrao';
  const sorters = { padrao: null, menor: (a, b) => a.price - b.price, maior: (a, b) => b.price - a.price, nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR') };
  function sorted(list) { const f = sorters[sortMode]; return f ? [...list].sort(f) : list; }

  function route() {
    const r = parse(); shown = PAGE; renderNav(r);
    const qi = $('q'); if (r.t !== 'q' && qi.value) qi.value = '';
    window.scrollTo(0, 0);
    if (r.t === 'home') return home();
    if (r.t === 'q') return search(r.q);
    return category(r);
  }
  function home() {
    document.title = 'Astraia Joias · Catálogo de encomendas';
    app.innerHTML = `
      <section class="hero"><img src="/assets/logo-vertical.png" alt="Astraia Joias" width="640" height="560"><h1>Catálogo de encomendas</h1>
      <p>Escolha suas peças, monte o carrinho e finalize pelo WhatsApp.</p></section>
      <ol class="steps"><li>Navegue pelas categorias ou busque pelo nome ou código</li><li>Adicione as peças ao carrinho</li><li>Envie o pedido pelo WhatsApp. Sinal de ${site.sinalPercentual}% para confirmar</li></ol>
      <h2 class="section-h">Categorias</h2>
      <div class="tiles">${cat.categories.map(c => {
        const ps = cat.products.filter(p => p.cat === c.slug); const s = ps[0];
        return `<a class="tile" href="#/c/${c.slug}"><div class="ph">${s ? imgTag(s) : ''}</div><div class="tx"><b>${esc(c.name)}</b><span>${ps.length} peças</span></div></a>`;
      }).join('')}</div>`;
  }
  function category(r) {
    const c = cat.categories.find(x => x.slug === r.c);
    if (!c) { app.innerHTML = '<div class="empty">Categoria não encontrada.</div>'; return; }
    const sub = c.subs.includes(r.s) ? r.s : '';
    const all = cat.products.filter(p => p.cat === c.slug);
    const list = sorted(sub ? all.filter(p => p.sub === sub) : all);
    document.title = `${c.name}${sub ? ' · ' + sub : ''} · Astraia Joias`;
    const subItems = [{ href: `#/c/${c.slug}`, label: `Todos (${all.length})`, on: !sub }, ...c.subs.map(s => ({ href: `#/c/${c.slug}/${encodeURIComponent(s)}`, label: `${s} (${all.filter(p => p.sub === s).length})`, on: s === sub }))];
    app.innerHTML = `<h1 class="page-title">${esc(c.name)}${sub ? ` · ${esc(sub)}` : ''}</h1>
      ${c.subs.length > 1 ? chips(subItems, 'sub') : ''}
      <div class="toolbar"><span class="muted">${list.length} peças</span>
        <select class="sort" id="sort" aria-label="Ordenar">${[['padrao', 'Ordem padrão'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['nome', 'Nome (A–Z)']].map(([v, l]) => `<option value="${v}"${v === sortMode ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div id="list"></div>`;
    $('sort').onchange = e => { sortMode = e.target.value; shown = PAGE; route2(); };
    const route2 = () => { const rr = parse(); const l2 = sorted(sub ? all.filter(p => p.sub === sub) : all); paintList(l2); };
    paintList(list);
  }
  function paintList(list) { paint = l => { $('list').innerHTML = gridHtml(l); bindGrid(l); }; paint(list); }
  function search(q) {
    const nq = norm(q).trim();
    document.title = `Busca: ${q} · Astraia Joias`;
    $('q').value = q;
    const words = nq.split(/\s+/).filter(Boolean);
    const list = words.length ? cat.products.filter(p => { const hay = norm(p.name + ' ' + p.code); return words.every(w => hay.includes(w)); }) : [];
    app.innerHTML = `<h1 class="page-title">Busca</h1><p class="muted">${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} para “${esc(q)}”</p><div id="list"></div>`;
    paintList(list);
  }
  let qT;
  $('searchForm').addEventListener('submit', e => { e.preventDefault(); const v = $('q').value.trim(); location.hash = v ? '#/busca/' + encodeURIComponent(v) : '#/'; $('q').blur(); });
  $('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { const v = $('q').value.trim(); if (v.length >= 2) { history.replaceState(null, '', '#/busca/' + encodeURIComponent(v)); search(v); } }, 350); });
  window.addEventListener('hashchange', route);

  /* ---------- início ---------- */
  async function init() {
    cart = store.get('astraia-cart-v1', []);
    if (!Array.isArray(cart)) cart = [];
    try {
      const [s, c] = await Promise.all([fetch('/site.json').then(r => r.json()), fetch('/catalog.json').then(r => r.json())]);
      site = s; cat = c; byId = new Map(c.products.map(p => [p.id, p]));
    } catch {
      app.innerHTML = '<div class="empty">Não foi possível carregar o catálogo agora.<br>Verifique sua conexão e tente novamente.<br><br><button class="btn" onclick="location.reload()">Tentar de novo</button></div>';
      return;
    }
    // mantém preço e nome do carrinho em dia com o catálogo
    cart = cart.filter(l => l && l.id && l.qty > 0).map(l => { const p = byId.get(l.id); return p ? { ...l, name: p.name, code: p.code, price: p.price } : l; });
    store.set('astraia-cart-v1', cart);
    if (cat.updatedAt) $('updated').textContent = 'Preços e disponibilidade atualizados em ' + new Date(cat.updatedAt).toLocaleDateString('pt-BR');
    renderCartUi(); route();
  }
  init();
})();


