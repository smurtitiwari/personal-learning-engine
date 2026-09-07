/* =========================================================
   Learning Engine — Learning · Discover · Goals + Ask AI
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- data ---------- */
const RESOURCES = [
  { type:'youtube', channel:'Wes Roth', word:'AGENTS', title:'The future of AI agents',
    meta:'32 min', date:'Saved yesterday', progress:44, watched:'14 min watched', topics:['AI agents'] },
  { type:'article', pub:'Figma Blog', title:'Designing for AI that people can trust',
    excerpt:'Trust comes from showing your work — provenance, confidence, and graceful failure in AI-driven UI.',
    meta:'8 min read', date:'Saved today', topics:['AI UX','Product design'] },
  { type:'substack', pub:'Every', title:'What makes an AI product useful?',
    meta:'6 min', date:'Saved yesterday', topics:['AI strategy','Product'] },
  { type:'youtube', channel:'Hamel Husain', word:'EVAL', title:'A practical introduction to LLM evaluation',
    meta:'24 min', date:'Saved Sep 3', progress:20, watched:'5 min watched', topics:['AI evaluation'] },
  { type:'pdf', pub:'Anthropic', pages:14, title:'Building effective agents',
    date:'Saved Sep 2', topics:['AI agents'] },
  { type:'article', pub:'Linear Blog', title:'The shape of AI-native interfaces',
    excerpt:'When the model can act, the interface stops being a form and starts being a conversation with structure.',
    meta:'7 min read', date:'Saved Sep 1', topics:['AI UX'] },
  { type:'substack', pub:"Elena's Growth Scoop", title:'Prototyping with AI: a field guide',
    meta:'9 min', date:'Saved Aug 30', topics:['AI prototyping','Product'] },
  { type:'youtube', channel:'Figma', word:'CONFIG', title:'How Figma thinks about AI in design tools',
    meta:'41 min', date:'Saved Aug 28', topics:['AI UX','Product design'] },
  { type:'pdf', pub:'Nielsen Norman Group', pages:22, title:"A UX researcher's guide to evaluating AI",
    date:'Saved Aug 25', topics:['AI evaluation','AI UX'] },
  { type:'article', pub:'Vercel Blog', title:'Agentic workflows in production',
    excerpt:'Retries, guardrails, and human checkpoints — the unglamorous parts that make agents shippable.',
    meta:'11 min read', date:'Saved Aug 22', topics:['AI agents'] },
];

const RECS = {
  evaluation: [
    { type:'youtube', label:'YouTube · Hamel Husain', title:'A practical introduction to LLM evaluation',
      meta:'24 min · already saved, unfinished', why:'Straight at the gap — the best place to start.' },
    { type:'pdf', label:'Document · NN/g', title:"A UX researcher's guide to evaluating AI",
      meta:'22 pages', why:'Frames evaluation from the design-research angle you already work in.' },
    { type:'article', label:'Article · Anthropic', title:'Evals are the new PRDs',
      meta:'9 min read', why:'Argues eval-driven design is how AI products actually ship.' },
  ],
  emerging: [
    { type:'substack', label:"Newsletter · Lenny's Newsletter", title:'How AI product teams measure quality',
      meta:'12 min', why:'Eval-driven design is moving into mainstream PM practice.' },
    { type:'youtube', label:'YouTube · Anthropic', title:'Building reliable agents: guardrails in practice',
      meta:'28 min', why:'Agent reliability is the second thread gaining traction in your field.' },
  ],
};

/* ---------- render: archive (source-specific rows) ---------- */
const topicTags = (t) => `<div class="entry-topics">${t.map(x => `<span>${x}</span>`).join('')}</div>`;
const shortDate = (d) => d.replace(/^Saved\s+/, '');

function entry(r){
  const attrs = `data-type="${r.type}" data-topics="${r.topics.join('|')}"`;

  if (r.type === 'youtube') return `
    <article class="entry entry--video" ${attrs}>
      <div class="entry-thumb">
        <span class="thumb-word">${r.word}</span>
        <span class="thumb-play">▶</span>
        <span class="thumb-dur">${r.meta}</span>
      </div>
      <div class="entry-main">
        <p class="entry-src">YouTube — ${r.channel}</p>
        <h3 class="entry-title">${r.title}</h3>
        ${r.progress ? `<div class="entry-progress"><span style="width:${r.progress}%"></span></div>
        <p class="entry-note mono">${r.watched}</p>` : ''}
        ${topicTags(r.topics)}
      </div>
      <time class="entry-date">${shortDate(r.date)}</time>
    </article>`;

  if (r.type === 'article') return `
    <article class="entry entry--article" ${attrs}>
      <div class="entry-main">
        <p class="entry-src">Article — ${r.pub}</p>
        <h3 class="entry-title">${r.title}</h3>
        <p class="entry-note">${r.excerpt}</p>
        ${topicTags(r.topics)}
      </div>
      <time class="entry-date">${shortDate(r.date)}</time>
    </article>`;

  if (r.type === 'substack') return `
    <article class="entry entry--substack" ${attrs}>
      <div class="entry-main">
        <p class="entry-pub"><span class="pub-mark">${r.pub[0]}</span>${r.pub}</p>
        <h3 class="entry-title">${r.title}</h3>
        <p class="entry-src">Newsletter · ${r.meta}</p>
        ${topicTags(r.topics)}
      </div>
      <time class="entry-date">${shortDate(r.date)}</time>
    </article>`;

  return `
    <article class="entry entry--pdf" ${attrs}>
      <div class="entry-doc"><span>PDF</span></div>
      <div class="entry-main">
        <p class="entry-src">Document — ${r.pub} · ${r.pages} pages</p>
        <h3 class="entry-title">${r.title}</h3>
        ${topicTags(r.topics)}
      </div>
      <time class="entry-date">${shortDate(r.date)}</time>
    </article>`;
}

const grid = $('#resourceGrid');
grid.innerHTML = RESOURCES.map(entry).join('');

/* ---------- render: recommendations ---------- */
$$('[data-recs]').forEach((host) => {
  host.innerHTML = RECS[host.dataset.recs].map((x) => `
    <a class="rec" href="#" data-rec data-type="${x.type}">
      <p class="src src-${x.type === 'youtube' ? 'yt' : x.type === 'substack' ? 'sub' : x.type === 'pdf' ? 'pdf' : 'art'}">${x.type === 'youtube' ? '▶ ' : ''}${x.label}</p>
      <h4>${x.title}</h4>
      <p>${x.meta}</p>
      <p class="rec-why">${x.why}</p>
    </a>`).join('');
});
$$('[data-rec]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); toast('Opens the resource'); }));

/* ---------- library filtering ---------- */
let fType = 'all', fTopic = 'all';
function applyFilters(){
  const q = $('#search').value.trim().toLowerCase();
  let shown = 0;
  $$('.entry', grid).forEach((c) => {
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
  if (el.tagName === 'A') return; // anchors drive the hash themselves
  el.addEventListener('click', () => { location.hash = '#' + el.dataset.view; });
});

/* ---------- theme ---------- */
const setTheme = (dark) => {
  document.body.classList.toggle('dark', dark);
  $$('.theme-toggle').forEach((b) => b.textContent = dark ? '◑' : '◐');
  try { localStorage.setItem('le-theme', dark ? 'dark' : 'light'); } catch {}
};
let stored;
try { stored = localStorage.getItem('le-theme'); } catch {}
setTheme(stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$$('.theme-toggle').forEach((b) => b.addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  setTheme(dark); toast(dark ? 'Dark mode' : 'Light mode');
}));

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
const goalsList = $('#goalsList'), goalsEmpty = $('#goalsEmpty');
const goals = [];
const DESIGN_AREAS = ['AI fundamentals','AI UX','AI agents','AI prototyping','AI evaluation','AI product strategy'];

function renderGoals(){
  goalsEmpty.hidden = goals.length > 0;
  $$('.goal-card', goalsList).forEach((c) => c.remove());
  goals.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'goal-card';
    b.innerHTML = `<div><h3>${g.title}</h3><p>${g.areas.length} learning areas · ${g.origin}</p></div><span class="chev">→</span>`;
    b.addEventListener('click', () => openGoalDetail(g));
    goalsList.append(b);
  });
}
function createGoal(g){
  goals.unshift(g);
  renderGoals();
  goalDialog.open && goalDialog.close();
  openGoalDetail(g);
  toast('Goal created');
}
function openGoalDetail(g){
  $('#goalTitle').textContent = g.title;
  $('#goalWhy').textContent = g.why;
  $('#goalAreas').innerHTML = g.areas.map((a) => `<span>${a}</span>`).join('');
  location.hash = '#goal';
}

$('[data-accept-suggestion]').addEventListener('click', () => {
  $('#goalSuggestion').hidden = true;
  createGoal({
    title:'AI-native product design',
    why:"You've repeatedly explored AI UX, agents and product design, and kept returning to how they fit together.",
    areas: DESIGN_AREAS, origin:'from an AI-noticed pattern',
  });
});
$('[data-dismiss-suggestion]').addEventListener('click', () => {
  $('#goalSuggestion').hidden = true;
  toast('AI suggestions stay in the background');
});

$$('[data-create-goal]').forEach((b) => b.addEventListener('click', () => {
  showStep(goalDialog, 'ask'); $('#goalForm').reset(); goalDialog.showModal();
  setTimeout(() => $('#goalInput').focus(), 50);
}));
let goalDraft = null;
$('#goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('#goalInput').value.trim();
  const clean = raw.replace(/^i\s+want\s+to\s+(become|be|learn|get\s+better\s+at)\s+(an?\s+)?/i, '').replace(/\.$/, '');
  const title = clean.charAt(0).toUpperCase() + clean.slice(1);
  const isDesign = /design|ux|product/i.test(raw);
  const areas = isDesign ? DESIGN_AREAS
    : ['Fundamentals','Core concepts','Hands-on practice','Evaluation & judgement','Applying it at work'];
  goalDraft = { title, why:`Built from what you told AI: "${raw}".`, areas, origin:'created by you' };
  $('#goalDraftTitle').textContent = title;
  $('#draftAreas').innerHTML = areas.map((a) => `<li>${a}</li>`).join('');
  showStep(goalDialog, 'structure');
});
$('[data-goal-edit]').addEventListener('click', () => showStep(goalDialog, 'ask'));
$('#confirmGoal').addEventListener('click', () => goalDraft && createGoal(goalDraft));

/* ---------- misc ---------- */
$$('.sheet-close').forEach((b) => { const d = b.closest('dialog'); if (d) b.addEventListener('click', () => d.close()); });
$$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
$('.account').addEventListener('click', () => toast('Profile & settings live here'));
$('.settings-btn')?.addEventListener('click', () => toast('Profile & settings live here'));
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
