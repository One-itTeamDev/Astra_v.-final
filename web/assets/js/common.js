/* Utilitários partilhados pelo tablet e pela consola */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => (v == null ? '—' : LANG === 'en' ? (+v).toFixed(1) : (+v).toFixed(1).replace('.', ','));
const f0 = v => (v == null ? '—' : Math.round(v));
const rand = (a, b) => a + Math.random() * (b - a);
const LEVEL = new Proxy({}, { get: (_, k) => ({ ok: L('Verde', 'Green'), warn: L('Atenção', 'Attention'), crit: L('Crítico', 'Critical') })[k] });

function api(app) {
  const KEY = 'astra-token-' + app;
  let token = null;
  try { token = sessionStorage.getItem(KEY); } catch (e) {}
  const req = async (method, path, body) => {
    const r = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && token) { api.onLogout && api.onLogout(); }
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); }
    return r.json();
  };
  return {
    get token() { return token; },
    setToken(t) { token = t; try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch (e) {} },
    get: p => req('GET', p), post: (p, b) => req('POST', p, b || {}), patch: (p, b) => req('PATCH', p, b),
  };
}

function toast(text, cls = '', where = document.body) {
  let box = $('.toasts', where);
  if (!box) { box = document.createElement('div'); box.className = 'toasts ui'; where.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + cls; t.innerHTML = text;
  box.appendChild(t); setTimeout(() => t.remove(), 5000);
}

function ago(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  const n = d < 3600 ? Math.round(d / 60) + ' min' : d < 86400 ? Math.round(d / 3600) + ' h' : Math.round(d / 86400) + ' d';
  if (d < 45) return L('agora', 'just now');
  return L('há ' + n, n + ' ago');
}
function fmtDelay(s) {
  if (s < 1) return '< 1 s';
  if (s < 60) return f1(s) + ' s';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m} min ${String(r).padStart(2, '0')} s`;
}
function fmtMet(met, offsetS = 0) {
  const t = met.seconds - offsetS;
  const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60);
  return `${L('Dia', 'Day')} ${d}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const fmtDate = iso => new Date(iso).toLocaleString(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

/* Gráfico de 14 dias: faixa habitual a verde, linha de base a tracejado, pontos fora da faixa a amarelo */
function chartSVG(points, base, margin, { w = 560, h = 180, dec = 0 } = {}) {
  const vals = points.map(p => p.v);
  if (vals.length < 2 || base == null) return `<div class="empty">${L('Sem dados suficientes', 'Not enough data')}</div>`;
  const P = { l: 44, r: 12, t: 12, b: 24 };
  const lo = Math.min(...vals, base - margin) - margin * .7, hi = Math.max(...vals, base + margin) + margin * .7;
  const X = i => P.l + i * (w - P.l - P.r) / (vals.length - 1), Y = v => P.t + (hi - v) / (hi - lo) * (h - P.t - P.b);
  const fmt = v => dec ? f1(v) : Math.round(v);
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
  s += `<rect x="${P.l}" y="${Y(base + margin)}" width="${w - P.l - P.r}" height="${Y(base - margin) - Y(base + margin)}" style="fill:var(--ok-soft)"/>`;
  [lo + (hi - lo) * .12, base, hi - (hi - lo) * .12].forEach(v => { s += `<text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${fmt(v)}</text>`; });
  s += `<line x1="${P.l}" x2="${w - P.r}" y1="${Y(base)}" y2="${Y(base)}" style="stroke:var(--ok)" stroke-dasharray="5 4" opacity=".85"/>`;
  s += `<polyline fill="none" style="stroke:var(--blue)" stroke-width="2" points="${vals.map((v, i) => X(i) + ',' + Y(v)).join(' ')}"/>`;
  vals.forEach((v, i) => { const o = Math.abs(v - base) > margin; s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${o ? 4.5 : 3.2}" style="fill:${o ? 'var(--warn)' : 'var(--blue)'};stroke:var(--sheet)" stroke-width="1.5"><title>${fmt(v)}, ${new Date(points[i].t).toLocaleDateString(LOCALE())}</title></circle>`; });
  const n = vals.length - 1;
  [0, Math.round(n / 3), Math.round(2 * n / 3), n].forEach(i => { s += `<text x="${X(i)}" y="${h - 6}" text-anchor="${i === n ? 'end' : i === 0 ? 'start' : 'middle'}" font-size="11" style="fill:var(--muted)">${i === n ? L('Último', 'Latest') : new Date(points[i].t).toLocaleDateString(LOCALE(), { day: '2-digit', month: '2-digit' })}</text>`; });
  return s + '</svg>';
}
function trendText(points, base, margin, words) {
  let n = 0;
  for (let i = points.length - 1; i >= 0 && Math.abs(points[i].v - base) > margin; i--) n++;
  if (!n) return `<span class="lvl ok">${LEVEL.ok}</span>, ${L('dentro da faixa habitual', 'within your usual range')}`;
  const up = points[points.length - 1].v > base;
  return `<span class="lvl warn">${LEVEL.warn}</span>, ${words[up ? 0 : 1]} ${L(`há ${n} registo${n > 1 ? 's' : ''}`, `for ${n} reading${n > 1 ? 's' : ''}`)}${n >= 3 ? L(', a Terra é informada automaticamente', ', Earth is notified automatically') : ''}`;
}
/* nomes dos indicadores para mostrar */
const IND_PT = { heart_rate: 'Coração', hrv_ms: 'Variabilidade cardíaca', resp_rate: 'Respiração', reaction_ms: 'Tempo de reacção', reaction_sd: 'Variação da reacção',
  tremor_hz: 'Tremor', tremor_amp: 'Amplitude do tremor', bp_sys: 'Tensão sistólica', bp_dia: 'Tensão diastólica', glucose: 'Glicemia', temperature: 'Temperatura',
  spo2: 'SpO₂', sleep_h: 'Sono', mood: 'Humor', stress: 'Stress', grip_kg: 'Força da mão', exercise_min: 'Exercício' };
const IND_EN = { heart_rate: 'Heart rate', hrv_ms: 'Heart rate variability', resp_rate: 'Breathing', reaction_ms: 'Reaction time', reaction_sd: 'Reaction variability',
  tremor_hz: 'Tremor', tremor_amp: 'Tremor amplitude', bp_sys: 'Systolic pressure', bp_dia: 'Diastolic pressure', glucose: 'Blood glucose', temperature: 'Temperature',
  spo2: 'SpO₂', sleep_h: 'Sleep', mood: 'Mood', stress: 'Stress', grip_kg: 'Grip strength', exercise_min: 'Exercise' };
const IND_NAME = new Proxy({}, { get: (_, k) => (LANG === 'en' ? IND_EN : IND_PT)[k] });
const IND_DEC = { tremor_hz: 1, temperature: 1, sleep_h: 1, grip_kg: 1 };
function fmtInd(k, v) {
  if (k === 'mood') return tr(v.text) || '—';
  if (k === 'stress') return tr(['Baixo', 'Moderado', 'Alto', 'Muito alto'][v.value - 1]) || '—';
  const unit = k === 'stress' ? '' : v.unit;
  return `${IND_DEC[k] ? f1(v.value) : f0(v.value)} ${unit}`;
}
const IND = {
  heart_rate: { get n() { return L('Coração', 'Heart rate'); }, u: 'bpm', margin: 6, get words() { return L('mais alto|mais baixo', 'higher|lower').split('|'); } },
  reaction_ms: { get n() { return L('Reacção', 'Reaction'); }, u: 'ms', margin: 12, get words() { return L('mais lento|mais rápido', 'slower|faster').split('|'); } },
  sleep_h: { get n() { return L('Sono', 'Sleep'); }, u: 'h', margin: 1, dec: 1, get words() { return L('mais sono|menos sono', 'more sleep|less sleep').split('|'); } },
};

/* Ícones de traço (24×24), desenhados para o ASTRA */
const IC = {
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  lungs: '<path d="M12 4v8M12 12c-1.5 0-3-1-4.5-3S4 8 4 12v4c0 2 1 3 3 3s3-1.5 3-3v-4M12 12c1.5 0 3-1 4.5-3S20 8 20 12v4c0 2-1 3-3 3s-3-1.5-3-3v-4"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  mood: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  dumbbell: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v5m0-4a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 6.5-6 6.5-2.5 0-4-1-5.5-3L4 14.5a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  radiation: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2V3a9 9 0 0 1 7.8 4.5l-6.2 3.6M10.4 11.1 4.2 7.5A9 9 0 0 1 12 3M13.6 13.4l3.6 6.2a9 9 0 0 1-10.4 0l3.6-6.2"/>',
  antenna: '<path d="M12 12v9M8 21h8M8.5 8.5a5 5 0 0 1 7 0M5.6 5.6a9 9 0 0 1 12.8 0"/><circle cx="12" cy="11" r="1.2"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  clip: '<path d="M9 3h6v3H9z"/><path d="M6 5h12v16H6z"/><path d="m9 13 2 2 4-4"/>',
  queue: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  log: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5z"/>',
  alert: '<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17h.01"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
};
const icon = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;
/* coração que bate ao ritmo indicado (bpm) */
const heartBeat = bpm => { const bt = 60 / Math.max(30, bpm || 60), d = -((performance.now() / 1000) % bt);  // fase contínua entre redesenhos
  return `<span class="beat" style="--bt:${bt.toFixed(2)}s;--bd:${d.toFixed(2)}s">${icon('heart')}</span>`; };
