/* ASTRA, tablet do tripulante */
const A = api('tablet');
const S = { crew: [], pinPick: null, pin: '', sum: null, tab: 'hoje', hash: '', lock: false,
  seenMsg: null, seenDec: null, dismissed: new Set(), ck: { step: 0 }, tri: { stage: 'write', text: '' }, evo: 'reaction_ms', haz: 'radiacao', HAZ: null, fetchedAt: 0 };
const main = $('#main'), ov = $('#overlay'), screen = $('#screen');
A.onLogout = () => { A.setToken(null); S.sum = null; render(); };

/* ---------- moldura: ajustar à janela ---------- */
function fitDevice() { const s = Math.min(innerWidth / 1290, innerHeight / 920); $('#device').style.transform = `scale(${s})`; }
addEventListener('resize', fitDevice); fitDevice();

/* ---------- ícones ---------- */
const ICON = {
  hoje: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  checkup: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M6 12h3l1.5-2 2 4 1.5-2H18"/>',
  aparelhos: '<rect x="4" y="7" width="12" height="10" rx="2"/><path d="M16 10h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2M8 11h4M10 9v4"/>',
  perigos: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  dist: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="3"/><path d="M7 12h9" stroke-dasharray="2 2"/>',
  grav: '<path d="M12 3v14M7 12l5 5 5-5M5 21h14"/>',
  amb: '<path d="M4 10a8 8 0 0 1 16 0v8H4z"/><path d="M9 14h6"/>',
  iso: '<circle cx="12" cy="8" r="3"/><path d="M6 20a6 6 0 0 1 12 0"/><rect x="2" y="2" width="20" height="20" rx="3"/>',
  evolucao: '<path d="M4 19h16M5 15l4-5 4 3 6-8"/>',
  triagem: '<path d="M9 3h6v3H9z"/><path d="M6 5h12v16H6z"/><path d="M9 11h6M9 15h4"/>',
  mensagens: '<path d="M4 5h16v11H9l-5 4z"/>',
  registo: '<path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  sair: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  radiacao: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3a9 9 0 0 1 7.8 4.5L13.7 11M10.3 11L4.2 7.5A9 9 0 0 1 12 3M13 13.7l3.5 6.1a9 9 0 0 1-9 0L11 13.7"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const NAV = () => [['hoje', L('Hoje', 'Today')], ['checkup', 'Check-up'], ['aparelhos', L('Aparelhos', 'Devices')], ['perigos', L('5 Perigos', '5 Hazards')], ['evolucao', L('Evolução', 'Trends')], ['triagem', L('Triagem', 'Triage')], ['mensagens', L('Mensagens', 'Messages')], ['registo', L('Registo', 'Log')]];
const MOODS = ['Muito mal', 'Mal', 'Normal', 'Bem', 'Muito bem'], STRESS = ['Baixo', 'Moderado', 'Alto', 'Muito alto'];

/* ---------- barra de missão ---------- */
function renderStatus() {
  const s = $('#status'), m = S.sum?.mission || S.mission;
  // só mexe no DOM quando o conteúdo muda (evita piscar e cliques perdidos no selector de idioma)
  const set = h => { if (s.dataset.h !== h) { s.dataset.h = h; s.innerHTML = h; } };
  if (!m) { set('<span>ASTRA</span><span class="sp"></span>' + langToggle()); return; }
  const el = (Date.now() - S.fetchedAt) / 1000;
  s.className = 'status' + (m.link_open ? '' : ' cut');
  set(`<b>${esc(tr(m.short))}</b><span>${esc(tr(m.real_delay_text))}${m.demo_mode && m.distance === 'mars' ? ' <span style="color:var(--warn)">(demo ' + fmtDelay(m.delay_s) + ')</span>' : ''}</span>
   <span><i class="ldot ${m.link_open ? 'on' : ''}"></i>${m.link_open ? L('Ligação aberta', 'Link open') : L('Ligação cortada', 'Link cut')}</span><span>${L('Fila', 'Queue')} ${m.queue.up}</span>
   ${S.sum && S.sum.dose.flux_pfu > 10 ? `<span style="color:var(--warn)">${S.sum.dose.s_scale}, ${f0(S.sum.dose.flux_pfu)} pfu</span>` : ''}
   <span class="sp"></span>${S.sum ? `<span class="who">${S.sum.person.code}, ${esc(S.sum.person.first_name)}</span>` : ''}<span>${fmtMet({ seconds: m.met.seconds + el })}</span>${langToggle()}`);
}
setInterval(renderStatus, 1000);

function renderRail() {
  const r = $('#rail');
  if (!S.sum) { r.style.display = 'none'; return; }
  r.style.display = '';
  const unread = S.sum.messages.filter(m => !m.acked).length;
  r.innerHTML = NAV().map(([k, l]) => `<button data-act="nav" data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${ico(k)}${l}${k === 'mensagens' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('')
    + `<span class="sp"></span><button data-act="logout">${ico('sair')}${L('Sair', 'Sign out')}</button>`;
}
function busy() {
  const a = document.activeElement;
  return S.lock || (a && main.contains(a) && /INPUT|TEXTAREA/.test(a.tagName));
}
function render() {
  screen.classList.toggle('ui', !!S.sum);
  renderStatus(); renderRail();
  const v = S.sum ? S.tab : (S.pinPick ? 'pin' : 'login');
  main.innerHTML = (VIEWS[v] || VIEWS.hoje)();
  if (v === 'checkup') mountCheckup();
}

/* ---------- dados ---------- */
async function refresh(force) {
  if (!A.token) { try { S.mission = await A.get('/api/mission'); S.fetchedAt = Date.now(); } catch (e) {} renderStatus(); return; }
  try {
    const d = await A.get('/api/tablet/summary');
    S.sum = d; S.fetchedAt = Date.now();
    notify(d);
    const h = JSON.stringify([d.values, d.messages, d.sent, d.triages.map(t => [t.id, t.decision]), d.alerts.map(a => [a.id, a.acks]), d.messages_in_transit, d.access_log.length, d.dose.s_scale, d.hazards.map(h => h.status + h.note)]);
    checkAlert(d);
    if (force || (h !== S.hash && !busy())) { S.hash = h; render(); } else { renderRail(); }
  } catch (e) { if (!A.token) render(); }
}
function notify(d) {
  const ids = new Set(d.messages.map(m => m.id)), decs = new Set(d.triages.filter(t => t.decision).map(t => t.id));
  if (S.seenMsg) {
    d.messages.filter(m => !S.seenMsg.has(m.id)).forEach(m => {
      toast(`<b>${m.priority === 'urgente' ? L('Instrução urgente da Terra', 'Urgent instruction from Earth') : L('Nova mensagem da Terra', 'New message from Earth')}</b><br>${esc(m.text.slice(0, 100))}`, m.priority === 'urgente' ? 'warn' : '', screen);
      if (m.priority === 'urgente' && !m.acked) urgent(m);
    });
    d.triages.filter(t => t.decision && !S.seenDec.has(t.id)).forEach(t => toast(`<b>${L('Resposta da Terra sobre', 'Reply from Earth on')} ${t.id}</b><br>${esc(t.decision.text.slice(0, 100))}`, '', screen));
  }
  S.seenMsg = ids; S.seenDec = decs;
}

/* ---------- vistas ---------- */
const VIEWS = {};
VIEWS.login = () => `<div class="login"><div class="l"><span class="brandmark"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="6.5" fill="currentColor"/><ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-24 16 16)"/><circle cx="28.4" cy="10.4" r="2.1" fill="#E8A33D"/></svg>ASTRA</span><h1>${L('Quem está a usar?', 'Who is using this?')}</h1>
  <p class="muted">${L('Funciona mesmo quando a ligação à Terra cai: as medições, a triagem e os alertas correm no computador da nave.', 'Works even when the link to Earth drops: measurements, triage and alerts run on the ship computer.')}</p>
</div>
  <div class="pick">${S.crew.map(c => `<button data-act="pick" data-id="${c.id}"><span class="av" style="--c:${c.color}">${c.code}</span><span><b>${esc(c.name)}</b><small>${esc(tr(c.role))}</small></span></button>`).join('') || `<div class="empty">${L('A ligar ao servidor de bordo…', 'Connecting to the ship server…')}</div>`}</div></div>`;
VIEWS.pin = () => {
  const c = S.crew.find(x => x.id === S.pinPick);
  return `<div class="pin"><div style="text-align:center"><span class="av" style="--c:${c.color};margin:0 auto;width:64px;height:64px;font-size:18px">${c.code}</span>
  <h2 style="margin:12px 0 2px">${esc(c.name)}</h2><div class="muted">${L('Escreva o seu PIN de 4 dígitos', 'Enter your 4-digit PIN')}</div>
  <div class="pdots" id="pdots">${[0, 1, 2, 3].map(i => `<i class="${i < S.pin.length ? 'f' : ''}"></i>`).join('')}</div>
  <div class="fine" id="pinmsg">&nbsp;</div><button class="btn ghost sm" data-act="pinback" style="margin-top:12px">← ${L('Voltar', 'Back')}</button></div>
  <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-act="key" data-k="${k}">${k}</button>`).join('')}</div></div>`;
};

function val(ind) { return S.sum.values[ind]; }
function evalOf(ind) { return S.sum.eval.indicators[ind]; }
function tile(key, lab, v, unit, ind, extraWarn, word, hz) {
  const e = ind && evalOf(ind); const warn = (e && e.out) || extraWarn;
  const w = word || (e ? (e.out ? `${LEVEL.warn}, ${e.pct > 0 ? '+' : ''}${e.pct}%` : `${LEVEL.ok}, ${L('na linha de base', 'at baseline')}`) : LEVEL.ok);
  const ti = { reaction: 'bolt', exercise: 'dumbbell', grip: 'hand', sleep: 'moon', mood: 'mood', bp: 'drop', spo2: 'lungs' }[key];
  const ic = key === 'heart' ? heartBeat(parseFloat(v)) : `<span class="tico">${icon(ti || 'pulse')}</span>`;
  return `<div class="tile ${warn ? 'warn' : ''}"><div class="lab"><span class="tl">${ic}${lab}</span>${hz ? `<span class="hzmini" title="${L('Perigo NASA', 'NASA hazard')}">${hz}</span>` : ''}</div><div class="val">${v} <small>${unit}</small></div><div class="st ${warn ? 'warn' : 'ok'}">${w}</div></div>`;
}
VIEWS.hoje = () => {
  const d = S.sum, p = d.person, v = k => val(k)?.value;
  const last = d.eval.last_measured, today = last && (Date.now() - new Date(last)) < 12 * 3600e3;
  const mood = val('mood')?.text, moodBad = ['Mal', 'Muito mal'].includes(mood);
  const stress = v('stress') || 0, stressW = stress ? L('Stress ', 'Stress ') + tr(STRESS[stress - 1]).toLowerCase() : '';
  const G = d.hazards.find(h => h.id === 'gravidade'), gEx = G.exercise_min || 0, gGrip = /força/.test(G.note);
  const lastDec = d.triages.find(t => t.decision);
  const msgs = d.messages.slice(0, 2);
  const al = d.alerts[0];
  const W = (warn, pt, en) => (warn ? LEVEL.warn : LEVEL.ok) + ', ' + L(pt, en);
  return `<div class="row" style="margin-bottom:20px"><div><div class="fine">${esc(tr(d.location))}, ${esc(tr(p.role))}</div><h1>${L('Olá', 'Hello')}, ${esc(p.first_name)}</h1></div><span class="sp"></span>
   <span class="tag ${d.overall.status === 'ok' ? 'ok' : 'warn'}" style="max-width:520px;overflow:hidden;text-overflow:ellipsis" title="${esc(d.overall.reasons.map(tr).join('; '))}">${d.overall.status === 'ok' ? L('Verde, os 5 perigos sob controlo', 'Green, all 5 hazards under control') : LEVEL.warn + ', ' + esc(d.overall.reasons.slice(0, 2).map(tr).join(', '))}</span></div>
  <div style="margin-bottom:22px">${hazStrip()}</div>
  ${al ? `<div class="msg urg" style="border-color:rgba(255,95,95,.5);background:linear-gradient(90deg,var(--crit-soft),transparent)"><b class="crit">${L('Alerta crítico activo', 'Critical alert active')}, ${al.person.code}</b> <span class="fine">${Object.keys(al.acks).length}/${al.crew.length} ${L('confirmaram', 'acknowledged')}</span></div>` : ''}
  <div class="grid2"><div>
   <div class="ck ${today ? 'done' : ''}"><div class="sp"><b>${today ? L('Check-up feito ', 'Check-up done ') + ago(last) : L('Hora do check-up da manhã', 'Time for the morning check-up')}</b><div class="fine">${L('Coração, tremor, reacção, sono, humor e stress, cerca de 3 min', 'Heart, tremor, reaction, sleep, mood and stress, about 3 min')}</div></div>
     <button class="btn ${today ? '' : 'pri'}" data-act="nav" data-tab="checkup">${today ? L('Repetir', 'Repeat') : L('Começar check-up', 'Start check-up')}</button></div>
   <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${icon('pulse')} ${L('Os seus sinais', 'Your vitals')}</h3><span class="sp"></span><button class="btn ghost sm" data-act="nav" data-tab="aparelhos">+ ${L('Medir com aparelho', 'Measure with device')}</button></div>
   <div class="tiles">
    ${tile('heart', L('Coração', 'Heart'), f0(v('heart_rate')), 'bpm', 'heart_rate')}
    ${tile('reaction', L('Reacção', 'Reaction'), f0(v('reaction_ms')), 'ms', 'reaction_ms', false, null, 'G')}
    ${tile('exercise', L('Exercício', 'Exercise'), f0(gEx), 'min', null, gEx < 60, gEx < 60 ? W(1, 'menos de 1 h em 24 h', 'under 1 h in 24 h') : W(0, 'nas últimas 24 h', 'in the last 24 h'), 'G')}
    ${tile('grip', L('Força da mão', 'Grip'), f1(v('grip_kg')), 'kg', null, gGrip, gGrip ? W(1, 'abaixo da linha de base', 'below baseline') : W(0, 'na linha de base', 'at baseline'), 'G')}
    ${tile('sleep', L('Sono', 'Sleep'), f1(v('sleep_h')), 'h', 'sleep_h', false, evalOf('sleep_h')?.out ? W(1, 'menos que o habitual', 'less than usual') : null, 'I')}
    ${tile('mood', L('Humor', 'Mood'), esc(tr(mood) || '—'), '', null, moodBad || stress >= 3, (moodBad || stress >= 3 ? LEVEL.warn + ', ' : '') + (stressW || L('Stress não registado', 'Stress not logged')), 'I')}
    ${tile('bp', L('Tensão', 'BP'), `${f0(v('bp_sys'))}/${f0(v('bp_dia'))}`, 'mmHg', null, v('bp_sys') >= 135, v('bp_sys') >= 135 ? W(1, 'acima do normal', 'above normal') : W(0, 'normal', 'normal'))}
    ${tile('spo2', 'SpO₂', f0(v('spo2')), '%', null, v('spo2') < 95, v('spo2') < 95 ? W(1, 'baixo', 'low') : W(0, 'normal', 'normal'))}
   </div></div>
   <div>
    <div class="row" style="margin-bottom:8px"><h3 style="margin:0">${icon('antenna')} ${L('Da Terra', 'From Earth')}</h3><span class="sp"></span><button class="btn ghost sm" data-act="nav" data-tab="mensagens">${L('Conversa', 'Chat')}</button></div>
    ${d.messages_in_transit ? `<div class="msg"><span class="dots"><i></i><i></i><i></i></span> <span class="fine">${L(`${d.messages_in_transit} mensagem(ns) a caminho da nave`, `${d.messages_in_transit} message(s) on the way to the ship`)}</span></div>` : ''}
    ${msgs.length ? msgs.map(msgCard).join('') : `<div class="msg"><p class="muted">${L('Sem instruções novas.', 'No new instructions.')}</p></div>`}
    ${lastDec ? `<div class="msg"><div class="meta"><span class="valid">${{ validar: L('Validada', 'Validated'), corrigir: L('Corrigida', 'Corrected'), info: L('Pede mais informação', 'More info requested') }[lastDec.decision.type]}</span> ${lastDec.id}, ${ago(lastDec.decision.at)}</div><p>${esc(lastDec.decision.text)}</p></div>` : ''}
    <div class="card" style="margin-top:14px;padding:16px 18px;${d.dose.flux_pfu > 10 ? 'border-color:rgba(247,181,56,.4)' : ''}"><div class="row"><span class="${d.dose.flux_pfu > 10 ? 'warn glow' : 'muted'}" style="width:22px">${icon('radiation', d.dose.flux_pfu > 10 ? 'spin' : '')}</span><b style="color:var(--head)">${L('Radiação', 'Radiation')}</b><span class="sp"></span><span class="tag ${d.dose.flux_pfu > 10 ? 'warn' : 'ok'}">${d.dose.s_scale === '—' ? L('Sem evento', 'No event') : d.dose.s_scale}</span></div>
     <div class="kv" style="margin-top:12px"><span class="muted">${L('Taxa de dose', 'Dose rate')}</span><b>${f1(d.dose.rate_uSv_h)} µSv/h</b><span class="muted">${L('Acumulada na missão', 'Mission cumulative')}</span><b>${f1(d.dose.cumulative_mSv)} mSv</b>
     <span class="muted">${L('Protões ≥10 MeV', 'Protons ≥10 MeV')}</span><b>${d.dose.flux_pfu == null ? '—' : f1(d.dose.flux_pfu) + ' pfu'} <span class="fine">${esc(tr(d.dose.flux_source))}</span></b></div>
     ${d.dose.sheltered ? `<p class="fine warn" style="margin:8px 0 0">${L('Está no abrigo de tempestade.', 'You are in the storm shelter.')}</p>` : ''}</div>
   </div></div>`;
};
function msgCard(m) {
  return `<div class="msg ${m.priority === 'urgente' ? 'urg' : ''}"><div class="meta"><b style="color:var(--head)">${L('Controlo', 'Control')}, Dra. Inês Matola</b>${m.priority === 'urgente' ? `<span class="tag warn">${L('Urgente', 'Urgent')}</span>` : ''}<span class="sp"></span>${ago(m.arrived)}</div>
  <p>${esc(m.text)}</p><div class="row">${m.acked ? `<span class="valid">✓ ${L('Confirmado', 'Acknowledged')} ${ago(m.acked)}</span>` : `<button class="btn pri sm" data-act="ack" data-id="${m.id}">${L('Confirmar que li', 'Acknowledge')}</button>`}
  <button class="btn ghost sm" data-act="reply" data-id="${m.id}">${L('Responder', 'Reply')}</button><span class="fine">${m.all ? L('Para toda a tripulação', 'For the whole crew') : L('Só para si', 'Only for you')}</span></div></div>`;
}

/* --- conversa com a Terra (nos dois sentidos) --- */
VIEWS.mensagens = () => {
  const d = S.sum;
  const items = [...d.messages.map(m => ({ k: 'in', at: m.arrived, m })), ...d.sent.map(s => ({ k: 'out', at: s.at, s }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const reply = S.replyTo ? d.messages.find(m => m.id === S.replyTo) : null;
  return `<div class="row"><h1>${L('Conversa com a Terra', 'Chat with Earth')}</h1><span class="sp"></span><span class="tag live">${L('Atraso', 'Delay')} ${fmtDelay(d.mission.delay_s)} ${L('em cada sentido', 'each way')}</span></div>
  <p class="muted" style="margin-top:4px">${L('Instruções da cirurgiã de voo e as suas mensagens para a consola. Nada se apaga.', 'Instructions from the flight surgeon and your messages to the console. Nothing is deleted.')}</p>
  <div class="card" style="margin-bottom:14px">
   ${reply ? `<div class="fine" style="margin-bottom:6px">${L('A responder a', 'Replying to')} ${reply.id}: “${esc(reply.text.slice(0, 70))}…” <button class="btn ghost sm" data-act="noreply">✕</button></div>` : ''}
   <div class="row" style="align-items:flex-end"><textarea id="txText" rows="2" placeholder="${L('Escreva para a Terra…', 'Write to Earth…')}"></textarea><button class="btn pri" data-act="send">${L('Enviar', 'Send')}</button></div>
   <div class="chips">${[L('Instrução recebida, vou cumprir.', 'Instruction received, will comply.'), L('Preciso de falar com a cirurgiã de voo em privado.', 'I need to talk to the flight surgeon in private.'), L('Check-up feito. Sinto-me bem.', 'Check-up done. I feel fine.'), L('Posso adiar o exercício de hoje?', "Can I postpone today's exercise?")].map(s => `<button data-act="txchip" data-t="${esc(s)}">${esc(s)}</button>`).join('')}</div>
   ${d.mission.link_open ? '' : `<p class="fine warn" style="margin:0">${L('Ligação cortada: a mensagem fica na fila e segue quando a ligação voltar.', 'Link cut: the message waits in the queue and goes out when the link returns.')}</p>`}
  </div>
  ${d.messages_in_transit ? `<div class="msg"><span class="dots"><i></i><i></i><i></i></span> <span class="fine">${L(`${d.messages_in_transit} mensagem(ns) da Terra a caminho`, `${d.messages_in_transit} message(s) from Earth on the way`)}</span></div>` : ''}
  ${items.length ? items.map(it => it.k === 'in' ? msgCard(it.m) : `<div class="msg out">
     <div class="meta"><b style="color:var(--sinal)">${L('Você → Terra', 'You → Earth')}</b> ${it.s.id}${it.s.reply_to ? L(', resposta a ', ', reply to ') + it.s.reply_to : ''}<span class="sp"></span>${ago(it.s.at)}</div><p>${esc(it.s.text)}</p>
     <div class="fine">${!it.s.arrives ? L('Retida a bordo (ligação cortada)', 'Held on board (link cut)') : new Date(it.s.arrives) > Date.now() ? L(`A caminho, chega em ${Math.ceil((new Date(it.s.arrives) - Date.now()) / 1000)} s`, `On the way, arrives in ${Math.ceil((new Date(it.s.arrives) - Date.now()) / 1000)} s`) : '✓ ' + L('Entregue na Terra', 'Delivered to Earth')}${it.s.read ? L(', lida', ', read') : ''}</div></div>`).join('')
    : `<div class="empty">${L('Ainda não há mensagens.', 'No messages yet.')}</div>`}`;
};

/* --- os cinco perigos do voo espacial (NASA Human Research Program) --- */
const HZ_ICON = { radiacao: 'radiacao', isolamento: 'iso', distancia: 'dist', gravidade: 'grav', ambiente: 'amb' };
function hazStrip() {
  return `<div class="hzstrip">${S.sum.hazards.map(h => `<button class="hz ${h.status}" data-act="haz" data-k="${h.id}" title="${esc(tr(h.note))}"><b>${h.letter}<span class="hzi">${icon({ radiacao: 'radiation', isolamento: 'users', distancia: 'antenna', gravidade: 'dumbbell', ambiente: 'wind' }[h.id])}</span></b><span>${esc(tr(h.name))}</span><i class="lvl ${h.status}">${LEVEL[h.status]}</i></button>`).join('')}</div>`;
}
VIEWS.perigos = () => {
  const d = S.sum, h = d.hazards.find(x => x.id === S.haz), M = S.HAZ?.hazards.find(x => x.id === S.haz);
  return `<div class="row"><div><h1>${L('Os 5 perigos do voo espacial', 'The 5 hazards of spaceflight')}</h1><p class="muted" style="margin:4px 0 0">${L('Definidos pelo Human Research Program da NASA. Cada indicador do ASTRA pertence a um deles.', "Defined by NASA's Human Research Program. Every ASTRA indicator belongs to one of them.")}</p></div><span class="sp"></span><span class="tag">${L('Fonte', 'Source')}: nasa.gov/hrp/hazards</span></div>
  <div style="margin:16px 0">${hazStrip()}</div>
  ${h && M ? `<div class="grid2"><div class="card"><div class="row"><span class="hzicon">${ico(HZ_ICON[h.id])}</span><h2 style="margin:0">${esc(fld(M, 'name'))}</h2><span class="sp"></span><span class="lvl ${h.status}">${LEVEL[h.status]}</span></div>
    <p style="line-height:1.6">${esc(fld(M, 'nasa'))}</p><div class="hr"></div>
    <h3>${L('Os seus indicadores', 'Your indicators')}</h3><div class="kv">${h.values.map(([k, v]) => `<span class="muted">${esc(tr(k))}</span><b>${esc(/T\d\d:/.test(v) ? ago(v) : tr(v))}</b>`).join('')}</div>
    <p class="${h.status === 'ok' ? 'ok' : 'warn'}" style="margin:14px 0 0"><b>${esc(tr(h.note))}</b></p></div>
   <div><div class="card" style="margin-bottom:12px"><h3>${L('O que pode fazer', 'What you can do')}</h3><ul style="margin:0;padding-left:18px;line-height:1.7">${fld(M, 'actions').map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>
    <div class="card"><h3>${L('Dados de referência', 'Reference data')}</h3>${M.facts.map(f => `<div style="padding:8px 0;border-bottom:1px solid var(--line)">${esc(fld(f, 'text'))}<div class="fine">${esc(f.source)}</div></div>`).join('')}
    <div class="fine" style="margin-top:8px">${L('O ASTRA mede', 'ASTRA measures')}: ${esc(fld(M, 'indicators').join(', '))}</div></div></div></div>` : ''}`;
};

/* --- evolução --- */
VIEWS.evolucao = () => {
  const d = S.sum, k = S.evo, I = IND[k];
  return `<h1>${L('Evolução', 'Trends')}</h1><p class="muted" style="margin-top:4px">${L('Últimos 14 dias. Faixa verde = o seu normal; tracejado = linha de base (média dos primeiros 7 dias).', 'Last 14 days. Green band = your normal; dashed line = baseline (average of the first 7 days).')}</p>
  <div class="tabs" style="margin-bottom:14px">${Object.entries(IND).map(([x, e]) => `<button data-act="evo" data-k="${x}" class="${x === k ? 'on' : ''}">${e.n}</button>`).join('')}</div>
  <div class="card">${chartSVG(d.history[k], d.baseline[k], I.margin, { dec: I.dec, w: 900, h: 260 })}<div style="margin-top:10px">${d.baseline[k] != null ? trendText(d.history[k], d.baseline[k], I.margin, I.words) : ''}</div></div>
  <div class="row" style="margin-top:14px"><button class="btn sm" data-act="explain" data-k="${k}">${L('Perguntar sobre isto', 'Ask about this')}</button></div><div id="explain"></div>`;
};

/* --- registo / quem viu --- */
VIEWS.registo = () => `<h1>${L('Registo', 'Log')}</h1><p class="muted" style="margin-top:4px">${L('Quem acedeu aos seus dados. Os acessos negados também ficam registados.', 'Who accessed your data. Denied accesses are logged too.')}</p>
  <div class="card">${S.sum.access_log.map(a => `<div class="reg"><span class="${a.allowed ? 'tag ok' : 'tag crit'}" style="justify-self:start">${a.allowed ? L('Permitido', 'Allowed') : L('Negado', 'Denied')}</span><b style="color:var(--head)">${esc(tr(a.who))}</b><span>${esc(a.what)}</span><span class="fine">${ago(a.at)}</span></div>`).join('') || `<div class="empty">${L('Sem acessos', 'No accesses')}</div>`}</div>
  <p class="fine" style="margin-top:12px">${L('IA de bordo', 'On-board AI')}: ${esc(S.sum.ai.provider)}, ${esc(S.sum.ai.rules_version)}. ${L('A IA orienta; a decisão final é da cirurgiã de voo.', 'The AI guides; the final decision belongs to the flight surgeon.')}</p>`;

/* --- triagem --- */
VIEWS.triagem = () => {
  const t = S.tri, d = S.sum;
  let left;
  if (t.stage === 'write' || t.stage === 'thinking') {
    left = `<h2>${L('Como se sente?', 'How do you feel?')}</h2><p class="fine" style="margin-top:-6px">${L('Escreva pelas suas palavras. A IA de bordo resume e orienta sem esperar pela Terra.', 'Write in your own words. The on-board AI summarises and guides without waiting for Earth.')}</p>
    <textarea id="trText" rows="4" placeholder="${L('Ex.: Acordei com dor de cabeça forte e vejo um pouco desfocado do olho esquerdo. Estou enjoado.', 'E.g.: Acordei com dor de cabeça forte e vejo desfocado. (the on-board AI reads Portuguese)')}">${esc(t.text)}</textarea>
    <div class="chips">${['Dor de cabeça forte desde que acordei', 'Vejo desfocado', 'Estou enjoado', 'Dormi mal, muito cansado', 'Dor lombar ligeira', 'Sinto dor no peito'].map(s => `<button data-act="chip" data-t="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    ${t.stage === 'thinking' ? `<div class="row"><span class="dots"><i></i><i></i><i></i></span><span class="fine">${L('IA de bordo a analisar (rede local da nave, sem atraso)', 'On-board AI analysing (ship local network, no delay)')}</span></div>` : `<button class="btn pri" data-act="analyse">${L('Analisar com a IA de bordo', 'Analyse with on-board AI')}</button>`}`;
  } else if (t.stage === 'confirm') {
    const s = t.sum;
    left = `<h2>${L('Confirme o resumo', 'Confirm the summary')}</h2><p class="fine" style="margin-top:-6px">${L('Assim a orientação não parte de um mal-entendido.', "So the guidance doesn't start from a misunderstanding.")}</p><div class="quote">“${esc(t.text)}”</div>
    <ul class="summ">${s.symptoms.map(x => `<li><b>${esc(tr(x))}</b><span class="muted">${esc(tr(s.intensity))}</span><span class="muted">${esc(tr(s.since))}</span></li>`).join('')}</ul>
    <div class="row"><button class="btn pri" data-act="trconfirm">${L('Está correcto', 'That is correct')}</button><button class="btn" data-act="tredit">${L('Corrigir', 'Edit')}</button></div>`;
  } else left = triCard(t.result, true) + `<button class="btn sm" data-act="trnew" style="margin-top:8px">${L('Nova queixa', 'New complaint')}</button>`;
  return `<div class="row"><h1>${L('Triagem', 'Triage')}</h1><span class="sp"></span><span class="tag ok">${L('IA de bordo', 'On-board AI')}: ${esc(d.ai.provider)}</span></div>
  <div class="grid2" style="margin-top:14px"><div class="card">${left}</div><div><h3>${L('Histórico', 'History')}</h3>${d.triages.length ? d.triages.map(x => triCard(x, false)).join('') : `<div class="empty">${L('Sem queixas registadas.', 'No complaints logged.')}</div>`}</div></div>
  <p class="fine" style="margin-top:12px">${esc(d.ai.rules_version)}, ${L('a IA nunca diagnostica nem receita, as regras de segurança só sobem a prioridade.', 'the AI never diagnoses or prescribes; safety rules can only raise the priority.')}</p>`;
};
function triCard(t, full) {
  const st = t.decision ? (t.decision.type === 'validar' ? `<span class="valid">✓ ${L('Validada pela Terra', 'Validated by Earth')}</span>` : t.decision.type === 'corrigir' ? `<span class="valid" style="color:var(--sinal);background:var(--blue-soft)">${L('Corrigida pela Terra', 'Corrected by Earth')}</span>` : `<span class="prov">${L('Terra pede mais informação', 'Earth asks for more info')}</span>`) : `<span class="prov">${L('Provisória, aguarda validação', 'Provisional, awaiting validation')}</span>`;
  return `<div class="msg"><div class="meta"><span class="lvl ${t.level}">${LEVEL[t.level]}</span>${st}<span class="sp"></span>${t.id || ''}, ${ago(t.at)}</div>
  ${full ? `<p><b>${L('Conduta', 'Guidance')}:</b> ${esc(t.conduct)}</p>${t.prevention?.length ? `<b class="ok" style="font-size:12px">${L('Para ajudar a recuperar', 'To help recovery')}</b><ul style="margin:4px 0;padding-left:18px;font-size:13px">${t.prevention.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}` : `<p class="fine">${esc((t.summary?.symptoms || []).map(tr).join(', '))}</p>`}
  ${t.rule ? `<p class="fine crit">${L('Disparado pela regra fixa', 'Triggered by fixed rule')} ${esc(tr(t.rule))} ${L('(não pela IA)', '(not by the AI)')}</p>` : ''}
  ${t.decision ? `<div class="hr"></div><p style="margin:0"><b>${L('Terra', 'Earth')}:</b> ${esc(t.decision.text)}</p>` : ''}</div>`;
}

/* --- aparelhos de bordo --- */
VIEWS.aparelhos = () => `<h1>${L('Aparelhos de bordo', 'On-board devices')}</h1><p class="muted" style="margin-top:4px">${L('O tablet recebe a leitura do aparelho e guarda-a com o nome do aparelho. Tudo fica a bordo e segue para a Terra na fila.', "The tablet receives the device reading and stores it with the device's name. Everything stays on board and goes to Earth through the queue.")}</p>
  <div class="devs">
   ${dev('bp', L('Tensão arterial', 'Blood pressure'), L('Medidor de braço (oscilométrico)', 'Upper-arm monitor (oscillometric)'), L('Coloque a braçadeira 2 cm acima do cotovelo, braço ao nível do coração.', 'Place the cuff 2 cm above the elbow, arm at heart level.'))}
   ${dev('spo2', L('Oxímetro de dedo', 'Finger oximeter'), L('SpO₂ e pulso', 'SpO₂ and pulse'), L('Dedo indicador limpo, mão parada.', 'Clean index finger, hand still.'))}
   ${dev('temp', L('Termómetro timpânico', 'Tympanic thermometer'), L('Temperatura central', 'Core temperature'), L('Puxe a orelha para trás e encaixe a sonda.', 'Pull the ear back and insert the probe.'))}
   ${dev('glu', L('Glicómetro', 'Glucometer'), L('Glicemia capilar', 'Capillary glucose'), L('De preferência em jejum. Primeira gota limpa, use a segunda.', 'Preferably fasting. Wipe the first drop, use the second.'))}
   ${dev('grip', L('Dinamómetro de mão', 'Hand dynamometer'), L('Força de preensão, Gravidade alterada', 'Grip strength, Altered gravity'), L('Cotovelo a 90°, aperte com toda a força durante 3 s.', 'Elbow at 90°, squeeze as hard as you can for 3 s.'))}
   <div class="dev" id="dev-ex"><div class="row"><b>${L('Sessão de exercício', 'Exercise session')}</b><span class="sp"></span><span class="fine">${L('Gravidade alterada, objectivo ~2 h/dia', 'Altered gravity, goal ~2 h/day')}</span></div>
    <div class="devviz exviz" id="exViz">${EXVIZ[S.exDev || 'ARED']}<div class="exnote fine">${L('Movimento do aparelho escolhido. Registe os minutos no fim da sessão.', 'Motion of the selected machine. Log the minutes at the end of the session.')}</div></div>
    <div class="seg" id="exDev" style="margin:10px 0">${[['ARED', L('ARED (resistivo)', 'ARED (resistive)')], ['T2', L('Passadeira T2', 'T2 treadmill')], ['CEVIS', L('Bicicleta CEVIS', 'CEVIS cycle')]].map(([k, n]) => `<button data-act="exdev" data-v="${k}" class="${(S.exDev || 'ARED') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="stepper"><button data-act="exmin" data-d="-5">−</button><span class="v" id="exv">${S.exMin || 45} min</span><button data-act="exmin" data-d="5">+</button><span class="sp"></span><button class="btn pri sm" data-act="exsave">${L('Registar', 'Log')}</button></div>
    <div class="fine" style="margin-top:8px">${L('Hoje', 'Today')}: ${esc(tr(S.sum.hazards.find(h => h.id === 'gravidade').values[0][1]))}</div></div>
  </div>`;
/* ilustrações 2D dos aparelhos; as variáveis CSS --p (progresso/força/pressão) e --b (pulso) vêm dos sensores */
const VIZ = {
  bp: `<svg class="viz" viewBox="0 0 100 92" aria-hidden="true">
    <path class="skin" d="M-2 44h48a10 10 0 0 1 0 20H-2z"/><path class="skin2" d="M40 47a7 7 0 0 1 0 14"/>
    <rect class="cuff" x="10" y="40" width="26" height="28" rx="5"/><path class="cuffline" d="M14 46h18M14 62h18"/>
    <path class="tube" d="M24 40C24 22 46 18 62 24M74 47C74 62 70 66 70 72"/>
    <circle class="body" cx="76" cy="30" r="17"/><path class="tick" d="M64 38l2-1.5M60 30h3M64 22l2 1.5M76 16v3M88 22l-2 1.5M92 30h-3M88 38l-2-1.5"/>
    <path class="needle" d="M75 30L76 16L77 30z"/><circle class="hub" cx="76" cy="30" r="2.5"/>
    <ellipse class="bulb" cx="70" cy="80" rx="8" ry="10"/></svg>`,
  spo2: `<svg class="viz" viewBox="0 0 100 92" aria-hidden="true">
    <path class="skin" d="M-2 49h66a10 10 0 0 1 0 20H-2z"/><path class="nail" d="M62 52h4a6 6 0 0 1 0 14h-4z"/>
    <circle class="led" cx="58" cy="59" r="9"/>
    <rect class="body" x="36" y="30" width="42" height="20" rx="7"/><rect class="body" x="36" y="68" width="42" height="12" rx="6"/>
    <rect class="scr" x="42" y="34" width="30" height="12" rx="2"/><path class="hbeat" d="M48 40h4l2-3 3 6 2-3h7"/></svg>`,
  temp: `<svg class="viz" viewBox="0 0 100 92" aria-hidden="true">
    <path class="skin" d="M28 8C8 10 4 38 12 54c6 12 4 24 16 28 10 3 16-6 14-14-2-8 6-12 6-24C48 22 42 8 28 8z"/>
    <path class="skin2" d="M28 22c-8 2-10 14-4 22 4 6 2 12 6 16"/><circle class="canal" cx="32" cy="44" r="3"/>
    <g class="waves"><path d="M26 38a8 8 0 0 0 0 12"/><path d="M21 34a14 14 0 0 0 0 20"/></g>
    <path class="body" d="M36 41l18-4h34a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H66v20a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V57H54l-18-4z"/>
    <rect class="scr" x="66" y="42" width="24" height="10" rx="2"/><rect class="fill" x="68" y="44" width="20" height="6" rx="1"/></svg>`,
  glu: `<svg class="viz" viewBox="0 0 100 92" aria-hidden="true">
    <path class="skin" d="M-2 4h70a10 10 0 0 1 0 20H-2z"/><path class="nail" d="M66 7h3a6 6 0 0 1 0 14h-3z"/>
    <circle class="drop" cx="72" cy="27" r="3.2"/>
    <rect class="strip" x="66" y="32" width="12" height="18" rx="1.5"/><rect class="sample" x="66" y="32" width="12" height="6" rx="1.5"/>
    <rect class="body" x="50" y="46" width="44" height="42" rx="9"/><rect class="scr" x="57" y="54" width="30" height="14" rx="2"/>
    <rect class="fill" x="59" y="58" width="26" height="6" rx="1"/><circle class="btnc" cx="72" cy="78" r="4"/></svg>`,
  grip: `<svg class="viz" viewBox="0 0 100 92" aria-hidden="true">
    <circle class="body" cx="66" cy="22" r="17"/><path class="tick" d="M54 30l2-1.5M50 22h3M54 14l2 1.5M66 8v3M78 14l-2 1.5M82 22h-3"/>
    <path class="needle" d="M65 22L66 8L67 22z"/><circle class="hub" cx="66" cy="22" r="2.5"/>
    <rect class="body" x="60" y="38" width="12" height="10"/><rect class="body" x="46" y="46" width="40" height="8" rx="3"/>
    <rect class="skin" x="16" y="44" width="30" height="40" rx="12"/>
    <g class="squeeze"><rect class="body" x="46" y="70" width="40" height="8" rx="3"/>
      <path class="finger" d="M40 58h36a4 4 0 0 1 0 8H40zM40 66h38a4 4 0 0 1 0 8H40zM40 74h36a4 4 0 0 1 0 8H40z"/></g></svg>`,
};
const EXVIZ = {
  ARED: `<svg class="viz ex" viewBox="0 0 100 92" aria-hidden="true"><path class="floor" d="M8 84h84"/>
    <g class="up"><circle class="st" cx="50" cy="16" r="6"/><path class="st" d="M50 22v26M50 28l-12 2M50 28l12 2"/>
      <path class="bar" d="M20 30h60"/><rect class="plate" x="18" y="22" width="5" height="16" rx="1"/><rect class="plate" x="77" y="22" width="5" height="16" rx="1"/></g>
    <g class="legs"><path class="st" d="M50 48l-8 16 2 20M50 48l8 16-2 20"/></g></svg>`,
  T2: `<svg class="viz ex" viewBox="0 0 100 92" aria-hidden="true">
    <circle class="st" cx="52" cy="16" r="6"/><path class="st" d="M51 22l-1 24"/>
    <g class="armA"><path class="st" d="M51 28l-8 12"/></g><g class="armB"><path class="st" d="M51 28l8 12"/></g>
    <g class="legA"><path class="st" d="M50 46l-6 14 2 14"/></g><g class="legB"><path class="st" d="M50 46l6 14-2 14"/></g>
    <rect class="belt" x="10" y="76" width="80" height="8" rx="4"/><path class="beltd" d="M16 80h68"/></svg>`,
  CEVIS: `<svg class="viz ex" viewBox="0 0 100 92" aria-hidden="true"><path class="floor" d="M8 84h84"/>
    <path class="st" d="M30 66L50 46L66 66M50 46l-4-14M40 32h14M50 46l12-6M62 40l6-6"/>
    <g class="spin" style="transform-origin:30px 66px"><circle class="st" cx="30" cy="66" r="14"/><path class="st thin" d="M30 52v28M16 66h28M20 56l20 20M40 56L20 76"/></g>
    <g class="spin" style="transform-origin:66px 66px"><path class="st" d="M66 66v-9M66 66v9M62 57h8M62 75h8"/></g>
    <circle class="hub" cx="66" cy="66" r="2.5"/><path class="st" d="M24 84l6-4 6 4M60 84l6-4 6 4"/></svg>`,
};
function dev(k, n, sub, how) {
  return `<div class="dev" id="dev-${k}"><div class="row"><b>${n}</b><span class="sp"></span><span class="fine">${sub}</span></div><div class="devviz">${VIZ[k]}<canvas></canvas></div>
  <div class="row"><span class="out" id="out-${k}"><span class="muted" style="font-size:14px">—</span></span><span class="sp"></span><button class="btn pri sm" data-act="measure" data-k="${k}">${L('Medir', 'Measure')}</button></div><div class="fine" style="margin-top:6px">${how}</div></div>`;
}
function measureDevice(k) {
  const card = $('#dev-' + k), cv = $('canvas', card), out = $('#out-' + k), btn = $('button', card), v = x => val(x)?.value;
  btn.disabled = true; S.lock = true;
  card.classList.remove('done'); card.classList.add('run');
  const tick = (p, b) => { card.style.setProperty('--p', p.toFixed(3)); if (b != null) card.style.setProperty('--b', b.toFixed(3)); };
  const finish = async (label, items, text) => {
    card.classList.remove('run'); card.classList.add('done'); card.style.setProperty('--b', 0);
    S.lock = false; btn.disabled = false; btn.textContent = L('Medir de novo', 'Measure again');
    try { await A.post('/api/tablet/measurements', { label, items }); toast(`✓ ${esc(text)} ${L('guardado, na fila para a Terra', 'saved, queued for Earth')}`, '', screen); refresh(); }
    catch (e) { toast(L('Erro ao guardar: ', 'Error saving: ') + esc(e.message), 'warn', screen); }
  };
  if (k === 'bp') Sensors.cuff({ canvas: cv, out, base: { sys: v('bp_sys') || 116, dia: v('bp_dia') || 75, hr: v('heart_rate') || 66 }, onTick: (p, osc) => tick(p, Math.min(1, osc / 3)),
    onDone: r => finish('Tensão arterial', [{ indicator: 'bp_sys', value: r.sys, method: 'oscilométrico', device: 'Medidor de braço de bordo' }, { indicator: 'bp_dia', value: r.dia, method: 'oscilométrico', device: 'Medidor de braço de bordo' }], `${L('Tensão', 'BP')} ${r.sys}/${r.dia} mmHg`) });
  if (k === 'spo2') Sensors.oximeter({ canvas: cv, out, base: { spo2: v('spo2') || 98, hr: v('heart_rate') || 66 }, onTick: tick,
    onDone: r => finish('Oximetria', [{ indicator: 'spo2', value: r.spo2, method: 'oxímetro de dedo', device: 'Oxímetro de bordo' }], `SpO₂ ${r.spo2} %`) });
  if (k === 'temp') { const t = Math.round(rand(36.4, 36.9) * 10) / 10; Sensors.countdown({ canvas: cv, out, seconds: 3, from: 34.5, final: t, unit: '°C', decimals: 1, onTick: tick,
    onDone: r => finish('Temperatura', [{ indicator: 'temperature', value: r, method: 'timpânico', device: 'Termómetro de bordo' }], `${L('Temperatura', 'Temperature')} ${f1(r)} °C`) }); }
  if (k === 'grip') { const gb = v('grip_kg') || 35; Sensors.grip({ canvas: cv, out, base: gb, onTick: tick,
    onDone: r => finish('Força de preensão', [{ indicator: 'grip_kg', value: r, method: 'dinamómetro de mão', device: 'Dinamómetro de bordo' }], `${L('Força', 'Grip')} ${f1(r)} kg`) }); }
  if (k === 'glu') { const g = Math.round(rand(84, 101)); Sensors.countdown({ canvas: cv, out, seconds: 5, from: 0, final: g, unit: 'mg/dL', decimals: 0, onTick: tick,
    onDone: r => finish('Glicemia', [{ indicator: 'glucose', value: r, method: 'capilar', device: 'Glicómetro de bordo' }], `${L('Glicemia', 'Glucose')} ${r} mg/dL`) }); }
}

/* --- check-up --- */
VIEWS.checkup = () => {
  const steps = [L('Coração', 'Heart'), L('Tremor', 'Tremor'), L('Reacção', 'Reaction'), L('Sono e humor', 'Sleep and mood'), L('Resultado', 'Result')];
  return `<div class="row"><h1>${L('Check-up da manhã', 'Morning check-up')}</h1><span class="sp"></span><span class="tag live">${L('Passo', 'Step')} ${Math.min(S.ck.step + 1, 5)} ${L('de', 'of')} 5, ${steps[S.ck.step]}</span></div>
  <div class="steps">${steps.map((s, i) => `<span class="${i <= S.ck.step ? 'on' : ''}"></span>`).join('')}</div><div id="ckBody"></div>`;
};
function mountCheckup() {
  const b = $('#ckBody'), ck = S.ck, base = S.sum.baseline, v = x => val(x)?.value;
  if (ck.step === 0) {
    b.innerHTML = `<div class="row" style="align-items:stretch;gap:18px"><div class="instr" style="flex:1"><canvas id="ppg" style="height:190px"></canvas>
      <div class="readout"><div><div class="lab">${L('Frequência cardíaca', 'Heart rate')}</div><div class="row" style="gap:10px"><span id="rBeat"></span><div class="big" id="rHr">--</div></div></div><div><div class="lab">${L('Respiração', 'Breathing')}</div><div class="mid" id="rResp">--</div></div>
      <div><div class="lab">${L('Qualidade do sinal', 'Signal quality')}</div><div class="mid" id="rQ">--</div></div></div></div>
      <div style="width:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">
       <div class="hold" id="hold"><svg viewBox="0 0 154 154"><circle cx="77" cy="77" r="70" fill="none" stroke="#FF5F5F" stroke-width="5" stroke-linecap="round" stroke-dasharray="440" stroke-dashoffset="440" id="ring"/></svg><span id="holdTxt">${L('Mantenha premido<br><b>dedo na lente</b>', 'Press and hold<br><b>finger on lens</b>')}</span></div>
       <div class="fine" style="text-align:center">${L('Câmara traseira + flash, 15 s, se o dedo sair, a medição é recusada.', 'Rear camera + flash, 15 s; if your finger slips, the reading is rejected.')}</div></div></div>
     <p class="fine"><b>${L('Porquê esta medição?', 'Why this measurement?')}</b> ${L(`Sem gravidade o coração adapta-se e pode perder condição. Comparamos sempre consigo próprio (linha de base ${f0(base.heart_rate)} bpm).`, `Without gravity the heart adapts and can lose conditioning. We always compare you with yourself (baseline ${f0(base.heart_rate)} bpm).`)} PPG v0.1</p>
     <div class="row"><span class="sp"></span><button class="btn pri" id="next" data-act="cknext" disabled>${L('Seguinte', 'Next')}</button></div>`;
    S.lock = true;
    Sensors.ppg({ canvas: $('#ppg'), button: $('#hold'), ring: $('#ring'), targetHr: v('heart_rate') || base.heart_rate || 66,
      onUpdate: u => { if (u.hr) { if (!$('#rBeat').innerHTML) $('#rBeat').innerHTML = heartBeat(u.hr); $('#rHr').className = 'big'; $('#rHr').textContent = u.hr; $('#rResp').textContent = u.resp + ' rpm'; $('#rQ').innerHTML = `<span class="${u.good ? 'ok' : 'warn'}">${u.quality}</span>`; } else { $('#rHr').textContent = '…'; $('#rQ').textContent = L('a procurar sinal', 'searching for signal'); } },
      onFail: why => { $('#rHr').className = 'big no'; $('#rHr').textContent = L('Sem número', 'No reading'); $('#rQ').innerHTML = `<span class="warn">${L('Fraca', 'Weak')}</span>`; $('#holdTxt').innerHTML = L('Repetir<br>medição', 'Repeat<br>reading'); toast(why, 'warn', screen); },
      onDone: r => { ck.ppg = r; $('#rHr').textContent = r.hr; $('#holdTxt').innerHTML = '✓ ' + L('Medido', 'Measured'); $('#next').disabled = false; } });
  } else if (ck.step === 1) {
    b.innerHTML = `<p class="muted" style="margin:0 0 10px">${L('Estenda o braço com o tablet na palma da mão direita e mantenha-o parado durante 10 s.', 'Stretch out your arm with the tablet on your right palm and keep it still for 10 s.')}</p>
     <div class="instr"><canvas id="trem" style="height:230px"></canvas><div class="readout"><div><div class="lab">${L('Eixos', 'Axes')}</div><div class="mid"><span style="color:#3DD68C">X</span>, <span style="color:#6CC4FF">Y</span>, <span style="color:#F7B538">Z</span></div></div>
     <div><div class="lab">${L('Fonte', 'Source')}</div><div class="mid" id="tSrc">—</div></div><div><div class="lab">${L('Resultado', 'Result')}</div><div class="mid" id="tRes">${L('a medir…', 'measuring…')}</div></div></div></div>
     <p class="fine">${L('O teste mede desempenho e assinala mudanças. Não serve para diagnosticar doenças.', 'The test measures performance and flags changes. It does not diagnose disease.')}</p>
     <div class="row"><span class="sp"></span><button class="btn pri" id="next" data-act="cknext" disabled>${L('Seguinte', 'Next')}</button></div>`;
    S.lock = true;
    const start = () => Sensors.tremor({ canvas: $('#trem'), onUpdate: u => { $('#tSrc').textContent = u.real ? L('acelerómetro do tablet', 'tablet accelerometer') : L('sinal de demonstração', 'demo signal'); },
      onDone: r => { ck.tremor = r; $('#tRes').innerHTML = `${f1(r.hz)} Hz, ${L('amplitude', 'amplitude')} ${r.amp} mg, <span class="ok">${LEVEL.ok}, ${L('sem desvio', 'no deviation')}</span>`; $('#next').disabled = false; } });
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().finally(start); else start();
  } else if (ck.step === 2) {
    ck.r = { times: [], lit: false };
    b.innerHTML = `<p class="muted" style="margin:0 0 10px">${L('Toque no círculo assim que ele acender, 8 vezes. Mostra o efeito do cansaço na atenção.', 'Tap the circle as soon as it lights up, 8 times. It shows the effect of fatigue on attention.')}</p>
     <div class="react" id="rArea"><div class="msgr" id="rMsg">${L('Toque para começar', 'Tap to start')}</div><div class="dot" id="rDot"></div><div class="prog">${'<i></i>'.repeat(8)}</div></div>
     <div class="row" style="margin-top:12px"><span class="fine" id="rRes">${L('Linha de base', 'Baseline')}: ${f0(base.reaction_ms)} ms</span><span class="sp"></span><button class="btn pri" id="next" data-act="cknext" disabled>${L('Seguinte', 'Next')}</button></div>`;
    S.lock = true;
  } else if (ck.step === 3) {
    ck.sleep = ck.sleep ?? (v('sleep_h') || 7); ck.mood = ck.mood ?? null;
    b.innerHTML = `<div class="grid2"><div class="card"><h3>${L('Quantas horas dormiu?', 'How many hours did you sleep?')}</h3><div class="stepper"><button data-act="slp" data-d="-0.5">−</button><span class="v" id="slv">${f1(ck.sleep)} h</span><button data-act="slp" data-d="0.5">+</button></div><p class="fine">${L('Linha de base', 'Baseline')}: ${f1(base.sleep_h)} h</p></div>
     <div class="card"><h3>${L('Como se sente hoje?', 'How do you feel today?')}</h3><div class="moods">${MOODS.map(m => `<button data-act="mood" data-m="${m}" class="${ck.mood === m ? 'on' : ''}">${tr(m)}</button>`).join('')}</div>
      <h3 style="margin-top:16px">${L('Nível de stress', 'Stress level')}</h3><div class="moods" id="stressBtns">${STRESS.map((m, i) => `<button data-act="stress" data-v="${i + 1}" class="${ck.stress === i + 1 ? 'on' : ''}">${tr(m)}</button>`).join('')}</div></div></div>
     <p class="fine">${L('Sono, humor e stress acompanham o perigo <b>Isolamento e confinamento</b>.', 'Sleep, mood and stress track the <b>Isolation and confinement</b> hazard.')}</p>
     <div class="row"><span class="sp"></span><button class="btn pri" id="fin" data-act="ckfinish" ${ck.mood && ck.stress ? '' : 'disabled'}>${L('Concluir check-up', 'Finish check-up')}</button></div>`;
  } else {
    const R = ck.result;
    b.innerHTML = `<div class="card res">${R.map(it => `<div class="it"><span class="lvl ${it.st}" style="min-width:96px">${LEVEL[it.st]}</span><b style="min-width:120px">${it.n}</b><span class="v">${it.v}</span><span class="fine">${it.c}</span></div>`).join('')}</div>
     <div class="msg" style="margin-top:12px"><b>✓ ${L('Guardado no tablet', 'Saved on the tablet')}</b>, ${L('na fila para a Terra.', 'queued for Earth.')} ${S.sum.mission.link_open ? L(`Chega em ${fmtDelay(S.sum.mission.delay_s)}.`, `Arrives in ${fmtDelay(S.sum.mission.delay_s)}.`) : L('Ligação cortada: segue quando a ligação voltar.', 'Link cut: goes out when the link returns.')}</div>
     <div class="row"><span class="sp"></span><button class="btn" data-act="nav" data-tab="evolucao">${L('Ver evolução', 'See trends')}</button><button class="btn pri" data-act="nav" data-tab="hoje">${L('Voltar a Hoje', 'Back to Today')}</button></div>`;
  }
}
function reactTap() {
  const r = S.ck.r; if (!r || r.times.length >= 8) return;
  const dot = $('#rDot'), msg = $('#rMsg');
  const arm = () => { r.timer = setTimeout(() => { r.lit = true; r.t0 = performance.now(); dot.classList.add('lit'); }, rand(800, 2200)); };
  if (!r.started) { r.started = true; msg.textContent = L('Espere pelo círculo…', 'Wait for the circle…'); arm(); return; }
  if (r.lit) {
    const dt = performance.now() - r.t0; r.times.push(dt); r.lit = false; dot.classList.remove('lit');
    $$('#rArea .prog i')[r.times.length - 1].classList.add('f'); msg.textContent = Math.round(dt) + ' ms';
    if (r.times.length < 8) arm(); else {
      const m = r.times.reduce((a, b) => a + b, 0) / 8, sd = Math.sqrt(r.times.reduce((a, b) => a + (b - m) ** 2, 0) / 8);
      S.ck.react = { ms: Math.round(m), sd: Math.round(sd) };
      const b = S.sum.baseline.reaction_ms, pct = Math.round((m - b) / b * 100), out = Math.abs(m - b) > 12;
      msg.innerHTML = `${L('Média', 'Average')} <b>${Math.round(m)} ms</b> ± ${Math.round(sd)}`;
      $('#rRes').innerHTML = `<span class="${out ? 'warn' : 'ok'}">${out ? `${LEVEL.warn}, ${Math.abs(pct)}% ${pct > 0 ? L('mais lento', 'slower') : L('mais rápido', 'faster')}` : `${LEVEL.ok}, ${L('na linha de base', 'at baseline')}`}</span>, ${L('linha de base', 'baseline')} ${f0(b)} ms`;
      $('#next').disabled = false;
    }
  } else { clearTimeout(r.timer); msg.innerHTML = `<span class="warn">${L('Cedo demais, espere que acenda', 'Too early, wait for it to light up')}</span>`; arm(); }
}
async function finishCheckup() {
  const ck = S.ck, items = [];
  const add = (indicator, value, method, extra = {}) => items.push({ indicator, value, method, device: 'Tablet ASTRA', ...extra });
  if (ck.ppg) { add('heart_rate', ck.ppg.hr, 'câmara + flash (PPG)'); add('hrv_ms', ck.ppg.hrv, 'câmara + flash (PPG)'); add('resp_rate', ck.ppg.resp, 'câmara + flash (PPG)'); }
  if (ck.tremor) { add('tremor_hz', ck.tremor.hz, ck.tremor.real ? 'acelerómetro' : 'acelerómetro (demo)'); add('tremor_amp', ck.tremor.amp, 'acelerómetro'); }
  if (ck.react) { add('reaction_ms', ck.react.ms, 'ecrã táctil'); add('reaction_sd', ck.react.sd, 'ecrã táctil'); }
  add('sleep_h', ck.sleep, 'registo diário'); items.push({ indicator: 'mood', text: ck.mood, method: 'registo diário' });
  add('stress', ck.stress, 'registo diário');
  try {
    const r = await A.post('/api/tablet/measurements', { label: 'Check-up da manhã', items });
    const I = r.eval.indicators, line = (n, k, v, u) => ({ n, v: v + ' ' + u, st: I[k]?.out ? 'warn' : 'ok', c: I[k] ? (I[k].out ? `${I[k].pct > 0 ? '+' : ''}${I[k].pct}% ${L('vs linha de base', 'vs baseline')}` : L('na linha de base', 'at baseline')) : '' });
    ck.result = [ck.ppg && line(L('Coração', 'Heart'), 'heart_rate', ck.ppg.hr, 'bpm'), ck.tremor && { n: 'Tremor', v: f1(ck.tremor.hz) + ' Hz', st: 'ok', c: L('sem desvio', 'no deviation') },
      ck.react && line(L('Reacção', 'Reaction'), 'reaction_ms', ck.react.ms, 'ms'), line(L('Sono', 'Sleep'), 'sleep_h', f1(ck.sleep), 'h'),
      { n: L('Humor', 'Mood'), v: tr(ck.mood), st: ['Mal', 'Muito mal'].includes(ck.mood) ? 'warn' : 'ok', c: '' },
      { n: 'Stress', v: tr(STRESS[ck.stress - 1]), st: ck.stress >= 3 ? 'warn' : 'ok', c: '' }].filter(Boolean);
    ck.step = 4; S.lock = false; render(); refresh();
  } catch (e) { toast(L('Erro: ', 'Error: ') + esc(e.message), 'warn', screen); }
}

/* ---------- alerta crítico e instruções urgentes ---------- */
function checkAlert(d) {
  const a = d.alerts.find(x => !x.acks[d.person.id]) || (ov.dataset.alert && d.alerts.find(x => x.id === ov.dataset.alert));
  if (!a) { if (ov.dataset.alert) { ov.className = 'overlay'; ov.dataset.alert = ''; } return; }
  const mine = a.acks[d.person.id], all = a.crew.every(c => a.acks[c.id]);
  if (mine && all) { setTimeout(() => { ov.className = 'overlay'; ov.dataset.alert = ''; }, 1500); }
  ov.className = 'overlay show'; ov.dataset.alert = a.id;
  ov.innerHTML = `<div class="alertfull"><div style="flex:1"><span style="font-weight:600;letter-spacing:.02em">${L('Alerta crítico', 'Critical alert')}, ${a.person.code} ${esc(a.person.name)}</span>
   <h1>${esc(tr((a.rule.split(':')[1] || a.rule).trim()).replace(/^./, c => c.toUpperCase()))}, ${L('coração', 'heart')} ${a.values.heart_rate} bpm</h1>
   <ol>${L('<li><b>Pare e prenda-se a um apoio.</b></li><li><b>Avise a tripulação</b> — o alerta toca em todos os tablets.</li><li><b>O alerta já seguiu para a Terra</b>, à frente de tudo na fila.</li>', '<li><b>Stop and secure yourself to a handhold.</b></li><li><b>Warn the crew</b> — the alert sounds on every tablet.</li><li><b>The alert has already gone to Earth</b>, ahead of everything in the queue.</li>')}</ol>
   <p class="fine" style="color:#fff;opacity:.85;margin-top:14px">${L(`Disparado pelas regras fixas de segurança (${esc(a.rule.split(':')[0].trim())}), não pela IA. A IA não consegue desligar este alerta.`, `Triggered by the fixed safety rules (${esc(a.rule.split(':')[0].trim())}), not by the AI. The AI cannot switch this alert off.`)}</p>
   ${mine ? `<b>${L('Confirmou.', 'Acknowledged.')}</b>` : `<button class="btn critb" data-act="aack" data-id="${a.id}" style="margin-top:12px;min-height:52px;font-size:16px">${L('Confirmei, vi o alerta', 'Acknowledged, I saw the alert')}</button>`}</div>
   <div class="acks"><b>${L('Confirmações', 'Acknowledgements')}</b>${a.crew.map(c => `<div><span>${c.code}, ${esc(c.first_name)}</span>${a.acks[c.id] ? `<span>${L('confirmou', 'acknowledged')}</span>` : `<span style="opacity:.75">${L('a aguardar', 'waiting')}</span>`}</div>`).join('')}${all ? `<p style="color:#fff;margin:8px 0 0">${L('Todos confirmaram.', 'Everyone acknowledged.')}</p>` : ''}</div></div>`;
}
function urgent(m) {
  if (ov.dataset.alert || S.dismissed.has(m.id)) return;
  ov.className = 'overlay show';
  ov.innerHTML = `<div class="sheet"><span class="tag warn">${L('Urgente', 'Urgent')}</span><h2 style="margin:12px 0">${L('Instrução da Dra. Inês Matola', 'Instruction from Dr. Inês Matola')}</h2>
   <p style="font-size:16px">${esc(m.text)}</p><div class="row"><span class="sp"></span><button class="btn" data-act="later" data-id="${m.id}">${L('Mais tarde', 'Later')}</button><button class="btn warnb" data-act="ack" data-id="${m.id}">${L('Confirmar que li', 'Acknowledge')}</button></div></div>`;
}

/* ---------- eventos ---------- */
screen.addEventListener('click', async e => {
  if (e.target.closest('#rArea')) { reactTap(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  try {
    switch (a) {
      case 'pick': S.pinPick = +b.dataset.id; S.pin = ''; render(); break;
      case 'pinback': S.pinPick = null; render(); break;
      case 'key': {
        const k = b.dataset.k; if (k === '⌫') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += k; render();
        if (S.pin.length === 4) {
          try { const r = await A.post('/api/auth/pin', { person_id: S.pinPick, pin: S.pin }); A.setToken(r.token); S.pinPick = null; S.pin = ''; S.tab = 'hoje'; S.seenMsg = null; await refresh(true); }
          catch (err) { S.pin = ''; render(); $('#pdots').classList.add('err'); $('#pinmsg').innerHTML = `<span class="crit">${L('PIN incorrecto. Tente de novo.', 'Wrong PIN. Try again.')}</span>`; }
        }
        break;
      }
      case 'logout': try { await A.post('/api/auth/logout'); } catch (er) {} A.setToken(null); S.sum = null; ov.className = 'overlay'; render(); break;
      case 'nav': if (b.dataset.tab === 'checkup') S.ck = { step: 0 }; S.lock = false; S.tab = b.dataset.tab; render(); break;
      case 'haz': S.haz = b.dataset.k; S.tab = 'perigos'; render(); break;
      case 'evo': S.evo = b.dataset.k; render(); break;
      case 'explain': { const r = await A.get('/api/tablet/explain/' + b.dataset.k); $('#explain').innerHTML = `<div class="msg dash"><div class="meta">${esc(r.label)}</div><p>${esc(r.text)}</p></div>`; break; }
      case 'ack': await A.post(`/api/tablet/messages/${b.dataset.id}/ack`); ov.className = 'overlay'; toast('✓ ' + L('Confirmação enviada para a Terra', 'Acknowledgement sent to Earth'), '', screen); refresh(true); break;
      case 'later': S.dismissed.add(b.dataset.id); ov.className = 'overlay'; break;
      case 'reply': S.replyTo = b.dataset.id; S.tab = 'mensagens'; render(); $('#txText').focus(); break;
      case 'noreply': S.replyTo = null; render(); break;
      case 'txchip': $('#txText').value = b.dataset.t; $('#txText').focus(); break;
      case 'send': {
        const text = $('#txText').value.trim(); if (!text) { $('#txText').focus(); return; }
        const r = await A.post('/api/tablet/messages', { text, reply_to: S.replyTo });
        S.replyTo = null; $('#txText').value = ''; $('#txText').blur();
        toast(`${L('Mensagem', 'Message')} ${r.id} ${L('enviada', 'sent')}, ${r.arrives ? L('chega à Terra em ', 'reaches Earth in ') + fmtDelay(S.sum.mission.delay_s) : L('retida (ligação cortada)', 'held (link cut)')}`, '', screen); refresh(true); break;
      }
      case 'measure': measureDevice(b.dataset.k); break;
      case 'exdev': S.exDev = b.dataset.v; $$('#exDev button').forEach(x => x.classList.toggle('on', x === b)); $('#exViz svg').outerHTML = EXVIZ[S.exDev]; break;
      case 'exmin': S.exMin = Math.max(5, Math.min(120, (S.exMin || 45) + +b.dataset.d)); $('#exv').textContent = S.exMin + ' min'; break;
      case 'exsave': { const dv = S.exDev || 'ARED', mn = S.exMin || 45;
        await A.post('/api/tablet/measurements', { label: `Exercício ${dv}`, items: [{ indicator: 'exercise_min', value: mn, method: dv, device: dv }] });
        toast(`✓ ${mn} min ${L('de', 'of')} ${dv} ${L('registados', 'logged')}`, '', screen); refresh(true); break; }
      case 'chip': { const ta = $('#trText'); ta.value = (ta.value ? ta.value.replace(/\.?\s*$/, '. ') : '') + b.dataset.t; S.tri.text = ta.value; break; }
      case 'analyse': {
        S.tri.text = $('#trText').value.trim(); if (!S.tri.text) { $('#trText').focus(); return; }
        S.tri.stage = 'thinking'; S.lock = true; render();
        const [sum] = await Promise.all([A.post('/api/tablet/triage/summary', { text: S.tri.text }), new Promise(r => setTimeout(r, 900))]);
        S.tri.sum = sum; S.tri.stage = 'confirm'; render(); break;
      }
      case 'tredit': S.tri.stage = 'write'; S.lock = false; render(); break;
      case 'trnew': S.tri = { stage: 'write', text: '' }; S.lock = false; render(); break;
      case 'trconfirm': {
        const r = await A.post('/api/tablet/triage', { text: S.tri.text });
        S.tri.result = { ...r, at: new Date().toISOString() }; S.tri.stage = 'done'; S.lock = false; await refresh(true); break;
      }
      case 'slp': S.ck.sleep = Math.max(0, Math.min(12, S.ck.sleep + +b.dataset.d)); $('#slv').textContent = f1(S.ck.sleep) + ' h'; break;
      case 'mood': S.ck.mood = b.dataset.m; $$('[data-act=mood]').forEach(x => x.classList.toggle('on', x === b)); $('#fin').disabled = !(S.ck.mood && S.ck.stress); break;
      case 'stress': S.ck.stress = +b.dataset.v; $$('[data-act=stress]').forEach(x => x.classList.toggle('on', x === b)); $('#fin').disabled = !(S.ck.mood && S.ck.stress); break;
      case 'cknext': S.ck.step++; render(); break;
      case 'ckfinish': await finishCheckup(); break;
      case 'aack': await A.post(`/api/tablet/alerts/${b.dataset.id}/ack`); refresh(true); break;
    }
  } catch (err) { toast(L('Erro: ', 'Error: ') + esc(err.message), 'warn', screen); }
});
screen.addEventListener('input', e => { if (e.target.id === 'trText') S.tri.text = e.target.value; });

/* ---------- idioma: redesenha, excepto a meio de uma medição ---------- */
onLang(() => { renderStatus(); renderRail(); if (!S.lock) render(); if (S.sum) checkAlert(S.sum); });

/* ---------- arranque ---------- */
(async () => {
  applyLang();
  try { S.crew = await A.get('/api/auth/crew'); S.HAZ = await A.get('/api/hazards'); } catch (e) {}
  await refresh(true); render();
  setInterval(refresh, 2000);
})();
