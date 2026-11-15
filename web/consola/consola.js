/* ASTRA, consola de missão (cirurgiã de voo) */
const A = api('consola');
let O = null, SW = null, HAZ = null, CAMS = [], CREW = [], prio = 'normal', fetchedAt = 0, lastCounts = null;
A.onLogout = () => { A.setToken(null); showLogin(); };

const TPL = () => [
  { n: L('Fazer check-up agora', 'Do check-up now'), t: L('Por favor faça o check-up completo agora (coração, tremor, reacção, sono e humor). Precisamos de dados frescos.', 'Please do the full check-up now (heart, tremor, reaction, sleep and mood). We need fresh data.') },
  { n: L('Exercício resistivo', 'Resistive exercise'), t: L('Hoje: 45 min de exercício resistivo no ARED (agachamento e levantamento). Protege ossos e músculos.', 'Today: 45 min of resistive exercise on ARED (squats and deadlifts). It protects bones and muscles.') },
  { n: L('Hidratação', 'Hydration'), t: L('Beba 250 ml de água a cada hora nas próximas 4 horas e registe se a dor de cabeça se mantiver.', 'Drink 250 ml of water every hour for the next 4 hours and log it if the headache persists.') },
  { n: L('Higiene do sono', 'Sleep hygiene'), t: L('Esta noite: luz da cabine em modo âmbar às 21:00 e sem ecrãs 1 h antes de dormir. Objectivo: 7,5 h de sono.', 'Tonight: cabin light in amber mode at 21:00 and no screens 1 h before bed. Goal: 7.5 h of sleep.') },
  { n: L('Abrigo de tempestade', 'Storm shelter'), t: L('EVENTO SOLAR: dirijam-se já ao abrigo de tempestade e permaneçam até nova indicação. Adiem qualquer saída ao exterior.', 'SOLAR EVENT: go to the storm shelter now and stay until further notice. Postpone any EVA.'), action: 'shelter', urg: true },
  { n: L('Repetir medição', 'Repeat measurement'), t: L('Repita a medição do coração dentro de 20 minutos, sentado e em repouso, e envie o resultado.', 'Repeat the heart measurement within 20 minutes, seated and at rest, and send the result.') },
];

/* ---------- login ---------- */
function showLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#lUser').focus(); }

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#lErr').textContent = '';
  try { const r = await A.post('/api/auth/login', { username: $('#lUser').value.trim(), password: $('#lPass').value }); A.setToken(r.token); $('#lPass').value = ''; start(); }
  catch (err) { $('#lErr').textContent = tr(err.message); $('#lPass').select(); }
});
$('#logout').onclick = async () => { try { await A.post('/api/auth/logout'); } catch (e) {} A.setToken(null); showLogin(); };

/* ---------- secções ---------- */
const VIEWS = ['geral', 'com', 'amb', 'cam', 'lig'];
function showView(v) {
  if (!VIEWS.includes(v)) v = 'geral';
  $$('.view').forEach(x => { x.hidden = x.dataset.v !== v; });
  $$('#side [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  try { if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); } catch (e) {}
  window.scrollTo(0, 0);
}
$('#side').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

/* ---------- arranque ---------- */
let timers = [];
async function start() {
  $('#login').hidden = true; $('#app').hidden = false; showView(location.hash.slice(1));
  timers.forEach(clearInterval); timers = [];
  await poll(); loadSW(); loadCams();
  timers.push(setInterval(poll, 1500), setInterval(() => { if (O?.mission.sep_replay || Date.now() % 60000 < 1600) loadSW(); }, 1500), setInterval(loadCams, 60000), setInterval(tickClock, 1000));
}
async function poll() {
  if (!A.token) return;
  try { O = await A.get('/api/console/overview'); fetchedAt = Date.now(); renderAll(); notify(); } catch (e) { if (!A.token) showLogin(); }
}
async function loadSW() { try { SW = await A.get('/api/space-weather'); renderSpace(); } catch (e) {} }
async function loadCams() { try { CAMS = await A.get('/api/media/cameras'); renderCams(true); } catch (e) {} }
function notify() {
  const c = { inbox: O.inbox.length, pend: O.pending.length, al: O.alerts.filter(a => !a.resolved).length };
  if (lastCounts) {
    if (c.inbox > lastCounts.inbox) toast(`<b>${L('Nova mensagem da tripulação', 'New message from the crew')}</b><br>${esc(O.inbox[0].person.code)}: ${esc(O.inbox[0].text.slice(0, 80))}`);
    if (c.pend > lastCounts.pend) toast(`<b>${L('Nova orientação por validar', 'New guidance to validate')}</b>, ${esc(O.pending[0].person.code)}`, 'warn');
    if (c.al > lastCounts.al) toast(`<b>${L('ALERTA CRÍTICO', 'CRITICAL ALERT')}</b>, ${esc(O.alerts[0].person.code)}, ${esc(tr(O.alerts[0].rule))}`, 'crit');
  }
  lastCounts = c;
}
function tickClock() { if (O) $('#met').textContent = fmtMet({ seconds: O.mission.met.seconds + (Date.now() - fetchedAt) / 1000 }); renderCams(false); }

/* ---------- render ---------- */
function renderAll() {
  const m = O.mission;
  $('#tags').innerHTML = `${m.demo_mode ? `<span class="tag warn">${L('Modo demonstração, atraso ÷60', 'Demo mode, delay ÷60')}</span>` : ''} ${m.sep_replay ? `<span class="tag crit">${L('Reprodução SEP', 'SEP replay')}</span>` : ''}`.trim();
  const c = O.cabin, co2 = c.ppco2_mmHg > 3 ? 'warn' : '';
  $('#cabin').innerHTML = `<span class="${co2}">CO₂ <b class="${co2}">${f1(c.ppco2_mmHg)}</b> mmHg</span><span>O₂ <b>${f1(c.o2_pct)}</b>%</span><span>P <b>${f1(c.pressure_kPa)}</b> kPa</span><span>T <b>${f1(c.temp_C)}</b>°C</span><span>${L('HR', 'RH')} <b>${f0(c.rh_pct)}</b>%</span>`;
  renderBanner(); renderLink(); renderCrew(); renderHazards(); renderCabin(); renderDose(); renderSide(); renderInbox(); renderPending(); renderQueue(); renderSent(); renderLog(); renderCams(false);
  $('#cEta').textContent = m.link_open ? L(`Chega à nave em ${fmtDelay(m.delay_s)}`, `Reaches the ship in ${fmtDelay(m.delay_s)}`) : L('Ligação cortada: fica retida na Terra', 'Link cut: held on Earth');
}
function renderBanner() {
  const a = O.alerts.find(x => !x.resolved), el = $('#banner');
  if (!a) { el.classList.remove('show'); return; }
  el.classList.add('show');
  el.innerHTML = `<b>${L('ALERTA CRÍTICO', 'CRITICAL ALERT')}</b><span><b>${esc(a.person.code)}, ${esc(a.person.name)}</b>, ${esc(tr(a.rule))}, ${L('coração', 'heart')} ${a.values.heart_rate} bpm, ${L('disparado a bordo', 'triggered on board')} ${ago(a.at)}</span>
   <span class="fine">${L('Confirmações recebidas', 'Acknowledgements received')}: ${Object.keys(a.acks).length}/4</span><span class="sp"></span>
   ${a.triage_id ? `<button class="btn sm" data-c="tri" data-id="${a.triage_id}">${L('Ver queixa', 'View complaint')}</button>` : ''}
   <button class="btn critb sm" data-c="emerg" data-id="${a.id}" data-p="${a.person.id}">${L('Instrução de emergência', 'Emergency instruction')}</button><button class="btn sm" data-c="resolve" data-id="${a.id}">${L('Encerrar alerta', 'Close alert')}</button>`;
}
function renderLink() {
  const m = O.mission;
  $('#pLink').innerHTML = `<h2>${icon('antenna')}${L('Ligação Terra–nave', 'Earth–ship link')}</h2>
   <div class="seg">${[['leo', L('Órbita baixa', 'Low orbit')], ['moon', L('Lua', 'Moon')], ['mars', L('Marte', 'Mars')]].map(([k, n]) => `<button data-c="dist" data-k="${k}" class="${m.distance === k ? 'on' : ''}">${n}</button>`).join('')}</div>
   <div class="fine" style="margin-top:16px">${L('Atraso em cada sentido', 'Delay each way')}</div><div class="bigdelay">${esc(tr(m.real_delay_text))}</div>
   <div class="fine">${m.distance === 'mars' ? L('Entre 4 e 24 min conforme a posição dos planetas.', 'Between 4 and 24 min depending on planet positions.') : L('Quase em tempo real.', 'Near real time.')} ${m.demo_mode && m.distance === 'mars' ? `<span class="warn">${L('Em demonstração', 'In demo')}: ${fmtDelay(m.delay_s)}.</span>` : ''}</div>
   <label class="switch"><input type="checkbox" data-c="demo" ${m.demo_mode ? 'checked' : ''}><i></i> ${L('Modo demonstração (atraso ÷60)', 'Demo mode (delay ÷60)')}</label>
   <div class="linkrow"><span class="ldot ${m.link_open ? 'on' : ''}" style="background:${m.link_open ? 'var(--ok)' : 'var(--warn)'}"></span><b class="${m.link_open ? 'ok' : 'warn'}">${m.link_open ? L('Ligação aberta', 'Link open') : L('Ligação cortada', 'Link cut')}</b><span class="sp"></span>
    <button class="btn sm ${m.link_open ? '' : 'warnb'}" data-c="link">${m.link_open ? L('Cortar ligação', 'Cut link') : L('Reabrir ligação', 'Reopen link')}</button></div>
   ${m.link_open ? '' : `<p class="fine warn">${L('A nave continua autónoma. Tudo fica na fila e segue quando a ligação voltar.', 'The ship stays autonomous. Everything waits in the queue and goes out when the link returns.')}</p>`}
   <div class="scen"><span class="fine">${L('Cenários de demonstração', 'Demo scenarios')}</span>
    <button class="btn sm" data-c="demo-run" data-k="sep-replay">${icon('sun')}${L('Reproduzir um evento SEP real', 'Replay a real SEP event')}</button>
    <button class="btn sm" data-c="demo-run" data-k="complaint-t4">${icon('clip')}${L('Queixa do GEO: dor de cabeça e visão', 'GEO complaint: headache and vision')}</button>
    <button class="btn sm" data-c="demo-run" data-k="alert-t1">${icon('alert')}${L('Alerta crítico do CDR: falta de ar', 'CDR critical alert: shortness of breath')}</button>
    <button class="btn sm" data-c="demo-run" data-k="co2">${icon('wind')}${L('Falha do removedor de CO₂ (CDRA)', 'CO₂ scrubber failure (CDRA)')}</button></div>`;
}
function spark(vals, color, id) {
  const lo = Math.min(...vals) - 2, hi = Math.max(...vals) + 2, w = 200, h = 44;
  const pts = vals.map((v, i) => `${(i * w / (vals.length - 1)).toFixed(1)},${(h - (v - lo) / (hi - lo) * h).toFixed(1)}`);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="sg${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
   <polygon fill="url(#sg${id})" points="0,${h} ${pts.join(' ')} ${w},${h}"/><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${pts.join(' ')}"/></svg>`;
}
const ACT = () => ({ sleep: L('a dormir', 'asleep'), exercise: L('em exercício', 'exercising'), work: L('a trabalhar', 'working') });
function renderCrew() {
  const fr = O.crew[0]?.telemetry_frozen;
  $('#telTag').textContent = fr ? L('Sem sinal, últimos valores recebidos', 'No signal, last values received') : L(`Telemetria com ${fmtDelay(O.mission.delay_s)} de atraso`, `Telemetry with ${fmtDelay(O.mission.delay_s)} delay`);
  $('#telTag').className = 'tag ' + (fr ? 'warn' : 'live');
  $('#crew').innerHTML = O.crew.map(c => {
    const v = c.vitals, V = k => c.values[k]?.value, E = k => c.eval[k]?.out;
    const mini = (l, x, w) => `<div class="${w ? 'warn' : ''}">${l}<b>${x}</b></div>`;
    return `<div class="cc ${c.status}" style="--cc:${c.color}" data-c="crew" data-id="${c.id}"><div class="hd"><span class="av" style="--c:${c.color}">${c.code}</span><div class="nm"><b>${esc(c.name)}</b><small>${esc(tr(c.role))}</small></div></div>
     <div class="loc"><span>${esc(tr(v.location))}, ${ACT()[v.activity]}${c.on_tablet ? `, <span class="ontab">${L('no tablet', 'on tablet')}</span>` : ''}</span><span class="stat ${c.status}">${LEVEL[c.status]}</span></div>
     <div class="hrlive"><div><div class="row" style="gap:8px">${fr ? icon('heart') : heartBeat(v.hr)}<span class="hrv">${f0(v.hr)}</span></div><div class="fine">${L('bpm ao vivo', 'bpm live')}</div></div>${spark(c.spark, fr ? '#5D6A80' : c.color, c.id)}</div>
     <div class="mini">${mini('SpO₂', f1(v.spo2) + '%', v.spo2 < 95)}${mini(L('Resp.', 'Resp.'), f0(v.resp) + ' rpm')}${mini(L('Tensão', 'BP'), `${f0(V('bp_sys'))}/${f0(V('bp_dia'))}`)}
      ${mini(L('Reacção', 'Reaction'), f0(V('reaction_ms')) + ' ms', E('reaction_ms'))}${mini(L('Sono', 'Sleep'), f1(V('sleep_h')) + ' h', E('sleep_h'))}${mini('Dose', f1(c.dose.cumulative_mSv) + ' mSv', c.dose.flux_pfu > 10)}</div>
     <div class="hzdots">${c.hazards.map(h => `<span class="${h.status}" title="${esc(tr(h.name))}: ${esc(tr(h.note))}">${h.letter}</span>`).join('')}</div>
     <div class="foot"><span>${L('Check-up', 'Check-up')} ${ago(c.last_measured)}</span><span class="${c.reasons.length ? 'warn' : ''}">${c.reasons.length ? esc(c.reasons.slice(0, 2).map(tr).join(', ')) : L('Sem desvios', 'No deviations')}</span></div></div>`;
  }).join('');
}
function renderInbox() {
  const Lst = O.inbox, unread = Lst.filter(x => !x.read).length;
  $('#inboxTag').textContent = unread ? L(`${unread} por ler`, `${unread} unread`) : L('em dia', 'up to date');
  $('#inboxTag').className = 'tag ' + (unread ? 'live' : 'ok');
  $('#inbox').innerHTML = Lst.length ? Lst.map(x => `<div class="li ${x.read ? '' : 'unread'}"><div class="meta"><span class="av" style="--c:${x.person.color}">${x.person.code}</span><b style="color:var(--head)">${esc(x.person.name)}</b>${x.reply_to ? `<span>${L('resposta a', 'reply to')} ${esc(x.reply_to)}</span>` : ''}<span class="sp"></span>${L('escrita', 'written')} ${ago(x.at)}</div>
     <p>${esc(x.text)}</p><div class="row">${x.read ? `<span class="fine">✓ ${L('Lida', 'Read')}</span>` : `<button class="btn sm" data-c="read" data-id="${x.id}">${L('Marcar como lida', 'Mark as read')}</button>`}<button class="btn pri sm" data-c="replyto" data-p="${x.person.id}" data-id="${x.id}">${L('Responder a', 'Reply to')} ${esc(x.person.code)}</button></div></div>`).join('')
    : `<div class="empty">${L('Sem mensagens da tripulação.', 'No messages from the crew.')}</div>`;
}
function renderPending() {
  $('#pendTag').textContent = L(`${O.pending.length} por rever`, `${O.pending.length} to review`);
  $('#pendTag').className = 'tag ' + (O.pending.length ? 'warn' : 'ok');
  $('#pending').innerHTML = O.pending.length ? O.pending.map(t => `<div class="li"><div class="meta"><span class="av" style="--c:${t.person.color}">${t.person.code}</span><span class="lvl ${t.level}">${LEVEL[t.level]}</span><span class="prov">${L('Provisória', 'Provisional')}</span><span class="sp"></span>${ago(t.at)}</div>
    <p>${esc(t.symptoms.map(tr).join(', '))}</p><p class="fine">${esc(t.ai_summary)}</p><button class="btn pri sm" data-c="tri" data-id="${t.id}">${L('Rever orientação', 'Review guidance')}</button></div>`).join('')
    : `<div class="empty">${L('Nenhuma orientação por validar.', 'No guidance to validate.')}</div>`;
  $('#alerts').innerHTML = O.alerts.length ? O.alerts.map(a => `<div class="li ${a.resolved ? '' : 'alert-on'}"><div class="meta"><b class="crit mono">${a.id}</b><span style="color:var(--head)">${esc(a.person.code)}, ${esc(tr(a.rule))}</span><span class="sp"></span>${a.resolved ? `<span class="valid">${L('Encerrado', 'Closed')}</span>` : `<span class="tag crit">${L('Activo', 'Active')}</span>`}</div>
    <div class="fine">${L('Confirmações', 'Acknowledgements')}: ${O.crew.map(c => `${c.code} ${a.acks[c.id] ? '<span class="ok">✓</span>' : '…'}`).join(', ')}</div></div>`).join('') : `<div class="empty">${L('Sem alertas críticos.', 'No critical alerts.')}</div>`;
}
function renderQueue() {
  const now = Date.now();
  $('#qTag').textContent = L(`${O.queue.filter(p => p.status !== 'delivered').length} em curso`, `${O.queue.filter(p => p.status !== 'delivered').length} in progress`);
  $('#queue').innerHTML = O.queue.length ? O.queue.map(p => {
    const s = p.sent_at && new Date(p.sent_at).getTime(), a = p.arrive_at && new Date(p.arrive_at).getTime();
    const pr = p.status === 'delivered' ? 1 : p.status === 'transit' ? Math.max(0, Math.min(1, (now - s) / (a - s))) : 0;
    const st = p.status === 'held' ? `<span class="warn">${p.dir === 'up' ? L('Retido a bordo', 'Held on board') : L('Retido na Terra', 'Held on Earth')}</span>` : p.status === 'transit' ? `<span style="color:var(--sinal)">${L('Em trânsito', 'In transit')}, ${Math.max(0, Math.ceil((a - now) / 1000))} s</span>` : `<span class="ok">${L('Entregue', 'Delivered')}</span>`;
    return `<div class="qi"><span class="mono" style="${p.priority >= 9 ? 'color:var(--crit)' : ''}">#${p.seq}</span><div><div class="dir">${p.dir === 'up' ? L('NAVE → TERRA', 'SHIP → EARTH') : L('TERRA → NAVE', 'EARTH → SHIP')}${p.priority >= 9 ? L(', PRIORIDADE', ', PRIORITY') : ''}</div>${esc(tr(p.label))}<div class="bar"><i style="width:${pr * 100}%;${p.status === 'delivered' ? 'background:var(--ok)' : ''}"></i></div></div>${st}</div>`;
  }).join('') : `<div class="empty">${L('Fila vazia.', 'Queue empty.')}</div>`;
}
function renderSent() {
  $('#sent').innerHTML = O.sent.length ? O.sent.map(m => `<div class="li"><div class="meta"><b class="mono" style="color:var(--head)">${m.id}</b>${m.priority === 'urgente' ? `<span class="tag warn">${L('Urgente', 'Urgent')}</span>` : ''}<span>→ ${m.to === 'all' ? L('tripulação', 'crew') : esc(O.crew.find(c => c.id === m.to)?.code)}</span><span class="sp"></span>
    ${m.delivered ? `<span class="ok">${L('Entregue a bordo', 'Delivered on board')}</span>` : m.arrives ? `<span style="color:var(--sinal)">${L('A caminho', 'On the way')}</span>` : `<span class="warn">${L('Retida', 'Held')}</span>`}</div><p>${esc(m.text)}</p>
    <div class="fine">${L('Confirmações', 'Acknowledgements')}: ${m.acks.map(a => `${a.code} ${a.at ? '<span class="ok">✓</span>' : '…'}`).join(', ')}</div></div>`).join('') : `<div class="empty">${L('Ainda não enviou instruções.', 'No instructions sent yet.')}</div>`;
}
function renderLog() {
  $('#log').innerHTML = O.events.map(e => `<div><span class="muted">${new Date(e.at).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' })}</span><span class="o-${e.origin}">${tr(e.origin)}</span><span>${esc(tr(e.text))}</span></div>`).join('');
}
function renderSpace() {
  if (!SW) return;
  const n = SW.now, st = SW.status || {}, live = st.source === 'live';
  const pts = SW.replay_curve || SW.protons;
  let chart = `<p class="fine" style="margin:12px 0">${L('O gráfico do fluxo de protões aparece quando o servidor tiver internet. Abaixo, os eventos reais guardados do DONKI.', 'The proton flux chart appears when the server is online. Below, the real DONKI events stored locally.')}</p>`;
  if (pts.length > 2) {
    const w = 640, h = 170, Lg = v => Math.log10(Math.max(.05, v)), lo = -1.3, hi = Math.max(2, Math.max(...pts.map(p => Lg(p.flux))) + .2);
    const Y = v => h - (Lg(v) - lo) / (hi - lo) * h;
    const line = pts.map((p, i) => `${(i * w / (pts.length - 1)).toFixed(1)},${Y(p.flux).toFixed(1)}`).join(' ');
    chart = `<div class="chartbox"><svg viewBox="0 0 ${w} ${h + 20}" style="width:100%;display:block"><defs><linearGradient id="pf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6CC4FF" stop-opacity=".3"/><stop offset="1" stop-color="#6CC4FF" stop-opacity="0"/></linearGradient></defs>
     <g stroke="rgba(146,170,214,.08)">${[.25, .5, .75].map(f => `<line x1="0" x2="${w}" y1="${h * f}" y2="${h * f}"/>`).join('')}</g>
     <rect x="0" y="0" width="${w}" height="${Y(10)}" fill="rgba(247,181,56,.05)"/>
     <line x1="0" x2="${w}" y1="${Y(10)}" y2="${Y(10)}" stroke="#F7B538" stroke-dasharray="4 4"/><text x="${w - 4}" y="${Y(10) - 6}" font-size="11" fill="#F7B538" text-anchor="end" font-family="JetBrains Mono, monospace">S1 · 10 pfu</text>
     <polygon fill="url(#pf)" points="0,${h} ${line} ${w},${h}"/><polyline fill="none" stroke="#6CC4FF" stroke-width="2.2" stroke-linejoin="round" points="${line}"/>
     <text x="0" y="${h + 16}" font-size="11" fill="#8693A8" font-family="JetBrains Mono, monospace">${new Date(pts[0].t).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</text><text x="${w}" y="${h + 16}" font-size="11" fill="#8693A8" text-anchor="end" font-family="JetBrains Mono, monospace">${L('agora', 'now')}</text></svg></div>`;
  }
  const fl = SW.flares_30d;
  $('#pSpace').innerHTML = `<h2>${icon('sun', n.flux_pfu > 10 ? 'spin' : '')}${L('Clima espacial', 'Space weather')} <span class="sp"></span><span class="tag ${live ? 'live' : ''}">${live ? L('NASA/NOAA ao vivo', 'NASA/NOAA live') : L('cache local', 'local cache')}</span></h2>
   <div class="row" style="align-items:flex-end"><div><div class="fine">${L('Protões ≥10 MeV', 'Protons ≥10 MeV')}${n.flux_pfu == null ? '' : ' (' + esc(tr(n.flux_source)) + ')'}</div>${n.flux_pfu == null ? `<div class="muted" style="font-size:15px;margin-top:6px">${L('Sem dados do GOES de momento', 'No GOES data right now')}</div>` : `<div class="gauge ${n.flux_pfu > 10 ? 'warn' : ''}">${f1(n.flux_pfu)} <small class="muted" style="font-size:13px;font-family:var(--sans);font-weight:400">pfu, ${n.s_scale}</small></div>`}</div><span class="sp"></span>
    <div style="text-align:right"><div class="fine">${L('Dose a bordo (estimada)', 'On-board dose (estimated)')}</div><div class="num" style="font-size:22px;color:var(--head)">${f1(n.dose_rate_uSv_h)} <small class="muted" style="font-size:13px;font-weight:400">µSv/h</small></div></div></div>
   ${chart}
   <div class="fine" style="margin:8px 0 4px">${L('Erupções nos últimos 30 dias (DONKI)', 'Flares in the last 30 days (DONKI)')}: <b class="mono" style="color:var(--ink)">X ${fl.X}, M ${fl.M}, C ${fl.C}</b>${SW.kp_latest ? `, ${L('Kp máx.', 'Kp max')} ${SW.kp_latest.value}` : ''}</div>
   <h3 style="font-size:13px;margin:16px 0 4px">${L('Eventos SEP recentes (DONKI)', 'Recent SEP events (DONKI)')}</h3>
   ${SW.sep.slice(0, 4).map(s => `<div class="sep"><b class="mono">${fmtDate(s.time)}</b><br><span class="muted">${esc(s.instruments.join(', '))}${s.flares.length ? L(', erupção ', ', flare ') + esc(s.flares.join(', ')) : ''}${s.cme ? ', CME' : ''}</span>${s.link ? `, <a href="${esc(s.link)}" target="_blank" rel="noopener">${L('ver', 'view')}</a>` : ''}</div>`).join('') || `<div class="empty">${L('Sem eventos SEP no último ano.', 'No SEP events in the last year.')}</div>`}
   <div class="fine" style="margin-top:10px">${L('Fundo GCR', 'GCR background')} ${f1(n.gcr_uSv_h)} µSv/h ${L('(MSL/RAD, cruzeiro para Marte). Componente SEP: modelo ilustrativo.', '(MSL/RAD, Mars cruise). SEP component: illustrative model.')} ${st.fetched_at ? L('Actualizado ', 'Updated ') + ago(st.fetched_at) : ''}</div>
   ${n.flux_pfu > 10 ? `<button class="btn warnb sm" style="width:100%;margin-top:12px" data-c="shelter">${L('Enviar: abrigo de tempestade', 'Send: storm shelter')}</button>` : ''}`;
}
let camSig = '';
function renderCams(full) {
  if (!O || !CAMS.length) return;
  const m = O.mission, sig = JSON.stringify([CAMS.map(c => c.image), m.link_open, LANG]);
  const ts = fmtMet({ seconds: m.met.seconds + (Date.now() - fetchedAt) / 1000 - (m.link_open ? m.delay_s : 0) });
  $('#camTag').textContent = m.link_open ? L(`Vídeo com atraso de ${fmtDelay(m.delay_s)}`, `Video with ${fmtDelay(m.delay_s)} delay`) : L('Sem sinal', 'No signal');
  $('#camTag').className = 'tag ' + (m.link_open ? 'live' : 'warn');
  if (full || sig !== camSig) {
    camSig = sig;
    $('#cams').innerHTML = CAMS.map(c => `<div class="cam ${c.id === 'cam4' ? 'ext' : ''}" data-c="cam" data-id="${c.id}">
      ${c.image ? `<img src="${c.image}" alt="${esc(c.title || c.caption)}" loading="lazy">` : `<div class="nosig">${L('Imagem indisponível no momento', 'Image unavailable right now')}</div>`}
      ${m.link_open || !c.image ? '' : `<div class="nosig">${L('Sem sinal', 'No signal')}<small>${L('Ligação Terra–nave cortada', 'Earth–ship link cut')}</small></div>`}
      <span class="lab">${c.code} · ${esc(tr(c.name))}</span>${m.link_open && c.image ? '<span class="rec">REC</span>' : ''}${c.image ? '<span class="ts" data-ts></span>' : ''}</div>`).join('');
  }
  $$('#cams [data-ts]').forEach(e => e.textContent = ts);
}

/* ---------- barra lateral, cabine e dose ---------- */
function renderSide() {
  const m = O.mission, unread = O.inbox.filter(x => !x.read).length, pend = O.pending.length, al = O.alerts.filter(a => !a.resolved).length;
  $('#nbCom').textContent = unread || ''; $('#nbGeral').textContent = (pend + al) || '';
  $('#nbGeral').classList.toggle('crit', al > 0);
  $('#sideLink').innerHTML = `<span class="ldot ${m.link_open ? 'on' : ''}" style="background:${m.link_open ? 'var(--ok)' : 'var(--warn)'}"></span>
    <div><b>${m.link_open ? L('Ligação aberta', 'Link open') : L('Ligação cortada', 'Link cut')}</b><br><span class="fine">${esc(tr(m.label))}, ${esc(tr(m.real_delay_text))}${m.demo_mode && m.distance === 'mars' ? ` (demo ${fmtDelay(m.delay_s)})` : ''}</span></div>`;
}
function renderCabin() {
  if (!HAZ) return;
  const c = O.cabin, Lim = HAZ.cabin_limits;
  const num = (v, d) => (+v).toFixed(d).replace('.', LANG === 'en' ? '.' : ',');
  const rows = [['ppco2_mmHg', 'CO₂', 'mmHg', 2], ['o2_pct', 'O₂', '%', 1], ['pressure_kPa', L('Pressão', 'Pressure'), 'kPa', 1], ['temp_C', L('Temperatura', 'Temperature'), '°C', 1], ['rh_pct', L('Humidade relativa', 'Relative humidity'), '%', 0]];
  $('#cabinPanel').innerHTML = rows.map(([k, n, u, d]) => {
    const v = c[k], l = Lim[k], span = (l.max - (l.min ?? 0)) || 1;
    const out = (l.max != null && v > l.max) || (l.min != null && v < l.min);
    const a = l.min != null ? l.min - span * .25 : 0, b = l.max + span * .25, pos = Math.max(0, Math.min(100, (v - a) / (b - a) * 100));
    const z0 = l.min != null ? (l.min - a) / (b - a) * 100 : 0, z1 = (l.max - a) / (b - a) * 100;
    return `<div class="gauge-row"><div class="gl"><span>${n}</span><b class="${out ? 'warn' : ''}">${num(v, d)} <small>${u}</small></b></div>
      <div class="gbar"><i class="zone" style="left:${z0}%;width:${z1 - z0}%"></i><i class="mark ${out ? 'warn' : ''}" style="left:${pos}%"></i></div>
      <div class="fine">${L('Faixa aceitável', 'Acceptable range')}: ${l.min != null ? num(l.min, 1).replace(/[.,]0$/, '') + L(' a ', ' to ') : L('até ', 'up to ')}${num(l.max, 1).replace(/[.,]0$/, '')} ${u}</div></div>`;
  }).join('') + `<p class="fine" style="margin:14px 0 0">${L('CO₂: limite NASA de 3 mmHg em média de 24 h (NASA-STD-3001). Valores da cabine simulados em gamas típicas da ISS.', 'CO₂: NASA limit of 3 mmHg, 24 h average (NASA-STD-3001). Cabin values simulated within typical ISS ranges.')}</p>`;
}
function renderDose() {
  $('#dosePanel').innerHTML = `<div class="doses">${O.crew.map(c => { const d = c.dose, p = Math.min(100, d.cumulative_mSv / d.career_limit_mSv * 100);
    return `<div class="dose"><div class="row"><span class="av" style="--c:${c.color}">${c.code}</span><b>${esc(c.name)}</b><span class="sp"></span><span class="num" style="font-size:24px;color:var(--head)">${f1(d.cumulative_mSv)}</span><span class="fine">mSv</span></div>
      <div class="dbar"><i style="width:${p}%"></i></div><div class="row fine"><span>${f0(p)}% ${L('do limite de carreira (600 mSv)', 'of career limit (600 mSv)')}</span><span class="sp"></span><span>${f1(d.rate_uSv_h)} µSv/h${d.sheltered ? L(', no abrigo', ', in shelter') : ''}</span></div></div>`; }).join('')}</div>
    <p class="fine" style="margin:14px 0 0">${L('Fundo de raios cósmicos de 1,84 mSv/dia no cruzeiro para Marte (MSL/RAD). A componente de partículas solares é um modelo ilustrativo baseado no fluxo real do GOES.', 'Cosmic-ray background of 1.84 mSv/day on the Mars cruise (MSL/RAD). The solar particle component is an illustrative model based on real GOES flux.')}</p>`;
}

/* ---------- os cinco perigos ---------- */
function missionLevel(id) {
  const m = O.mission, c = O.cabin, n = SW?.now;
  const warnCrew = O.crew.filter(x => x.hazards.find(h => h.id === id).status !== 'ok').length;
  switch (id) {
    case 'radiacao': return n ? `${n.flux_pfu == null ? L('Sem dados do GOES', 'No GOES data') : f1(n.flux_pfu) + ' pfu, ' + n.s_scale}<br>${f1(n.dose_rate_uSv_h)} µSv/h${SW.sep[0] ? `<br><span class="fine">${L('Último SEP real', 'Last real SEP')}: ${new Date(SW.sep[0].time).toLocaleDateString(LOCALE())}</span>` : ''}` : '—';
    case 'isolamento': return L(`${warnCrew} de 4 com sinais de desgaste`, `${warnCrew} of 4 showing strain`);
    case 'distancia': return `${esc(tr(m.label))}, ${esc(tr(m.real_delay_text))}<br><span class="fine">${m.link_open ? L('ligação aberta', 'link open') : L('LIGAÇÃO CORTADA', 'LINK CUT')}, ${L('fila', 'queue')} ${m.queue.up}↑ ${m.queue.down}↓</span>`;
    case 'gravidade': { const ex = O.crew.map(x => x.hazards.find(h => h.id === 'gravidade').exercise_min || 0); return `${L('Exercício médio', 'Average exercise')} ${f0(ex.reduce((a, b) => a + b, 0) / ex.length)} min / 120`; }
    case 'ambiente': return `CO₂ ${f1(c.ppco2_mmHg)} mmHg, O₂ ${f1(c.o2_pct)} %<br><span class="fine">${f1(c.temp_C)} °C, ${f0(c.rh_pct)} % ${L('HR', 'RH')}, ${f1(c.pressure_kPa)} kPa</span>`;
  }
}
function renderHazards() {
  if (!HAZ) return;
  $('#hazards').innerHTML = `<div class="hzrow hzhead"><span>${L('Perigo', 'Hazard')}</span><span>${L('O que o ASTRA acompanha', 'What ASTRA tracks')}</span><span>${L('Missão agora', 'Mission now')}</span>${O.crew.map(c => `<span>${c.code}</span>`).join('')}</div>` +
    HAZ.hazards.map(H => `<div class="hzrow" data-c="haz" data-id="${H.id}"><span><b class="hzl">${H.letter}</b>${esc(fld(H, 'name'))}</span><span class="fine">${esc(fld(H, 'indicators').join(', '))}</span><span class="mono">${missionLevel(H.id)}</span>
      ${O.crew.map(c => { const h = c.hazards.find(x => x.id === H.id); return `<span class="hzc ${h.status}" title="${esc(tr(h.note))}"><i class="lvl ${h.status}">${LEVEL[h.status]}</i><small>${esc(h.status === 'ok' ? '' : tr(h.note))}</small></span>`; }).join('')}</div>`).join('');
}
function openHazard(id) {
  const H = HAZ.hazards.find(x => x.id === id);
  openModal(`<div class="row"><b class="hzl" style="width:40px;height:40px;font-size:20px">${H.letter}</b><h2 style="margin:0">${esc(fld(H, 'name'))}</h2><span class="sp"></span><button class="xbtn" data-c="close">✕</button></div>
   <p style="line-height:1.6">${esc(fld(H, 'nasa'))}</p><p class="fine">${L('Fonte', 'Source')}: NASA Human Research Program — nasa.gov/hrp/hazards</p>
   <div class="cols"><div class="card"><h3>${L('Por tripulante', 'By crew member')}</h3>${O.crew.map(c => { const h = c.hazards.find(x => x.id === id); return `<div style="padding:10px 0;border-bottom:1px solid var(--rule)"><div class="row"><b>${c.code}, ${esc(c.name)}</b><span class="sp"></span><span class="lvl ${h.status}">${LEVEL[h.status]}</span></div>
     <div class="fine">${h.values.map(([k, v]) => `${esc(tr(k))}: <span class="mono" style="color:var(--ink)">${esc(/T\d\d:/.test(v) ? ago(v) : tr(v))}</span>`).join(', ')}</div><div class="fine ${h.status === 'ok' ? '' : 'warn'}">${esc(tr(h.note))}</div></div>`; }).join('')}</div>
    <div><div class="card" style="margin-bottom:12px"><h3>${L('Dados de referência', 'Reference data')}</h3>${H.facts.map(f => `<div style="padding:6px 0">${esc(fld(f, 'text'))}<div class="fine">${esc(f.source)}</div></div>`).join('')}</div>
     <div class="card"><h3>${L('Contramedidas a indicar à tripulação', 'Countermeasures to advise the crew')}</h3><ul style="margin:0;padding-left:18px;line-height:1.7">${fld(H, 'actions').map(a => `<li>${esc(a)}</li>`).join('')}</ul></div></div></div>`);
}

/* ---------- modais ---------- */
const openModal = h => { $('#mbox').innerHTML = h; $('#modal').classList.add('show'); };
const closeModal = () => $('#modal').classList.remove('show');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-c="close"]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
async function openTriage(id) {
  const t = await A.get('/api/console/triages/' + id);
  openModal(`<div class="row"><div><span class="fine">${t.id}, ${L('recebida da nave', 'received from the ship')}, ${ago(t.at)}</span><h2 style="margin:2px 0">${L('Rever orientação', 'Review guidance')}, ${t.person.code} ${esc(t.person.name)}</h2></div><span class="sp"></span><button class="xbtn" data-c="close">✕</button></div>
  <div class="cols" style="margin-top:14px"><div>
   <h3>${L('Texto original', 'Original text')}</h3><div class="quote">“${esc(t.text)}”</div>
   <h3>${L('Resumo confirmado pelo tripulante', 'Summary confirmed by the crew member')}</h3><ul class="summ">${t.summary.symptoms.map(s => `<li><b>${esc(tr(s))}</b><span class="muted">${esc(tr(t.summary.intensity))}</span><span class="muted">${esc(tr(t.summary.since))}</span></li>`).join('')}</ul>
   <h3>${L('Medições usadas', 'Measurements used')}</h3><div class="kv">${Object.entries(t.measurements).map(([k, v]) => `<span class="muted">${esc(IND_NAME[k] || k)}</span><b>${v}${t.baseline[k] != null ? ` (${L('linha de base', 'baseline')} ${t.baseline[k]})` : ''}</b>`).join('')}</div>
   <h3 style="margin-top:12px">${L('Orientação da IA de bordo', 'On-board AI guidance')} <span class="prov">${L('Provisória', 'Provisional')}</span></h3>
   <div class="card"><span class="lvl ${t.level}">${LEVEL[t.level]}</span><p>${esc(t.conduct)}</p>${t.prevention.length ? `<ul style="margin:0;padding-left:18px">${t.prevention.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
   ${t.rule ? `<p class="fine crit">${L('Regra fixa', 'Fixed rule')} ${esc(tr(t.rule))} ${L('disparou', 'fired')}</p>` : ''}<p class="fine">${esc(t.ai_summary)}<br>${L('Fornecedor', 'Provider')}: ${esc(t.provider)}</p></div></div>
  <div><h3>${L('Decisão da cirurgiã de voo', 'Flight surgeon decision')}</h3>
   <div class="seg" id="dType"><button data-d="validar" class="on">${L('Validar', 'Validate')}</button><button data-d="corrigir">${L('Corrigir', 'Correct')}</button><button data-d="info">${L('Pedir mais informação', 'Ask for more info')}</button></div>
   <div class="form" style="margin-top:14px"><label>${L('Nível', 'Level')}<select id="dLvl"><option value="ok">${LEVEL.ok}</option><option value="warn">${LEVEL.warn}</option><option value="crit">${LEVEL.crit}</option></select></label>
    <label>${L('Mensagem para', 'Message to')} ${esc(t.person.first_name)}<textarea id="dTxt" rows="5">${L('Concordo com a orientação de bordo. ', 'I agree with the on-board guidance. ')}${t.level === 'ok' ? L('Volte a registar se piorar.', 'Log again if it gets worse.') : L('Repita a medição do coração dentro de 20 minutos e mantenha-nos informados.', 'Repeat the heart measurement within 20 minutes and keep us informed.')}</textarea></label>
    <div class="tpl">${[L('Faça o teste de visão (grelha de Amsler) e envie uma foto do fundo do olho com o oftalmoscópio de bordo.', 'Do the vision test (Amsler grid) and send a fundus photo with the on-board ophthalmoscope.'), L('Fique em repouso hoje; a comandante redistribui as suas tarefas.', 'Rest today; the commander will reassign your tasks.'), L('Precisamos de mais detalhes: a dor muda com a posição? Desde que horas exactamente?', 'We need more detail: does the pain change with position? Since exactly what time?')].map(s => `<button type="button" data-ins="${esc(s)}">${esc(s.slice(0, 44))}…</button>`).join('')}</div>
    <div class="row"><span class="fine">${L(`Chega à nave em ${fmtDelay(t.delay_s)}. A orientação da IA fica sempre no registo.`, `Reaches the ship in ${fmtDelay(t.delay_s)}. The AI guidance always stays in the log.`)}</span><span class="sp"></span><button class="btn pri" data-c="decide" data-id="${t.id}">${L('Enviar decisão', 'Send decision')}</button></div></div></div></div>`);
  $('#dLvl').value = t.level;
  $('#dType').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; $$('#dType button').forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.d === 'info') $('#dTxt').value = L('Precisamos de mais informação: ', 'We need more information: '); };
  $$('[data-ins]').forEach(b => b.onclick = () => { $('#dTxt').value = b.dataset.ins; });
}
async function openCrew(id) {
  const d = await A.get('/api/console/crew/' + id), c = d.card;
  openModal(`<div class="row"><span class="av" style="--c:${c.color};width:52px;height:52px;border-radius:14px;font-size:15px">${c.code}</span><div><h2 style="margin:0">${esc(c.name)}</h2><span class="fine">${esc(tr(c.role))}, ${esc(tr(c.vitals.location))}</span></div><span class="sp"></span><span class="lvl ${c.status}">${LEVEL[c.status]}</span><button class="xbtn" data-c="close">✕</button></div>
  <div class="cols" style="margin-top:18px">${Object.entries(IND).map(([k, I]) => `<div class="card"><h3>${I.n}, ${L('14 dias', '14 days')}</h3>${chartSVG(d.history[k], d.baseline[k], I.margin, { dec: I.dec })}<div class="fine" style="margin-top:6px">${d.baseline[k] != null ? trendText(d.history[k], d.baseline[k], I.margin, I.words) : ''}</div></div>`).join('')}
   <div class="card"><h3>${L('Últimos valores recebidos', 'Latest values received')}</h3><div class="kv">${Object.entries(c.values).map(([k, v]) => `<span class="muted">${esc(IND_NAME[k] || k)}</span><b>${esc(fmtInd(k, v))} <span class="fine">${ago(v.at)}, ${esc(v.method)}</span></b>`).join('')}</div>
    <div class="hr"></div><div class="kv"><span class="muted">${L('Dose acumulada', 'Cumulative dose')}</span><b>${f1(c.dose.cumulative_mSv)} mSv ${L('de', 'of')} ${c.dose.career_limit_mSv}</b><span class="muted">${L('Taxa actual', 'Current rate')}</span><b>${f1(c.dose.rate_uSv_h)} µSv/h${c.dose.sheltered ? L(', no abrigo', ', in shelter') : ''}</b></div>
    <div class="hr"></div><h3>${L('Queixas', 'Complaints')}</h3>${d.triages.map(t => `<div class="fine">${t.id}, <span class="${t.level}">${LEVEL[t.level]}</span>, ${esc(t.symptoms.map(tr).join(', '))}, ${t.decided ? L('decidida', 'decided') : L('por validar', 'pending')}</div>`).join('') || `<div class="fine">${L('Sem queixas recebidas.', 'No complaints received.')}</div>`}
    <div class="row" style="margin-top:14px"><button class="btn pri sm" data-c="msgto" data-p="${c.id}">${L('Enviar instrução a', 'Send instruction to')} ${esc(c.first_name)}</button></div></div></div>
  <p class="fine" style="margin-top:12px">${L(`Este acesso ficou registado. ${esc(c.first_name)} vê-o no separador Registo do tablet.`, `This access was logged. ${esc(c.first_name)} can see it in the tablet's Log tab.`)}</p>`);
}
function openCam(id) {
  const c = CAMS.find(x => x.id === id);
  openModal(`<div class="row"><h2 style="margin:0">${c.code} · ${esc(tr(c.name))}</h2><span class="sp"></span><button class="xbtn" data-c="close">✕</button></div>
   ${c.image ? `<img src="${c.image}" style="width:100%;border-radius:14px;margin-top:14px;display:block" alt="">` : `<div class="empty" style="padding:60px 0;justify-content:center">${L('Imagem indisponível no momento', 'Image unavailable right now')}</div>`}
   <p class="fine">${c.image ? esc(c.title || c.caption) : ''}${c.image && c.date ? ', ' + esc(c.date) : ''}${c.image && c.credit ? ', ' + esc(c.credit) : ''}${c.image && c.source_url ? `, <a href="${esc(c.source_url)}" target="_blank" rel="noopener">${L('fonte', 'source')}</a>` : ''}</p>`);
}

/* ---------- acções ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-c]'); if (!b || !A.token) return;
  const a = b.dataset.c;
  try {
    switch (a) {
      case 'dist': await A.patch('/api/mission', { distance: b.dataset.k }); break;
      case 'link': await A.patch('/api/mission', { link_open: !O.mission.link_open }); toast(O.mission.link_open ? L('Ligação cortada, a nave continua autónoma', 'Link cut, the ship stays autonomous') : L('Ligação reaberta, a fila retoma', 'Link reopened, the queue resumes'), O.mission.link_open ? 'warn' : ''); break;
      case 'demo-run': await A.post('/api/console/demo/' + b.dataset.k); toast(L('Cenário iniciado a bordo, os dados chegam com o atraso da ligação', 'Scenario started on board, data arrives with the link delay')); loadSW(); break;
      case 'crew': await openCrew(b.dataset.id); break;
      case 'tri': await openTriage(b.dataset.id); break;
      case 'cam': openCam(b.dataset.id); break;
      case 'haz': openHazard(b.dataset.id); break;
      case 'decide': {
        const r = await A.post(`/api/console/triages/${b.dataset.id}/decision`, { type: $('#dType .on').dataset.d, level: $('#dLvl').value, text: $('#dTxt').value });
        closeModal(); toast(L('Decisão enviada, ', 'Decision sent, ') + (r.arrives ? L('chega à nave em ', 'reaches the ship in ') + fmtDelay(O.mission.delay_s) : L('retida (ligação cortada)', 'held (link cut)'))); break;
      }
      case 'read': await A.post(`/api/console/inbox/${b.dataset.id}/read`); break;
      case 'replyto': showView('com'); $('#cTo').value = b.dataset.p; $('#cText').value = `Re ${b.dataset.id}: `; $('#cText').focus(); $('#compose').scrollIntoView({ behavior: 'smooth', block: 'center' }); A.post(`/api/console/inbox/${b.dataset.id}/read`).catch(() => {}); break;
      case 'msgto': closeModal(); showView('com'); $('#cTo').value = b.dataset.p; $('#cText').focus(); $('#compose').scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
      case 'shelter': await sendMsg('all', TPL()[4].t, 'urgente', 'shelter'); break;
      case 'emerg': {
        const p = O.crew.find(c => c.id === +b.dataset.p);
        await sendMsg(String(p.id), L(`${p.first_name}: mantenha-se sentado e preso. A comandante fica consigo. Coloque o oxímetro e meça a tensão de 5 em 5 min. Estamos a acompanhar.`, `${p.first_name}: stay seated and restrained. The commander will stay with you. Put on the oximeter and measure blood pressure every 5 min. We are following.`), 'urgente');
        await sendMsg('all', L(`Alerta de ${p.code}: a comandante coordena. Levem o kit médico e o desfibrilhador para junto de ${p.first_name}.`, `Alert for ${p.code}: the commander coordinates. Bring the medical kit and the defibrillator to ${p.first_name}.`), 'urgente'); break;
      }
      case 'resolve': await A.post(`/api/console/alerts/${b.dataset.id}/resolve`); toast(L('Encerramento enviado para a nave', 'Closure sent to the ship')); break;
    }
    poll();
  } catch (err) { toast(L('Erro: ', 'Error: ') + esc(err.message), 'warn'); }
});
document.addEventListener('change', async e => { if (e.target.dataset?.c === 'demo') { await A.patch('/api/mission', { demo_mode: e.target.checked }); poll(); } });
async function sendMsg(to, text, priority, action = '') {
  const r = await A.post('/api/console/messages', { to, text, priority, action });
  toast(`${r.id} ${L('enviada', 'sent')}, ${r.arrives ? L('chega à nave em ', 'reaches the ship in ') + fmtDelay(O.mission.delay_s) : L('retida (ligação cortada)', 'held (link cut)')}`);
}
const renderTpls = () => { $('#tpls').innerHTML = TPL().map((t, i) => `<button type="button" data-tpl="${i}">${t.n}</button>`).join(''); };
$('#tpls').onclick = e => { const b = e.target.closest('[data-tpl]'); if (!b) return; const t = TPL()[+b.dataset.tpl]; $('#cText').value = t.t; $('#cText').dataset.action = t.action || ''; if (t.urg) setPrio('urgente'); };
function setPrio(p) { prio = p; $$('#cPrio button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); }
$('#cPrio').onclick = e => { const b = e.target.closest('[data-p]'); if (b) setPrio(b.dataset.p); };
$('#compose').addEventListener('submit', async e => {
  e.preventDefault(); const text = $('#cText').value.trim(); if (!text) { $('#cText').focus(); return; }
  try { await sendMsg($('#cTo').value, text, prio, $('#cText').dataset.action || ''); $('#cText').value = ''; $('#cText').dataset.action = ''; setPrio('normal'); poll(); }
  catch (err) { toast(L('Erro: ', 'Error: ') + esc(err.message), 'warn'); }
});
function renderTo() {
  const v = $('#cTo').value;
  $('#cTo').innerHTML = `<option value="all">${L('Toda a tripulação', 'Whole crew')}</option>` + CREW.map(c => `<option value="${c.id}">${c.code}, ${esc(c.name)}</option>`).join('');
  if (v) $('#cTo').value = v;
}

/* ---------- idioma ---------- */
onLang(() => { renderTpls(); renderTo(); if (O) { renderAll(); renderSpace(); renderCams(true); tickClock(); } });

/* ---------- início ---------- */
(async () => {
  $$('[data-ic]').forEach(e => { e.outerHTML = icon(e.dataset.ic); });
  $('#loginLang').innerHTML = langToggle(); $('#appLang').innerHTML = langToggle();
  applyLang(); renderTpls();
  try { HAZ = await A.get('/api/hazards'); } catch (e) {}
  try { CREW = await A.get('/api/auth/crew'); } catch (e) {}
  renderTo();
  starfield($('#login'));
  if (A.token) start(); else showLogin();
})();
