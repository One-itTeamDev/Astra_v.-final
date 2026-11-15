/* ASTRA — idioma (pt / en).
 * L('texto pt', 'text en') escolhe pelo idioma activo.
 * tr(s) traduz frases que vêm do servidor (sempre em português).
 * HTML estático: <x data-en="English">Português</x>; data-en-ph / data-en-title para placeholder e title.
 */
let LANG = 'pt';
try { LANG = localStorage.getItem('astra-lang') || ((navigator.language || '').startsWith('pt') ? 'pt' : 'en'); } catch (e) {}
const L = (pt, en) => (LANG === 'en' ? en : pt);
const LOCALE = () => (LANG === 'en' ? 'en-GB' : 'pt-PT');
const langHooks = [];
function setLang(l) {
  LANG = l === 'en' ? 'en' : 'pt';
  try { localStorage.setItem('astra-lang', LANG); } catch (e) {}
  applyLang();
  langHooks.forEach(f => f(LANG));
}
const onLang = f => langHooks.push(f);
function applyLang(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll('[data-en]').forEach(e => {
    if (e.dataset.pt == null) e.dataset.pt = e.innerHTML;
    e.innerHTML = LANG === 'en' ? e.dataset.en : e.dataset.pt;
  });
  root.querySelectorAll('[data-en-ph]').forEach(e => {
    if (e.dataset.ptPh == null) e.dataset.ptPh = e.placeholder;
    e.placeholder = LANG === 'en' ? e.dataset.enPh : e.dataset.ptPh;
  });
  root.querySelectorAll('[data-en-title]').forEach(e => {
    if (e.dataset.ptTitle == null) e.dataset.ptTitle = document.title;
    document.title = LANG === 'en' ? e.dataset.enTitle : e.dataset.ptTitle;
  });
  root.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
}
const langToggle = () => `<div class="lang" role="group" aria-label="Idioma / Language"><button type="button" data-lang="pt" class="${LANG === 'pt' ? 'on' : ''}">PT</button><button type="button" data-lang="en" class="${LANG === 'en' ? 'on' : ''}">EN</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('.lang [data-lang]'); if (b) { e.stopPropagation(); setLang(b.dataset.lang); } }, true);

/* Frases do servidor. EXACT: a string inteira; PHRASE: partes dentro de frases maiores (as mais longas primeiro). */
const TR_EXACT = {
  'Verde': 'Green', 'Atenção': 'Attention', 'Crítico': 'Critical',
  'Muito mal': 'Very bad', 'Mal': 'Bad', 'Normal': 'Normal', 'Bem': 'Good', 'Muito bem': 'Very good',
  'Baixo': 'Low', 'Moderado': 'Moderate', 'Alto': 'High', 'Muito alto': 'Very high',
  'Órbita baixa': 'Low Earth orbit', 'Lua': 'Moon', 'Marte': 'Mars', 'LUA': 'MOON', 'MARTE': 'MARS',
  'aberta': 'open', 'cortada': 'cut', 'forte': 'strong', 'ligeira': 'mild', 'moderada': 'moderate',
  'Humor': 'Mood', 'Sono': 'Sleep', 'Ligação': 'Link', 'Atraso': 'Delay', 'Tremor': 'Tremor',
  'Bordo': 'Ship', 'Terra': 'Earth', 'Sistema': 'System',
};
const TR_PHRASE = [
  ['Tempestade de radiação em curso', 'Radiation storm in progress'], [', ir para o abrigo', ', go to the shelter'], [', no abrigo', ', in the shelter'],
  ['Fundo de raios cósmicos', 'Cosmic-ray background'], ['Sem sinais de desgaste', 'No signs of strain'],
  ['Sem ligação: a nave decide sozinha', 'No link: the ship decides on its own'], ['Fila longa', 'Long queue'],
  ['Comunicação a funcionar', 'Communication working'], ['Contramedidas em dia', 'Countermeasures on track'],
  ['Cabine dentro dos limites', 'Cabin within limits'], ['fora da faixa', 'out of range'], ['sem check-up há', 'no check-up for'],
  ['humor em baixo', 'low mood'], ['stress alto', 'high stress'], ['pouco exercício', 'little exercise'],
  ['Radiação espacial', 'Space radiation'], ['Isolamento e confinamento', 'Isolation and confinement'], ['Distância da Terra', 'Distance from Earth'],
  ['Gravidade alterada', 'Altered gravity'], ['Ambientes fechados e hostis', 'Hostile and closed environments'],
  ['Protões ≥10 MeV', 'Protons ≥10 MeV'], ['Taxa de dose', 'Dose rate'], ['Dose acumulada', 'Cumulative dose'],
  ['Fila para a Terra', 'Queue to Earth'], ['Decisões a bordo sem resposta', 'On-board decisions awaiting reply'],
  ['Último contacto da Terra', 'Last contact from Earth'], ['Exercício (24 h)', 'Exercise (24 h)'], ['Força de preensão', 'Grip strength'],
  ['(limite 3)', '(limit 3)'], ['pacotes', 'packets'], ['(base ', '(baseline '],
  ['Abrigo de tempestade', 'Storm shelter'], ['Quartos da tripulação', 'Crew quarters'], ['laboratório', 'laboratory'],
  ['vista geral', 'overview'], ['módulo da tripulação', 'crew module'], ['Exterior, Terra', 'Exterior, Earth'],
  ['Cúpula, observação', 'Cupola, observation'], ['Nó ', 'Node '],
  ['Engenheiro de voo', 'Flight engineer'], ['Especialista de missão', 'Mission specialist'], ['Geólogo planetário', 'Planetary geologist'],
  ['Cirurgiã de voo', 'Flight surgeon'], ['Comandante', 'Commander'],
  ['coração muito acima da linha de base', 'heart rate far above baseline'], ['coração muito abaixo da linha de base', 'heart rate far below baseline'],
  ['perda de visão', 'vision loss'], ['dor no peito', 'chest pain'], ['falta de ar', 'shortness of breath'], ['confusão', 'confusion'], ['desmaio', 'fainting'],
  ['Mal-estar geral', 'General malaise'], ['Dor de cabeça', 'Headache'], ['Visão alterada', 'Vision changes'], ['Náusea', 'Nausea'], ['Tonturas', 'Dizziness'],
  ['Cansaço', 'Fatigue'], ['Sono fraco', 'Poor sleep'], ['Dor lombar', 'Lower back pain'], ['Congestão nasal', 'Nasal congestion'],
  ['Humor em baixo', 'Low mood'], ['Sensação de febre', 'Feeling feverish'], ['Dor muscular', 'Muscle pain'], ['Irritação da pele', 'Skin irritation'],
  ['desde que acordou', 'since waking up'], ['desde ontem', 'since yesterday'], ['há vários dias', 'for several days'], ['começou agora', 'started just now'], ['não indicado', 'not stated'],
  ['menos de 1 s', 'less than 1 s'], ['sintomas', 'symptoms'], ['Temperatura', 'Temperature'], ['Humidade', 'Humidity'], ['Pressão', 'Pressure'],
  // fila de pacotes e registo de eventos
  ['ALERTA CRÍTICO', 'CRITICAL ALERT'], ['Alerta crítico', 'Critical alert'], ['a tocar em todos os tablets', 'sounding on every tablet'],
  ['confirmou o alerta', 'acknowledged alert'], ['confirmou a instrução', 'acknowledged instruction'], ['confirmou', 'acknowledged'],
  ['Encerrar alerta', 'Close alert'], ['encerrou o alerta', 'closed alert'], ['encerrado a bordo pela decisão da Terra', 'closed on board by Earth decision'],
  ['Decisão sobre', 'Decision on'], ['decidiu', 'decided'], ['Instrução', 'Instruction'], ['para a Terra', 'to Earth'], ['Mensagem de', 'Message from'],
  ['enviou a mensagem', 'sent message'], ['enviou', 'sent'], ['registou a queixa', 'logged complaint'], ['nível provisório', 'provisional level'], ['registou', 'logged'],
  ['valores, pacote', 'values, packet'], ['entrou no tablet', 'signed in to the tablet'], ['entrou na consola de missão', 'signed in to the mission console'],
  ['saiu da sessão', 'signed out'], ['Tentativa de login falhada na consola', 'Failed console login attempt'], ['Distância definida', 'Distance set'],
  ['Modo demonstração ligado (atraso ÷60)', 'Demo mode on (delay ÷60)'], ['Modo demonstração desligado (atraso real)', 'Demo mode off (real delay)'],
  ['Ligação Terra–nave reaberta, a fila retoma', 'Earth–ship link reopened, queue resumes'], ['Ligação Terra–nave CORTADA', 'Earth–ship link CUT'],
  ['Acesso permitido', 'Access allowed'], ['dados de', 'data of'], ['Reprodução de um evento SEP (perfil tipo', 'Replay of an SEP event (profile like'], ['durante', 'for'],
  ['Removedor de CO₂ (CDRA) em falha simulada, CO₂ da cabine a subir', 'CO₂ scrubber (CDRA) in simulated failure, cabin CO₂ rising'],
  ['Triagem', 'Triage'], ['Check-up da manhã', 'Morning check-up'], ['Tensão arterial', 'Blood pressure'], ['Oximetria', 'Oximetry'], ['Glicemia', 'Glucose'],
  ['Exercício', 'Exercise'], ['(atraso', '(delay'], ['toda a tripulação', 'the whole crew'], ['tripulação', 'crew'], ['Marte', 'Mars'], ['Lua', 'Moon'], ['urgente', 'urgent'], ['ao vivo', 'live'], ['reprodução', 'replay'], ['para ', 'to '], ['Verde', 'Green'], ['Atenção', 'Attention'], ['Crítico', 'Critical'],
  ['coração', 'heart'], ['reacção', 'reaction'], ['força', 'strength'], ['humor', 'mood'], ['sono', 'sleep'], [' de ', ' of '],
].sort((a, b) => b[0].length - a[0].length);
// (?<!\p{L}): não apanhar o meio de outra palavra
const TR_RE = TR_PHRASE.map(([p, e]) => [new RegExp('(?<!\\p{L})' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), e]);
function tr(s) {
  if (LANG !== 'en' || s == null) return s;
  s = String(s);
  if (TR_EXACT[s]) return TR_EXACT[s];
  let out = s;
  const up = c => c === c.toUpperCase() && c !== c.toLowerCase();
  // segue a maiúscula do original; frases todas em maiúsculas (ALERTA…) e siglas (CO₂) ficam como estão
  for (const [re, e] of TR_RE) out = out.replace(re, m => (up(m[0]) ? e[0].toUpperCase() + e.slice(1) : up(e[1] || '') ? e : e[0].toLowerCase() + e.slice(1)));
  return out.replace(/(\d),(\d)/g, '$1.$2');
}
/* campo traduzido de um objecto do servidor: name → name_en */
const fld = (o, k) => (LANG === 'en' && o[k + '_en'] != null ? o[k + '_en'] : o[k]);
