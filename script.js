'use strict';
/* Autenticação demonstrativa (LocalStorage). Para produção: substituir por backend seguro (hash no servidor, sessões/JWT). */
const $ = (s, r = document) => r.querySelector(s);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }, set(k, v) { localStorage.setItem(k, JSON.stringify(v)) } };
const RATES = { USD: 1, EUR: 0.92, AOA: 912 }; // taxas demonstrativas, não reais
const COLORS = ['#164B27', '#2F8F46', '#A8ED65', '#6FCB4A', '#B7F17B', '#0E3319'];
const TYPES = { compra: 'Compra', venda: 'Venda', dividendo: 'Dividendo', deposito: 'Depósito', levantamento: 'Levantamento' };
const NAV = [['geral', 'Visão Geral'], ['carteira', 'Carteira'], ['empresas', 'Empresas'], ['transacoes', 'Transações'], ['relatorios', 'Relatórios']];
const S = { user: null, data: null, view: 'geral', cur: 'USD', q: '', flt: 'todos', sort: 'val', dir: -1, notes: [] };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: S.cur }).format(v * RATES[S.cur]);
const pct = v => (v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
const cls = v => v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : '';
const fdate = d => d.split('-').reverse().join('/');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const ini = n => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const icons = () => window.lucide && lucide.createIcons();

function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + (type === 'err' ? 'err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3200);
  S.notes.unshift({ msg, d: new Date().toLocaleString('pt-PT') }); if (S.user) renderHdr();
}
const save = () => { S.data.cur = S.cur; LS.set('inv_d_' + S.user.email, S.data) };

/* ---------- Dados de demonstração ---------- */
function seed() {
  const c = [['AAPL', 'Apple', 'Tecnologia', 215.4], ['MSFT', 'Microsoft', 'Tecnologia', 425.1], ['TSLA', 'Tesla', 'Automóvel', 238.9], ['NVDA', 'NVIDIA', 'Semicondutores', 128.3], ['AMZN', 'Amazon', 'Comércio eletrónico', 188.7], ['GOOGL', 'Google', 'Tecnologia', 172.6]]
    .map(([ticker, nome, setor, price]) => ({ id: ticker, ticker, nome, setor, price }));
  const t = (date, type, cid, qty, price, fee = 0) => ({ id: uid(), date, type, cid, qty, price, fee, notes: '' });
  return {
    demo: true, cur: 'USD', companies: c, txs: [
      t('2026-01-05', 'deposito', null, 0, 30000), t('2026-01-10', 'compra', 'AAPL', 20, 180), t('2026-02-02', 'compra', 'MSFT', 8, 390),
      t('2026-02-15', 'compra', 'TSLA', 15, 250, 5), t('2026-03-08', 'compra', 'NVDA', 40, 95), t('2026-04-01', 'compra', 'AMZN', 12, 170),
      t('2026-04-20', 'compra', 'GOOGL', 18, 150), t('2026-05-12', 'venda', 'TSLA', 5, 262, 5), t('2026-06-30', 'dividendo', 'AAPL', 0, 18),
      t('2026-08-14', 'levantamento', null, 0, 1500)]
  };
}

/* ---------- Cálculos ---------- */
function calc() {
  const rows = S.data.companies.map(c => {
    let q = 0, cost = 0, real = 0, div = 0;
    S.data.txs.filter(t => t.cid === c.id).sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      if (t.type === 'compra') { q += t.qty; cost += t.qty * t.price + t.fee }
      else if (t.type === 'venda') { const avg = q ? cost / q : 0; real += (t.price - avg) * t.qty - t.fee; cost -= avg * t.qty; q -= t.qty }
      else if (t.type === 'dividendo') div += t.price;
    });
    const val = q * c.price, pl = val - cost;
    return { ...c, q, cost, avg: q ? cost / q : 0, val, pl, pct: cost ? pl / cost * 100 : 0, real, div };
  });
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const T = { cost: sum('cost'), val: sum('val'), real: sum('real'), div: sum('div') };
  T.unreal = T.val - T.cost; T.pl = T.unreal + T.real + T.div; T.pct = T.cost ? T.unreal / T.cost * 100 : 0;
  return { rows, T };
}
function series(T) { // capital investido após cada operação; último ponto = valor atual
  const st = {}, out = [];
  [...S.data.txs].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    if (t.type !== 'compra' && t.type !== 'venda') return;
    const s = st[t.cid] = st[t.cid] || { q: 0, c: 0 };
    if (t.type === 'compra') { s.q += t.qty; s.c += t.qty * t.price + t.fee } else { const a = s.q ? s.c / s.q : 0; s.c -= a * t.qty; s.q -= t.qty }
    out.push({ d: t.date, v: Object.values(st).reduce((x, y) => x + y.c, 0) });
  });
  if (out.length) out.push({ d: 'Hoje', v: T.val });
  return out;
}

/* ---------- Gráficos ---------- */
function donut(items) {
  const tot = items.reduce((a, i) => a + i.v, 0); if (!tot) return '<div class="empty">Sem posições para mostrar.</div>';
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = items.map((i, k) => { const l = i.v / tot * C; const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${COLORS[k % 6]}" stroke-width="20" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += l; return s }).join('');
  return `<div class="donut"><svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Distribuição">${arcs}</svg><div class="legend">${items.map((i, k) => `<p><i style="background:${COLORS[k % 6]}"></i>${esc(i.l)}<span>${(i.v / tot * 100).toFixed(1).replace('.', ',')}%</span></p>`).join('')}</div></div>`;
}
function lineChart(s) {
  if (s.length < 2) return '<div class="empty">Registe operações para ver a evolução.</div>';
  const W = 560, H = 170, p = 10, mx = Math.max(...s.map(x => x.v)) * 1.1 || 1;
  const pts = s.map((x, i) => [p + i * (W - 2 * p) / (s.length - 1), H - p - x.v / mx * (H - 2 * p)]);
  const l = pts.map(q => q.join(',')).join(' ');
  return `<svg class="line" viewBox="0 0 ${W} ${H}"><polygon points="${p},${H - p} ${l} ${W - p},${H - p}" fill="#A8ED65" opacity=".35"/><polyline points="${l}" fill="none" stroke="#164B27" stroke-width="3" stroke-linejoin="round"/>${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="3.5" fill="#164B27"/>`).join('')}</svg><p class="lbl">${s[0].d === 'Hoje' ? '' : fdate(s[0].d)} → valor atual: ${money(s[s.length - 1].v)}</p>`;
}
const bars = (rows, neg) => rows.length ? rows.map(r => `<div class="bar ${neg ? 'neg' : ''}"><span>${esc(r.ticker)}</span><div><i style="width:${Math.min(100, Math.abs(r.pct))}%"></i></div><b class="${cls(r.pct)}">${pct(r.pct)}</b></div>`).join('') : '<p class="lbl">Sem dados.</p>';

/* ---------- Vistas ---------- */
const txAmt = t => t.type === 'compra' ? -(t.qty * t.price + t.fee) : t.type === 'venda' ? t.qty * t.price - t.fee : t.type === 'levantamento' ? -t.price : t.price;
function txList(list, del) {
  if (!list.length) return '<div class="empty"><p>Ainda não há operações.</p><button class="btn" data-act="addTx">Registar operação</button></div>';
  return list.map(t => { const c = S.data.companies.find(x => x.id === t.cid), a = txAmt(t);
    return `<div class="tx"><div class="ico">${c ? esc(ini(c.nome)) : '$'}</div><div><b>${TYPES[t.type]}${c ? ' · ' + esc(c.nome) : ''}</b><small>${fdate(t.date)}${t.qty ? ` · ${t.qty} ações a ${money(t.price)}` : ''}${t.notes ? ' · ' + esc(t.notes) : ''}</small></div><b class="${cls(a)}">${a > 0 ? '+' : ''}${money(a)}</b>${del ? `<button class="ghost" data-act="delTx" data-id="${t.id}" aria-label="Eliminar operação"><i data-lucide="trash-2"></i></button>` : ''}</div>` }).join('');
}
const sorted = () => [...S.data.txs].sort((a, b) => b.date.localeCompare(a.date));

function vGeral() {
  const { rows, T } = calc(), pos = rows.filter(r => r.q > 0);
  return `<div class="grid">
  <section class="card s7"><div class="pills">${Object.keys(RATES).map(c => `<button data-act="cur" data-id="${c}" class="${c === S.cur ? 'on' : ''}">${c}</button>`).join('')}</div>
    <p class="lbl" style="margin-top:22px">Património (valor atual da carteira)</p><div class="big">${money(T.val)}</div>
    <p class="lbl" style="margin:-8px 0 16px">Total investido: <b>${money(T.cost)}</b></p>
    <div class="acts"><button class="btn" data-act="addTx">Adicionar investimento</button><button class="btn out" data-act="addCo">Nova empresa</button></div></section>
  <section class="card green s5"><h3>Desempenho</h3><p class="lbl" style="color:#3b5b2b">Lucro acumulado</p><div class="big ${T.pl < 0 ? 'down' : ''}" style="color:${T.pl < 0 ? '' : 'var(--tx)'}">${money(T.pl)}</div>
    <span class="tag ${cls(T.pct)}">${pct(T.pct)} ${T.pct >= 0 ? '▲' : '▼'}</span>
    <div class="mini"><div>Lucro realizado<b>${money(T.real)}</b></div><div>Dividendos<b>${money(T.div)}</b></div></div></section>
  <section class="card s4"><h3>Distribuição</h3>${donut(pos.map(r => ({ l: r.nome, v: r.cost })))}</section>
  <section class="card s4"><h3>Evolução do capital investido</h3>${lineChart(series(T))}</section>
  <section class="card s4"><h3>Transações recentes</h3>${txList(sorted().slice(0, 5))}</section></div>`;
}
function vCarteira() {
  let { rows } = calc(); rows = rows.filter(x => x.q > 0 && (x.nome + x.ticker).toLowerCase().includes(S.q.toLowerCase()));
  if (S.flt === 'lucro') rows = rows.filter(x => x.pl >= 0); if (S.flt === 'prejuizo') rows = rows.filter(x => x.pl < 0);
  rows.sort((a, b) => (typeof a[S.sort] === 'string' ? a[S.sort].localeCompare(b[S.sort]) : a[S.sort] - b[S.sort]) * S.dir);
  const H = [['nome', 'Empresa'], ['ticker', 'Ticker'], ['q', 'Ações'], ['avg', 'Preço médio'], ['price', 'Preço atual'], ['cost', 'Investido'], ['val', 'Valor de mercado'], ['pl', 'Lucro/Prejuízo'], ['pct', 'Rentabilidade']];
  return `<section class="card"><div class="tool"><input id="q" placeholder="Pesquisar empresa ou ticker" value="${esc(S.q)}"><select id="flt"><option value="todos">Todos</option><option value="lucro" ${S.flt === 'lucro' ? 'selected' : ''}>Em lucro</option><option value="prejuizo" ${S.flt === 'prejuizo' ? 'selected' : ''}>Em prejuízo</option></select><button class="btn sp" data-act="addTx">Registar compra/venda</button></div>
  ${rows.length ? `<div class="tbl"><table><thead><tr>${H.map(h => `<th data-act="sort" data-id="${h[0]}">${h[1]}${S.sort === h[0] ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.ticker)}</td><td>${r.q}</td><td>${money(r.avg)}</td><td>${money(r.price)}</td><td>${money(r.cost)}</td><td>${money(r.val)}</td><td class="${cls(r.pl)}">${money(r.pl)}</td><td class="${cls(r.pct)}">${pct(r.pct)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>Nenhuma posição encontrada. Registe uma compra para começar.</p></div>'}</section>`;
}
function vEmpresas() {
  const { rows } = calc(), r = rows.filter(x => (x.nome + x.ticker).toLowerCase().includes(S.q.toLowerCase()));
  return `<div class="tool"><input id="q" placeholder="Pesquisar empresas" value="${esc(S.q)}"><button class="btn sp" data-act="addCo">Adicionar empresa</button></div>
  ${r.length ? `<div class="cos">${r.map(c => `<article class="card co"><header><div class="ico">${esc(ini(c.nome))}</div><div><b>${esc(c.nome)}</b><br><span class="lbl">${esc(c.ticker)} · ${esc(c.setor)}</span></div></header>
  <dl><div><dt>Ações</dt><dd>${c.q}</dd></div><div><dt>Preço atual</dt><dd>${money(c.price)}</dd></div><div><dt>Investido</dt><dd>${money(c.cost)}</dd></div><div><dt>Valor atual</dt><dd>${money(c.val)}</dd></div></dl>
  <p class="${cls(c.pl)}"><b>${money(c.pl)}</b> (${pct(c.pct)})</p><div class="acts" style="margin-top:12px"><button class="btn sm out" data-act="detCo" data-id="${c.id}">Detalhes</button><button class="btn sm out" data-act="editCo" data-id="${c.id}">Editar</button><button class="btn sm red" data-act="delCo" data-id="${c.id}">Eliminar</button></div></article>`).join('')}</div>` : '<div class="card empty"><p>Nenhuma empresa. Adicione a primeira à sua carteira.</p><button class="btn" data-act="addCo">Adicionar empresa</button></div>'}`;
}
const vTrans = () => `<section class="card"><div class="tool"><button class="btn sp" data-act="addTx">Registar operação</button></div>${txList(sorted(), true)}</section>`;
function vRel() {
  const { rows, T } = calc(), pos = rows.filter(r => r.q > 0).sort((a, b) => b.pct - a.pct);
  return `<div class="grid"><section class="card s6"><h3>Evolução dos investimentos</h3>${lineChart(series(T))}</section>
  <section class="card s6"><h3>Distribuição da carteira</h3>${donut(pos.map(r => ({ l: r.nome, v: r.val })))}</section>
  <section class="card s4"><h3>Melhor desempenho</h3>${bars(pos.filter(r => r.pct > 0).slice(0, 3))}</section>
  <section class="card s4"><h3>Pior desempenho</h3>${bars([...pos].reverse().filter(r => r.pct < 0).slice(0, 3), 1)}</section>
  <section class="card s4"><h3>Lucros e prejuízos</h3>${[['Não realizado', T.unreal], ['Realizado', T.real], ['Dividendos', T.div], ['Total', T.pl]].map(([l, v]) => `<div class="tx"><div>${l}</div><div></div><b class="${cls(v)}">${money(v)}</b></div>`).join('')}</section>
  <section class="card s12"><h3>Histórico de operações</h3>${txList(sorted())}</section></div>`;
}

/* ---------- Render ---------- */
function renderHdr() {
  $('#hdr').innerHTML = `<div class="who"><span class="av">${esc(ini(S.user.nome))}</span>Olá, ${esc(S.user.nome.split(' ')[0])}</div>
  <nav>${NAV.map(n => `<button data-act="nav" data-id="${n[0]}" class="${S.view === n[0] ? 'on' : ''}">${n[1]}</button>`).join('')}</nav>
  <div class="tools"><button class="ibtn" data-act="notif" aria-label="Notificações"><i data-lucide="bell"></i>${S.notes.length ? `<span class="badge">${S.notes.length}</span>` : ''}</button><button class="ibtn" data-act="perfil"><i data-lucide="user"></i></button><button class="ibtn" data-act="logout"><i data-lucide="log-out"></i>Sair</button></div>`;
  icons();
}
function render() {
  renderHdr();
  $('#demo').innerHTML = S.data.demo ? '<div class="banner"><i data-lucide="info" class="lg"></i> Dados de exemplo demonstrativos — não são cotações em tempo real. <button class="btn sm out" data-act="clearDemo">Limpar exemplos</button></div>' : '';
  $('#view').innerHTML = { geral: vGeral, carteira: vCarteira, empresas: vEmpresas, transacoes: vTrans, relatorios: vRel }[S.view]();
  icons();
}
const go = v => { S.view = v; S.q = ''; S.flt = 'todos'; render() };

/* ---------- Modais ---------- */
function modal(h) { $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${h}</div>`; $('#modal').hidden = false; icons(); const i = $('#modal input,#modal select'); i && i.focus() }
const close = () => { $('#modal').hidden = true; $('#modal').innerHTML = '' };
function confirmBox(msg, act, id) { modal(`<h2>Confirmar</h2><p style="margin-bottom:18px">${msg}</p><div class="acts"><button class="btn out" data-act="close">Cancelar</button><button class="btn red" data-act="${act}" data-id="${id}">Eliminar</button></div>`) }
function coForm(id) {
  const c = S.data.companies.find(x => x.id === id), n = !c;
  modal(`<h2>${n ? 'Adicionar empresa' : 'Editar empresa'}</h2><form id="f-co" data-id="${id || ''}">
  <label>Nome da empresa<input name="nome" required value="${esc(c?.nome)}"></label>
  <div class="f2"><label>Ticker<input name="ticker" required maxlength="8" value="${esc(c?.ticker)}"></label><label>Setor<input name="setor" required value="${esc(c?.setor)}"></label></div>
  <label>Preço atual (USD, manual)<input name="price" type="number" step="0.01" min="0" required value="${c?.price ?? ''}"></label>
  ${n ? '<div class="f2"><label>Quantidade de ações<input name="qty" type="number" min="0" step="1" value="0"></label><label>Preço de compra (USD)<input name="buy" type="number" min="0" step="0.01" value="0"></label></div>' : ''}
  <div class="acts"><button type="button" class="btn out" data-act="close">Cancelar</button><button class="btn">Guardar</button></div></form>`);
}
function txForm() {
  if (!S.data.companies.length) return toast('Adicione primeiro uma empresa.', 'err');
  modal(`<h2>Registar operação</h2><form id="f-tx">
  <label>Tipo de operação<select name="type" id="ttype">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label id="lco">Empresa<select name="cid">${S.data.companies.map(c => `<option value="${c.id}">${esc(c.nome)} (${esc(c.ticker)})</option>`).join('')}</select></label>
  <div class="f2"><label id="lq">Quantidade de ações<input name="qty" type="number" min="1" step="1" value="1"></label><label><span id="lp">Preço por ação (USD)</span><input name="price" type="number" min="0.01" step="0.01" required></label></div>
  <div class="f2"><label>Data<input name="date" type="date" required value="${today()}"></label><label id="lf">Comissões (opcional)<input name="fee" type="number" min="0" step="0.01" value="0"></label></div>
  <label>Observações<textarea name="notes" rows="2"></textarea></label>
  <div class="acts"><button type="button" class="btn out" data-act="close">Cancelar</button><button class="btn">Guardar</button></div></form>`);
  txToggle();
}
function txToggle() {
  const t = $('#ttype').value, tr = t === 'compra' || t === 'venda', cash = t === 'deposito' || t === 'levantamento';
  $('#lco').hidden = cash; $('#lq').hidden = !tr; $('#lf').hidden = !tr;
  $('#lp').textContent = tr ? 'Preço por ação (USD)' : 'Valor (USD)';
}
function detCo(id) {
  const c = calc().rows.find(x => x.id === id), l = sorted().filter(t => t.cid === id);
  modal(`<h2>${esc(c.nome)} · ${esc(c.ticker)}</h2><p class="lbl">${esc(c.setor)}</p><div class="mini"><div>Ações<b>${c.q}</b></div><div>Preço médio<b>${money(c.avg)}</b></div><div>Valor atual<b>${money(c.val)}</b></div><div>Lucro/Prejuízo<b class="${cls(c.pl)}">${money(c.pl)} (${pct(c.pct)})</b></div></div><h3 style="margin:16px 0 4px">Operações</h3>${l.length ? txList(l) : '<p class="lbl">Sem operações.</p>'}<div class="acts"><button class="btn" data-act="close">Fechar</button></div>`);
}
function holding(cid) { const r = calc().rows.find(x => x.id === cid); return r ? r.q : 0 }

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) { if (e.target.id === 'modal') close(); return }
  const a = b.dataset.act, id = b.dataset.id; if (a === 'recover' || a.startsWith('auth')) e.preventDefault();
  if (a === 'eye') { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password' }
  else if (a === 'auth-reg') { $('#f-login').hidden = true; $('#f-reg').hidden = false }
  else if (a === 'auth-login') { $('#f-reg').hidden = true; $('#f-login').hidden = false }
  else if (a === 'recover') toast('Recuperação de palavra-passe indisponível nesta versão demonstrativa.', 'err');
  else if (a === 'nav') go(id);
  else if (a === 'logout') { sessionStorage.removeItem('inv_s'); localStorage.removeItem('inv_s'); S.user = null; $('#app').hidden = true; $('#auth').hidden = false; toast('Sessão terminada.') }
  else if (a === 'cur') { S.cur = id; save(); render() }
  else if (a === 'addCo') coForm(); else if (a === 'editCo') coForm(id); else if (a === 'detCo') detCo(id);
  else if (a === 'delCo') confirmBox('Eliminar esta empresa e todas as suas operações?', 'doDelCo', id);
  else if (a === 'doDelCo') { S.data.companies = S.data.companies.filter(c => c.id !== id); S.data.txs = S.data.txs.filter(t => t.cid !== id); save(); close(); render(); toast('Empresa eliminada.') }
  else if (a === 'delTx') confirmBox('Eliminar esta operação?', 'doDelTx', id);
  else if (a === 'doDelTx') { S.data.txs = S.data.txs.filter(t => t.id !== id); save(); close(); render(); toast('Operação eliminada.') }
  else if (a === 'addTx') txForm();
  else if (a === 'sort') { S.dir = S.sort === id ? -S.dir : -1; S.sort = id; render() }
  else if (a === 'clearDemo') { S.data = { demo: false, cur: S.cur, companies: [], txs: [] }; save(); render(); toast('Dados de exemplo removidos.') }
  else if (a === 'notif') modal(`<h2>Notificações</h2>${S.notes.length ? S.notes.map(n => `<div class="tx"><div>${esc(n.msg)}<small>${n.d}</small></div></div>`).join('') : '<p class="lbl">Sem notificações.</p>'}<div class="acts"><button class="btn" data-act="close">Fechar</button></div>`);
  else if (a === 'perfil') modal(`<h2>Perfil</h2><p><b>${esc(S.user.nome)}</b></p><p class="lbl">${esc(S.user.email)} · ${esc(S.user.tel)}</p><div class="acts"><button class="btn" data-act="close">Fechar</button></div>`);
  else if (a === 'close') close();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') close() });
document.addEventListener('change', e => { if (e.target.id === 'ttype') txToggle(); if (e.target.id === 'flt') { S.flt = e.target.value; render() } });
document.addEventListener('input', e => {
  if (e.target.id !== 'q') return; const p = e.target.selectionStart; S.q = e.target.value; render(); const i = $('#q'); i.focus(); i.setSelectionRange(p, p);
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'f-co') {
    const id = f.dataset.id, d = { nome: f.nome.value.trim(), ticker: f.ticker.value.trim().toUpperCase(), setor: f.setor.value.trim(), price: +f.price.value };
    if (S.data.companies.some(c => c.ticker === d.ticker && c.id !== id)) return toast('Já existe uma empresa com esse ticker.', 'err');
    if (id) Object.assign(S.data.companies.find(c => c.id === id), d);
    else { const n = { id: uid(), ...d }; S.data.companies.push(n); const q = +f.qty.value, p = +f.buy.value; if (q > 0 && p > 0) S.data.txs.push({ id: uid(), date: today(), type: 'compra', cid: n.id, qty: q, price: p, fee: 0, notes: 'Posição inicial' }) }
    save(); close(); render(); toast(id ? 'Empresa atualizada.' : 'Empresa adicionada.');
  } else if (f.id === 'f-tx') {
    const type = f.type.value, tr = type === 'compra' || type === 'venda', cash = type === 'deposito' || type === 'levantamento';
    const t = { id: uid(), date: f.date.value, type, cid: cash ? null : f.cid.value, qty: tr ? +f.qty.value : 0, price: +f.price.value, fee: tr ? +f.fee.value || 0 : 0, notes: f.notes.value.trim() };
    if (!(t.price > 0)) return toast('Indique um valor superior a zero.', 'err');
    if (type === 'venda' && t.qty > holding(t.cid)) return toast(`Só possui ${holding(t.cid)} ações desta empresa.`, 'err');
    S.data.txs.push(t); save(); close(); render(); toast('Operação registada.');
  } else if (f.id === 'f-login') {
    const u = LS.get('inv_users', {})[f.email.value.trim().toLowerCase()];
    if (!u || u.pass !== btoa(unescape(encodeURIComponent(f.pass.value)))) return toast('E-mail ou palavra-passe incorretos.', 'err');
    (f.lembrar.checked ? localStorage : sessionStorage).setItem('inv_s', u.email); start(u.email);
  } else if (f.id === 'f-reg') {
    const users = LS.get('inv_users', {}), email = f.email.value.trim().toLowerCase();
    if (f.pass.value.length < 6) return toast('A palavra-passe deve ter pelo menos 6 caracteres.', 'err');
    if (f.pass.value !== f.pass2.value) return toast('As palavras-passe não coincidem.', 'err');
    if (users[email]) return toast('Este e-mail já está registado.', 'err');
    users[email] = { nome: f.nome.value.trim(), email, tel: f.tel.value.trim(), pass: btoa(unescape(encodeURIComponent(f.pass.value))) };
    LS.set('inv_users', users); LS.set('inv_d_' + email, seed()); sessionStorage.setItem('inv_s', email); start(email); toast('Conta criada com sucesso!');
  }
});

function start(email) {
  S.user = LS.get('inv_users', {})[email]; S.data = LS.get('inv_d_' + email, { demo: false, companies: [], txs: [] });
  S.cur = S.data.cur || 'USD'; S.view = 'geral'; $('#auth').hidden = true; $('#app').hidden = false; render();
}
const sess = sessionStorage.getItem('inv_s') || localStorage.getItem('inv_s');
if (sess && LS.get('inv_users', {})[sess]) start(sess); else icons();
