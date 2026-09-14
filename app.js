/* =========================================================
   Learning Engine — Learning · Discover · Goals + Ask AI
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- data ---------- */
const RESOURCES = [
  { type:'youtube', by:'Wes Roth', word:'AGENTS', title:'The future of AI agents', meta:'32 min',
    date:'Saved yesterday', progress:44, watched:'14 min watched', done:false, topics:['AI agents'],
    url:'https://www.youtube.com',
    summary:'Where autonomous agents are heading — planning loops, tool use, and the reliability problems that still block real products.',
    covers:['Agent planning loops','Tool use & function calling','Reliability & guardrails','Where agents fail today'] },
  { type:'article', by:'Figma Blog', title:'Designing for AI that people can trust', meta:'8 min read',
    date:'Saved today', done:true, topics:['AI UX','Product design'],
    url:'https://www.figma.com/blog',
    summary:'How to design AI features people actually trust: showing provenance, communicating confidence, and failing gracefully instead of silently.',
    covers:['Provenance & sourcing','Confidence signals in UI','Graceful failure states','Trust as a design outcome'] },
  { type:'substack', by:'Every', title:'What makes an AI product useful?', meta:'6 min',
    date:'Saved yesterday', done:true, topics:['AI strategy','Product'],
    url:'https://every.to',
    summary:'A short argument that AI products win on usefulness, not novelty — and a checklist for telling the two apart.',
    covers:['Usefulness vs novelty','Jobs-to-be-done for AI','Common AI product traps'] },
  { type:'youtube', by:'Hamel Husain', word:'EVAL', title:'A practical introduction to LLM evaluation', meta:'24 min',
    date:'Saved Sep 3', progress:20, watched:'5 min watched', done:false, topics:['AI evaluation'],
    url:'https://www.youtube.com',
    summary:'A hands-on primer on evaluating LLM systems — building eval sets, choosing metrics, and using evals to drive iteration.',
    covers:['Building an eval set','Offline vs online eval','Metrics that matter','Eval-driven iteration'] },
  { type:'pdf', by:'Anthropic', pages:14, title:'Building effective agents', date:'Saved Sep 2', done:true, topics:['AI agents'],
    url:'https://www.anthropic.com',
    summary:'A field guide to agent patterns — when to use workflows vs agents, and the building blocks that hold up in production.',
    covers:['Workflows vs agents','Prompt chaining & routing','Orchestrator patterns','Keeping agents simple'] },
  { type:'article', by:'Linear Blog', title:'The shape of AI-native interfaces', meta:'7 min read',
    date:'Saved Sep 1', done:false, topics:['AI UX'],
    url:'https://linear.app/blog',
    summary:'When the model can act, the interface stops being a form and becomes a structured conversation. What that means for layout, affordances and control.',
    covers:['Conversation with structure','Affordances for model actions','Keeping the user in control','Undo & reversibility'] },
  { type:'substack', by:"Elena's Growth Scoop", title:'Prototyping with AI: a field guide', meta:'9 min',
    date:'Saved Aug 30', done:true, topics:['AI prototyping','Product'],
    url:'https://www.elenaverna.com',
    summary:'A practical guide to prototyping product ideas with AI tools — what to fake, what to build, and how to test faster.',
    covers:['Faking vs building','AI tools for prototypes','Testing loops','Prototype fidelity'] },
  { type:'youtube', by:'Figma', word:'CONFIG', title:'How Figma thinks about AI in design tools', meta:'41 min',
    date:'Saved Aug 28', done:false, topics:['AI UX','Product design'],
    url:'https://www.youtube.com',
    summary:'A Config talk on where AI fits inside a design tool — assisting without taking over, and keeping the designer in the loop.',
    covers:['AI as assistant, not author','Keeping designers in the loop','Surface & timing of suggestions','Design-tool constraints'] },
  { type:'pdf', by:'Nielsen Norman Group', pages:22, title:"A UX researcher's guide to evaluating AI",
    date:'Saved Aug 25', done:false, topics:['AI evaluation','AI UX'],
    url:'https://www.nngroup.com',
    summary:'How UX research methods apply to AI features — designing studies, measuring trust and usefulness, and reporting on model behaviour.',
    covers:['Study design for AI','Measuring trust & usefulness','Qualitative + quantitative','Reporting model behaviour'] },
  { type:'article', by:'Vercel Blog', title:'Agentic workflows in production', meta:'11 min read',
    date:'Saved Aug 22', done:true, topics:['AI agents'],
    url:'https://vercel.com/blog',
    summary:'The unglamorous parts of shipping agents: retries, guardrails, human checkpoints and observability.',
    covers:['Retries & fallbacks','Human checkpoints','Guardrails','Observability for agents'] },
];

const RECS = {
  evaluation: [
    { type:'youtube', by:'Hamel Husain', word:'EVAL', title:'A practical introduction to LLM evaluation', meta:'24 min',
      topics:['AI evaluation'], url:'https://www.youtube.com',
      why:'Straight at the gap — the best place to start.',
      summary:'A hands-on primer on evaluating LLM systems — building eval sets, choosing metrics, and using evals to drive iteration.',
      covers:['Building an eval set','Metrics that matter','Eval-driven iteration'] },
    { type:'pdf', by:'Nielsen Norman Group', pages:22, title:"A UX researcher's guide to evaluating AI", meta:'22 pages',
      topics:['AI evaluation','AI UX'], url:'https://www.nngroup.com',
      why:'Frames evaluation from the design-research angle you already work in.',
      summary:'How UX research methods apply to AI features — designing studies, measuring trust and usefulness.',
      covers:['Study design for AI','Measuring trust','Reporting model behaviour'] },
    { type:'article', by:'Anthropic', title:'Evals are the new PRDs', meta:'9 min read',
      topics:['AI evaluation'], url:'https://www.anthropic.com',
      why:'Argues eval-driven design is how AI products actually ship.',
      summary:'Makes the case that a good eval suite defines the product better than a PRD — and how to write one.',
      covers:['Evals as spec','Writing eval cases','Eval-first workflow'] },
  ],
  emerging: [
    { type:'substack', by:"Lenny's Newsletter", title:'How AI product teams measure quality', meta:'12 min',
      topics:['AI evaluation','Product'], url:'https://www.lennysnewsletter.com',
      why:'Eval-driven design is moving into mainstream PM practice.',
      summary:'How leading AI product teams define and track quality week to week.',
      covers:['Quality metrics','Weekly review rituals','Regression tracking'] },
    { type:'youtube', by:'Anthropic', word:'AGENTS', title:'Building reliable agents: guardrails in practice', meta:'28 min',
      topics:['AI agents'], url:'https://www.youtube.com',
      why:'Agent reliability is the second thread gaining traction in your field.',
      summary:'Practical guardrail patterns for agents — validation, sandboxing and human approval gates.',
      covers:['Input/output validation','Sandboxing tools','Approval gates'] },
  ],
};

const SUGGESTED_GOALS = [
  { title:'AI-native product design', origin:'AI-noticed pattern',
    why:'AI UX, agents and product design keep showing up together across your saves.',
    areas:['AI fundamentals','AI UX','AI agents','AI prototyping','AI evaluation','AI product strategy'] },
  { title:'Evaluation-driven AI practice', origin:'AI-noticed pattern',
    why:'You keep saving pieces that name evaluation as the missing step — but only two are actually about it.',
    areas:['AI evaluation','AI UX','AI agents'] },
  { title:'Shipping reliable agents', origin:'AI-noticed pattern',
    why:'Four of your saves are about agents in production — reliability is the throughline.',
    areas:['AI agents','AI evaluation','AI prototyping'] },
];

/* ---------- helpers ---------- */
const TYPE_LABEL = { youtube:'Video', article:'Article', substack:'Newsletter', pdf:'PDF' };
/* dark = warm (crimson → red → orange → amber → magenta, n8n family) */
const HUE = { 'AI UX':20, 'AI agents':352, 'AI evaluation':34, 'AI prototyping':8,
              'Product design':340, 'AI strategy':26, 'Product':14, 'AI fundamentals':18,
              'AI product strategy':356 };
/* light = cool editorial tints (unchanged) */
const HUE_LIGHT = { 'AI UX':212, 'AI agents':262, 'AI evaluation':30, 'AI prototyping':160,
              'Product design':328, 'AI strategy':244, 'Product':196, 'AI fundamentals':224,
              'AI product strategy':250 };
const TYPE_HUE_SHIFT = { youtube: 10, article: 0, substack: -14, pdf: 6 };
const TYPE_HUE_SHIFT_LIGHT = { youtube: 16, article: 0, substack: 38, pdf: -10 };
const wrap = (n) => ((n % 360) + 360) % 360;
const hueFor = (topics, type) => wrap((HUE[(topics && topics[0])] ?? 12) + (TYPE_HUE_SHIFT[type] || 0));
const hueLightFor = (topics, type) => wrap((HUE_LIGHT[(topics && topics[0])] ?? 220) + (TYPE_HUE_SHIFT_LIGHT[type] || 0));
const shortDate = (d) => (d || '').replace(/^Saved\s+/, '');
const platformName = (r) => r.type === 'youtube' ? 'YouTube' : r.type === 'substack' ? 'Substack' : r.by;
const parseMins = (r) => {
  const m = (r.meta || '').match(/(\d+)\s*min/); if (m) return +m[1];
  if (r.pages) return Math.round(r.pages * 1.4);
  return 0;
};

/* every card object gets registered so a card can open its detail */
const CARD_INDEX = [];
const registerCard = (obj) => { CARD_INDEX.push(obj); return CARD_INDEX.length - 1; };

/* ---------- unified resource card ---------- */
function card(r, { rec = false } = {}){
  const idx = registerCard(r);
  const hue = hueFor(r.topics, r.type);
  const hueL = hueLightFor(r.topics, r.type);
  const cls = ['res-card', `rc-${r.type}`, rec ? 'res-card--rec' : ''].filter(Boolean).join(' ');
  const topic = (r.topics && r.topics[0]) || '';
  const media = r.type === 'youtube'
    ? `<div class="rc-media rc-media--video">
         <span class="rc-ghost">${r.word || (r.by || '').slice(0, 6).toUpperCase()}</span>
         <span class="rc-play" aria-hidden="true">▶</span>
         <span class="rc-dur">${r.meta || ''}</span>
       </div>`
    : `<div class="rc-media rc-media--pattern" data-pat="${idx % 3}" aria-hidden="true"></div>`;

  return `
    <article class="${cls}" data-card="${idx}" data-type="${r.type}" data-topics="${(r.topics || []).join('|')}"
             role="button" tabindex="0" style="--h:${hue};--hl:${hueL}">
      ${media}
      <div class="rc-body">
        <p class="rc-src">${r.by || ''}</p>
        <h3 class="rc-title">${r.title}</h3>
        <p class="rc-summary">${r.summary || r.excerpt || ''}</p>
        ${r.progress ? `<div class="rc-progress" title="${r.watched || ''}"><span style="width:${r.progress}%"></span></div>` : ''}
        ${rec && r.why ? `<p class="rc-why"><span class="rc-why-tag">Why</span>${r.why}</p>` : ''}
        <div class="rc-foot">
          ${topic ? `<span class="rc-chip">${topic}</span>` : ''}
          <span class="rc-chip rc-chip--type">${TYPE_LABEL[r.type]}</span>
        </div>
      </div>
    </article>`;
}

/* ---------- Learning grid ---------- */
const grid = $('#resourceGrid');
grid.innerHTML = RESOURCES.map((r) => card(r)).join('');

/* ---------- recommendation grids (Discover + Goal detail) ---------- */
function renderRecs(){
  $$('[data-recs]').forEach((host) => {
    host.innerHTML = (RECS[host.dataset.recs] || []).map((x) => card(x, { rec: true })).join('');
  });
}
renderRecs();

/* ---------- card detail ---------- */
const detailDialog = $('.detail-dialog');
function openDetail(obj){
  $('#detailKicker').textContent = `${TYPE_LABEL[obj.type]} · ${obj.by}`;
  $('#detailTitle').textContent = obj.title;
  $('#detailSummary').textContent = obj.summary || obj.excerpt || '';
  $('#detailCovers').innerHTML = (obj.covers || []).map((c) => `<li>${c}</li>`).join('');
  $('#detailTopics').innerHTML = (obj.topics || []).map((t) => `<span>${t}</span>`).join('');
  const meta = [obj.meta, obj.progress ? obj.watched : (obj.done ? 'completed' : null)].filter(Boolean).join(' · ');
  $('#detailMeta').textContent = meta;
  const link = $('#detailOpen');
  link.href = obj.url || '#';
  link.textContent = `Open on ${platformName(obj)}`;
  detailDialog.showModal();
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-card]');
  if (c && !e.target.closest('a')) openDetail(CARD_INDEX[+c.dataset.card]);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.matches('[data-card]')) {
    e.preventDefault(); openDetail(CARD_INDEX[+document.activeElement.dataset.card]);
  }
});

/* ---------- filtering ---------- */
let fType = 'all', fTopic = 'all';
function applyFilters(){
  const q = $('#search').value.trim().toLowerCase();
  let shown = 0;
  $$('.res-card', grid).forEach((c) => {
    const okType = fType === 'all' || c.dataset.type === fType;
    const okTopic = fTopic === 'all' || c.dataset.topics.split('|').includes(fTopic);
    const okText = !q || c.textContent.toLowerCase().includes(q);
    const on = okType && okTopic && okText;
    c.hidden = !on;
    if (on) shown++;
  });
  $('#emptyNote').hidden = shown > 0;
}
$('#search').addEventListener('input', applyFilters);
$$('[data-filter-set] .chip').forEach((chip) => chip.addEventListener('click', () => {
  const set = chip.closest('[data-filter-set]');
  $$('.chip', set).forEach((c) => c.classList.remove('on'));
  chip.classList.add('on');
  if (set.dataset.filterSet === 'type') fType = chip.dataset.type;
  else fTopic = chip.dataset.topic;
  applyFilters();
}));

/* ---------- view routing ---------- */
const VIEWS = ['learning', 'discover', 'goals', 'goal'];
function setView(name){
  if (!VIEWS.includes(name)) name = 'learning';
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  $$('.nav a').forEach((a) => {
    const active = a.dataset.view === name || (name === 'goal' && a.dataset.view === 'goals');
    a.classList.toggle('active', active);
    a.toggleAttribute('aria-current', active);
  });
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0 });
  if (!document.querySelector('dialog[open]')) $('#main').focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
$$('[data-view]').forEach((el) => {
  if (el.tagName === 'A') return;
  el.addEventListener('click', () => { location.hash = '#' + el.dataset.view; });
});

/* ---------- theme (Light / Dark switch in the rail) ---------- */
function setTheme(dark){
  document.body.classList.toggle('dark', dark);
  $$('[data-theme-set]').forEach((b) => b.classList.toggle('on', (b.dataset.themeSet === 'dark') === dark));
  try { localStorage.setItem('le-theme', dark ? 'dark' : 'light'); } catch {}
}
let storedTheme;
try { storedTheme = localStorage.getItem('le-theme'); } catch {}
setTheme(storedTheme ? storedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet === 'dark')));

/* ---------- account menu ---------- */
const accountMenu = $('#accountMenu');
$('[data-account]')?.addEventListener('click', (e) => {
  e.stopPropagation();
  accountMenu.hidden = !accountMenu.hidden;
});
document.addEventListener('click', () => { if (accountMenu) accountMenu.hidden = true; });
$$('#accountMenu button').forEach((b) => b.addEventListener('click', () => toast(`${b.textContent} — coming soon`)));

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  let n = $('.toast');
  if (!n) { n = document.createElement('div'); n.className = 'toast'; n.setAttribute('role', 'status'); document.body.append(n); }
  n.textContent = msg; n.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('show'), 2200);
}

/* ---------- Ask AI ---------- */
const askPanel = $('#askPanel'), askScrim = $('#askScrim'), askThread = $('#askThread');
function answer(q){
  const s = q.toLowerCase();
  if (/recent|been learning/.test(s)) return "In the last few weeks you've saved 10 resources. They cluster around <strong>AI UX</strong> (4) and <strong>AI agents</strong> (4), with a lighter thread on <strong>AI evaluation</strong> (2). Sources skew to long-form video and posts from product teams — Figma, Linear, Vercel.";
  if (/recurring|my topics/.test(s)) return "Your recurring topics are <strong>AI UX</strong> and <strong>AI agents</strong> — they appear across most of what you save. <strong>Product design</strong> is a steady third thread.";
  if (/changed|how has my/.test(s)) return "Early saves were broad AI-product reading. Over the last few weeks they've narrowed toward how AI UX and agents combine — which is why a clear direction is starting to surface.";
  if (/focus/.test(s)) return "Right now, <strong>AI evaluation</strong> is the useful focus. You've built depth in AI UX and agents but hold only 2 resources on evaluation, and it connects directly to the AI-native product design direction.";
  if (/learn next|should i learn/.test(s)) return "Finish Hamel Husain's LLM evaluation talk (saved, unfinished), then the NN/g guide to evaluating AI. After that, branch into <strong>AI prototyping</strong> — you have nothing there yet.";
  if (/recommend|why are you|why this/.test(s)) return "AI UX and AI agents each appear across 4+ saved resources; evaluation appears in only 2. Several of your saved pieces name evaluation as the gap between a demo and a product — so it's the highest-leverage next step.";
  if (/relate to my goal|my goal|connect/.test(s)) return "Your goal is <strong>AI-native product design</strong>. Of what you've saved: 4 resources map to AI UX, 4 to AI agents, 2 to AI evaluation. AI prototyping, AI product strategy and AI fundamentals have no activity yet.";
  if (/not explored|explored much|gaps?/.test(s)) return "Light or empty areas: <strong>AI prototyping</strong> (0 resources), <strong>AI product strategy</strong> (0), <strong>AI evaluation</strong> (2). Everything else you've returned to at least a few times.";
  if (/industry|emerging|becoming relevant/.test(s)) return "Two threads are picking up in AI product circles: evaluation &amp; eval-driven design, and agent reliability / guardrails. Both connect to resources already in your library.";
  return "I answer from your library, your goals and how your activity is changing — not the whole web. Try one of the suggestions above.";
}
function openAsk(q){
  askScrim.hidden = false; askPanel.hidden = false;
  if (q) ask(q); else setTimeout(() => $('#askInput').focus(), 60);
}
function closeAsk(){ askScrim.hidden = true; askPanel.hidden = true; }
function ask(q){
  const qe = document.createElement('div'); qe.className = 'bubble q'; qe.textContent = q;
  const ae = document.createElement('div'); ae.className = 'bubble a'; ae.innerHTML = answer(q);
  askThread.append(qe, ae);
  askThread.scrollTop = askThread.scrollHeight;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ask-q]');
  if (t) { e.preventDefault(); openAsk(t.dataset.askQ); return; }
  if (e.target.closest('[data-ask]')) { e.preventDefault(); openAsk(); }
});
$$('[data-ask-close]').forEach((b) => b.addEventListener('click', closeAsk));
askScrim.addEventListener('click', closeAsk);
$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#askInput').value.trim();
  if (!v) return;
  ask(v); $('#askInput').value = '';
});

/* ---------- Add learning ---------- */
const addDialog = $('.add-dialog');
const showStep = (dlg, step) => $$('.sheet-step', dlg).forEach((s) => s.hidden = s.dataset.step !== step);
$$('[data-add], [data-welcome-add]').forEach((b) => b.addEventListener('click', () => {
  dismissWelcome();
  showStep(addDialog, 'form'); addDialog.showModal();
  setTimeout(() => $('#resourceUrl').focus(), 50);
}));
$('#addForm').addEventListener('submit', (e) => { e.preventDefault(); showStep(addDialog, 'preview'); });
$('#saveResource').addEventListener('click', () => {
  addDialog.close(); $('#addForm').reset(); showStep(addDialog, 'form');
  toast('Saved to your library');
});

/* ---------- Goals ---------- */
const goalDialog = $('.goal-dialog');
const goalsList = $('#goalsList'), goalsEmpty = $('#goalsEmpty'), suggestWrap = $('#goalSuggestions');
const goals = [];
const dismissedSuggestions = new Set();

/* the only real signal: which saves overlap a goal's topics */
function goalMetrics(areas){
  const matched = RESOURCES.filter((r) => r.topics.some((t) => areas.includes(t)));
  const byArea = {};
  areas.forEach((a) => { byArea[a] = matched.filter((r) => r.topics.includes(a)).length; });
  const ranked = Object.entries(byArea).sort((a, b) => b[1] - a[1]);
  const started = ranked.filter((x) => x[1] > 0).sort((a, b) => a[1] - b[1]);
  const thin = started[0] || ranked.filter((x) => x[1] === 0)[0] || [areas[areas.length - 1], 0];
  return {
    resources: matched.length,
    topArea: (ranked[0] && ranked[0][1]) ? ranked[0][0] : areas[0],
    thinArea: thin[0],
    byArea, matched,
  };
}

/* resources to learn for one area — from the library first, then recommendations */
const REC_POOL = [...RECS.evaluation, ...RECS.emerging];
function areaResources(area, n = 2){
  const lib = RESOURCES.filter((r) => r.topics.includes(area));
  if (lib.length) return { label: `${lib.length} in your library`, items: lib.slice(0, n) };
  const rec = REC_POOL.filter((r) => r.topics.includes(area));
  if (rec.length) return { label: 'suggested', items: rec.slice(0, n) };
  return { label: 'nothing here yet', items: [] };
}

function goalCardHTML(g, i){
  const m = goalMetrics(g.areas);
  const chips = g.areas.slice(0, 4).map((a) => `<span>${a}</span>`).join('')
    + (g.areas.length > 4 ? `<span>+${g.areas.length - 4}</span>` : '');
  return `
    <button class="goal-card" data-goal="${i}">
      <div class="gc-head"><h3>${g.title}</h3><span class="gc-tag">${g.origin}</span></div>
      <p class="gc-why">${g.why}</p>
      <div class="gc-areas">${chips}</div>
      <p class="gc-line">${m.resources} of your saves map here · most on <strong>${m.topArea}</strong></p>
    </button>`;
}

function renderGoals(){
  goalsEmpty.hidden = goals.length > 0;
  goalsList.querySelectorAll('.goal-card').forEach((c) => c.remove());
  goalsList.insertAdjacentHTML('beforeend', goals.map(goalCardHTML).join(''));
  goalsList.querySelectorAll('.goal-card').forEach((b) => {
    b.addEventListener('click', () => openGoalDetail(goals[+b.dataset.goal]));
  });
}

function renderSuggestions(){
  const live = SUGGESTED_GOALS.filter((s) => !dismissedSuggestions.has(s.title) && !goals.some((g) => g.title === s.title));
  suggestWrap.hidden = live.length === 0;
  suggestWrap.querySelectorAll('.suggest-card').forEach((c) => c.remove());
  suggestWrap.insertAdjacentHTML('beforeend', live.map((s) => {
    const m = goalMetrics(s.areas);
    return `
      <div class="suggest-card">
        <p class="kicker"><span class="ai-tag">AI</span> Pattern in your learning</p>
        <h3>${s.title}</h3>
        <p class="sc-why">${s.why}</p>
        <p class="gc-line">${m.resources} of your saves fit · most on <strong>${m.topArea}</strong></p>
        <div class="btn-row">
          <button class="btn-primary" data-make-goal="${s.title}">Make this a goal</button>
          <button class="btn-ghost" data-skip-goal="${s.title}">Not now</button>
        </div>
      </div>`;
  }).join(''));
}

function createGoal(g){
  goals.unshift(g);
  renderGoals(); renderSuggestions();
  if (goalDialog.open) goalDialog.close();
  openGoalDetail(g);
  toast('Goal created');
}

function openGoalDetail(g){
  const m = goalMetrics(g.areas);
  $('#goalTitle').textContent = g.title;
  $('#goalWhy').textContent = g.why;
  $('#goalCount').textContent =
    `${m.resources} of your saved resources map to this direction — most on ${m.topArea}.`;

  $('#goalAreas').innerHTML = g.areas.map((a) => {
    const ar = areaResources(a);
    const focus = a === m.thinArea;
    const items = ar.items.length
      ? ar.items.map((r) => `
          <button class="ac-res" data-card="${registerCard(r)}">
            <span class="ac-res-type">${TYPE_LABEL[r.type]}</span>
            <span class="ac-res-title">${r.title}</span>
          </button>`).join('')
      : `<p class="ac-empty">Add something from Discover to start this area.</p>`;
    return `
      <div class="area-card${focus ? ' area-card--focus' : ''}" style="--h:${hueFor([a])};--hl:${hueLightFor([a])}">
        <div class="ac-head">
          <span class="ac-swatch"></span>
          <h4>${a}</h4>
          <span class="ac-meta">${ar.label}</span>
        </div>
        <div class="ac-list">${items}</div>
      </div>`;
  }).join('');

  $('#goalFocus').textContent = m.thinArea;
  $('#goalFocusWhy').textContent =
    `Your lightest area so far — the one that ties your ${m.topArea} work into something you can ship. Start with what's on its card above.`;
  location.hash = '#goal';
}

/* suggestion actions (delegated — cards are re-rendered) */
document.addEventListener('click', (e) => {
  const mk = e.target.closest('[data-make-goal]');
  if (mk) {
    const s = SUGGESTED_GOALS.find((x) => x.title === mk.dataset.makeGoal);
    createGoal({ ...s, origin: 'AI pattern' });
  }
  const sk = e.target.closest('[data-skip-goal]');
  if (sk) { dismissedSuggestions.add(sk.dataset.skipGoal); renderSuggestions(); toast('Kept in the background'); }
});

/* create goal — name + keywords -> matched areas & resources */
$$('[data-create-goal]').forEach((b) => b.addEventListener('click', () => {
  showStep(goalDialog, 'ask'); $('#goalForm').reset(); goalDialog.showModal();
  setTimeout(() => $('#goalName').focus(), 50);
}));
let goalDraft = null;
$('#goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#goalName').value.trim() || 'Untitled goal';
  const raw = $('#goalKeywords').value.trim();
  const kw = raw.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
  const hay = (r) => `${r.title} ${r.by} ${(r.topics || []).join(' ')} ${(r.covers || []).join(' ')}`.toLowerCase();
  let matched = RESOURCES.filter((r) => kw.some((k) => hay(r).includes(k)));
  if (!matched.length) matched = RESOURCES.filter((r) => r.topics.some((t) => /ux|agent|eval|product|design/i.test(t)));
  const areas = [...new Set(matched.flatMap((r) => r.topics))].slice(0, 6);
  const suggested = matched.slice(0, 4);

  goalDraft = { title: name, why: raw ? `You want to get better at: ${raw}.` : 'A direction you set for yourself.',
    areas: areas.length ? areas : ['AI fundamentals', 'AI UX', 'AI agents'], origin: 'yours' };

  $('#goalDraftTitle').textContent = name;
  $('#draftAreas').innerHTML = goalDraft.areas.map((a) => `<li>${a}</li>`).join('');
  $('#draftResources').innerHTML = suggested.length
    ? suggested.map((r) => `
        <div class="draft-res" data-card="${registerCard(r)}" role="button" tabindex="0">
          <span class="dr-type">${TYPE_LABEL[r.type]}</span>
          <span class="dr-title">${r.title}</span>
          <span class="dr-by">${r.by}</span>
        </div>`).join('')
    : '<p class="sheet-lede">No saved resources match those keywords yet — add some from Discover.</p>';
  showStep(goalDialog, 'structure');
});
$('[data-goal-edit]').addEventListener('click', () => showStep(goalDialog, 'ask'));
$('#confirmGoal').addEventListener('click', () => goalDraft && createGoal(goalDraft));

renderSuggestions();
renderGoals();

/* ---------- misc ---------- */
$$('.sheet-close').forEach((b) => { const d = b.closest('dialog'); if (d) b.addEventListener('click', () => d.close()); });
$$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAsk(); });

/* ---------- welcome ---------- */
const welcome = $('.welcome-dialog');
function dismissWelcome(){ try { localStorage.setItem('le-welcomed', '1'); } catch {} if (welcome.open) welcome.close(); }
$('[data-welcome-dismiss]').addEventListener('click', dismissWelcome);
let welcomed;
try { welcomed = localStorage.getItem('le-welcomed'); } catch {}
if (!welcomed) welcome.showModal();

/* ---------- boot ---------- */
setView(location.hash.slice(1) || 'learning');
