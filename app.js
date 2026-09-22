/* =========================================================
   Learning Engine — Learning · Discover · Goals + Ask AI
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- data — populated from API ---------- */
const RESOURCES = []; // filled by loadResources() on boot

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
const TYPE_LABEL = { youtube:'Video', video:'Video', article:'Article', substack:'Newsletter', newsletter:'Newsletter', pdf:'PDF', other:'Resource' };
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

/* ---------- processing skeleton card ---------- */
function processingCard(idx) {
  return `
    <article class="res-card res-card--processing" tabindex="-1" aria-hidden="true" data-card="${idx}"
             role="status" aria-label="Processing resource">
      <div class="rc-media rc-media--skel" aria-hidden="true"></div>
      <div class="rc-body">
        <div class="rc-skel-line" style="width:55%;height:8px;margin-bottom:10px"></div>
        <div class="rc-skel-line" style="width:90%;height:11px;margin-bottom:6px"></div>
        <div class="rc-skel-line" style="width:72%;height:11px;margin-bottom:14px"></div>
        <p class="rc-processing-label">Processing resource…</p>
      </div>
    </article>`;
}

/* ---------- failed card ---------- */
function failedCard(r, idx) {
  return `
    <article class="res-card res-card--failed" tabindex="0" data-card="${idx}"
             role="button" aria-label="Processing failed">
      <div class="rc-media rc-media--skel" aria-hidden="true"></div>
      <div class="rc-body">
        <p class="rc-src">${r.url ? new URL(r.url).hostname.replace('www.', '') : 'Unknown source'}</p>
        <h3 class="rc-title rc-title--failed">${r.title || r.url || 'Untitled'}</h3>
        <p class="rc-processing-label rc-processing-label--failed">Summary failed</p>
        <button class="rc-retry-btn" data-retry-id="${r._id || r.id}" aria-label="Retry processing">
          Retry
        </button>
      </div>
    </article>`;
}

/* ---------- unified resource card ---------- */
function card(r, { rec = false } = {}){
  const idx = registerCard(r);
  if (r.status === 'processing') return processingCard(idx);
  if (r.status === 'failed') return failedCard(r, idx);
  const hue = hueFor(r.topics, r.type);
  const hueL = hueLightFor(r.topics, r.type);
  const cls = ['res-card', `rc-${r.type}`, rec ? 'res-card--rec' : ''].filter(Boolean).join(' ');
  const topic = (r.topics && r.topics[0]) || '';
  const hasThumbnail = Boolean(r.thumbnail);
  const media = hasThumbnail
    ? `<div class="rc-media ${r.type === 'youtube' ? 'rc-media--video ' : ''}rc-media--thumb"
              style="background-image:url('${r.thumbnail}')" aria-hidden="true">
         ${r.type === 'youtube' ? '<span class="rc-play-overlay" aria-hidden="true">▶</span>' : ''}
         ${r.type === 'youtube' && r.meta ? `<span class="rc-dur">${r.meta}</span>` : ''}
       </div>`
    : r.type === 'youtube'
      ? `<div class="rc-media rc-media--video">
           <span class="rc-ghost">${r.word || (r.by || '').slice(0, 6).toUpperCase()}</span>
           <span class="rc-play" aria-hidden="true">▶</span>
           ${r.meta ? `<span class="rc-dur">${r.meta}</span>` : ''}
         </div>`
    : `<div class="rc-media rc-media--pattern" data-pat="${idx % 3}" aria-hidden="true"></div>`;

  return `
    <article class="${cls}" data-card="${idx}" data-type="${r.type}" data-topics="${(r.topics || []).join('|')}"
             role="button" tabindex="0" style="--h:${hue};--hl:${hueL}">
      ${media}
      <div class="rc-body">
        <p class="rc-src">${r.by || ''}</p>
        <h3 class="rc-title">${r.title}</h3>
        <div class="rc-foot">
          ${topic ? `<span class="rc-chip">${topic}</span>` : ''}
          <span class="rc-chip rc-chip--type">${TYPE_LABEL[r.type]}</span>
          <button class="rc-ask" data-ask-card="${idx}" aria-label="Ask AI about this">Ask AI</button>
        </div>
      </div>
    </article>`;
}

/* ---------- API helpers ---------- */
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

/** Transform an API resource into the shape card() expects */
function apiToCard(r) {
  const mins = r.duration_seconds
    ? Math.round(r.duration_seconds / 60)
    : (r.reading_time_minutes || 0);
  const meta = mins > 0
    ? (r.source_type === 'youtube' ? `${mins} min` : `${mins} min read`)
    : (r.page_count ? `${r.page_count} pages` : '');

  const addedMs = r.added_at ? new Date(r.added_at.replace(' ', 'T') + 'Z').getTime() : 0;
  const diffDays = Math.floor((Date.now() - addedMs) / 86400000);
  const dateStr = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : (r.added_at || '').slice(0, 10);

  const pct = r.progress || 0;
  const watchedMins = (pct > 0 && mins > 0) ? Math.round((pct / 100) * mins) : 0;
  const topics = Array.isArray(r.topics) ? r.topics : [];

  const _typeMap = { video: 'youtube', newsletter: 'substack', other: 'article' };
  return {
    _id: r.id,
    type: _typeMap[r.source_type] || r.source_type || 'article',
    by: r.creator_name || r.author_name || r.source || '',
    title: r.title || '(Processing…)',
    meta,
    date: `Saved ${dateStr}`,
    topics,
    url: r.url || '',
    thumbnail: r.thumbnail || '',
    summary: r.summary || r.ai_summary || r.description || '',
    covers: Array.isArray(r.ai_key_takeaways) ? r.ai_key_takeaways : [],
    status: r.status,
  };
}

/* ---------- Learning grid ---------- */
const grid = $('#resourceGrid');

async function loadResources() {
  try {
    const { data } = await apiFetch('/api/resources');
    RESOURCES.length = 0;
    const cards = data.map(apiToCard);
    RESOURCES.push(...cards);
    grid.innerHTML = cards.length
      ? cards.map((r) => card(r)).join('')
      : '';
    if (cards.length === 0) {
      const emptyEl = $('#emptyNote');
      if (emptyEl) { emptyEl.textContent = 'Your library is empty — paste a link above to add your first resource.'; emptyEl.hidden = false; }
    }
    applyFilters();
    // Scroll to and pulse newly added card
    if (_highlightResourceId) {
      const id = _highlightResourceId;
      _highlightResourceId = null;
      requestAnimationFrame(() => {
        const newCard = [...document.querySelectorAll('[data-card]')].find(
          (c) => CARD_INDEX[+c.dataset.card]?._id === id
        );
        if (newCard) {
          newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          newCard.classList.add('res-card--new');
          setTimeout(() => newCard.classList.remove('res-card--new'), 1400);
        }
      });
    }
    // Keep card click handlers working — CARD_INDEX is repopulated by card()
  } catch (err) {
    console.error('loadResources failed:', err.message);
    grid.innerHTML = `<p class="empty-note" style="display:block">Could not load resources — is the server running?</p>`;
  }
}

/* ---------- recommendation grids (Discover) ---------- */
function recToCard(r) {
  const _typeMap = { video: 'youtube', newsletter: 'substack', other: 'article' };
  return {
    _recId: r.id,
    type: _typeMap[r.source_type] || r.source_type || 'article',
    by: r.creator_name || '',
    title: r.title || 'Untitled',
    summary: r.description || '',
    why: r.reason || '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    url: r.url || '',
    score: r.score || 0,
    reason_detail: r.reason_detail || '',
    thumbnail: r.thumbnail || r.thumbnail_url || recommendationThumbnail(r),
  };
}

/* External suggestions always receive a visual cover instead of an empty
   placeholder. The image reflects the suggested subject when the source has
   not provided its own thumbnail. */
function recommendationThumbnail(r) {
  const topic = (Array.isArray(r.topics) ? r.topics.join(' ').toLowerCase() : '');
  if ((r.source_type || '').toLowerCase() === 'youtube') {
    return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80';
  }
  if (topic.includes('design') || topic.includes('ux')) {
    return 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=1200&q=80';
  }
  if (topic.includes('agent') || topic.includes('evaluation')) {
    return 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80';
  }
  return 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80';
}

let _allRecs = [];
let _allTrends = [];
let _discoverTypeFilter = 'all';

async function loadDiscover() {
  // Show skeleton while loading
  const aiGrid = $('#aiRecGrid');
  if (aiGrid && !aiGrid.innerHTML) {
    aiGrid.insertAdjacentHTML('beforebegin', '<div class="discover-skeleton" id="discoverSkeleton"><div class="skel-card"></div><div class="skel-card"></div><div class="skel-card"></div></div>');
  }
  try {
    const [{ data: recs }, { data: trends }] = await Promise.all([
      apiFetch('/api/recommendations'),
      apiFetch('/api/trends'),
    ]);
    _allRecs = recs || [];
    _allTrends = trends || [];
    $('#discoverSkeleton')?.remove();
    renderDiscover();
    if (_goalsLoaded) renderGoals(); // refresh goal cards with rec counts
  } catch (err) {
    $('#discoverSkeleton')?.remove();
    console.warn('loadDiscover failed:', err.message);
    const aiGrid = $('#aiRecGrid');
    if (aiGrid) aiGrid.innerHTML = '<p class="empty-note" style="display:block;padding:16px 0">Recommendations unavailable — try refreshing.</p>';
  }
}

function renderDiscover() {
  if (!_allRecs.length && !_allTrends.length) return;

  // ── AI Recommended section ──────────────────────────────────
  const aiGrid = $('#aiRecGrid');
  const aiSummary = $('#aiRecSummary');

  const searchTerm = ($('#discoverSearch')?.value || '').trim().toLowerCase();
  const top6 = _allRecs
    .filter(r => _discoverTypeFilter === 'all' || (_typeMapForFilter(r.source_type) === _discoverTypeFilter))
    .filter(r => !searchTerm || [r.title, r.creator_name, r.description, r.reason, ...(Array.isArray(r.topics) ? r.topics : [])]
      .filter(Boolean).join(' ').toLowerCase().includes(searchTerm))
    .slice(0, 6)
    .map(recToCard);

  if (top6.length > 0 && aiGrid) {
    // Generate a human-readable summary of why these are being surfaced
    const topRec = top6[0];
    const topTopics = [...new Set(top6.flatMap(r => r.topics))].slice(0, 3);
    const goalTitles = _liveGoals.map(g => g.title);
    let summaryText = '';
    if (goalTitles.length > 0) {
      summaryText = `Based on your goal "${goalTitles[0]}" and what's already in your library, these are the highest-signal things to explore next.`;
    } else if (topTopics.length > 0) {
      summaryText = `You've been building depth in ${topTopics.slice(0,2).join(' and ')}. These extend that thinking into areas you haven't covered yet.`;
    } else {
      summaryText = "Picked from a curated pool and scored against your interests, gaps, and what's trending in your field.";
    }
    aiSummary.textContent = summaryText;
    aiGrid.innerHTML = top6.map(r => card(r, { rec: true })).join('');

  } else if (aiGrid) {
    aiSummary.textContent = 'Add resources to your library to get personalised recommendations.';
    aiGrid.innerHTML = '';
  }

  // ── Emerging (recs 7–9, trend-boosted) ─────────────────────
  const emergingBlock = $('#emergingBlock');
  const emergingGrid = $('#emergingGrid');
  const emergingLede = $('#emergingLede');
  const emerging = _allRecs.slice(6, 9).map(recToCard);
  if (emerging.length > 0 && emergingBlock && emergingGrid) {
    if (emergingLede && _allTrends[0]) {
      emergingLede.textContent = `${_allTrends[0].topic} and ${_allTrends[1]?.topic || 'related areas'} are gaining weight in AI product circles — and both connect to what you already save.`;
    }
    emergingGrid.innerHTML = emerging.map(r => card(r, { rec: true })).join('');
    emergingBlock.hidden = false;
  }
}

function _typeMapForFilter(type) {
  return ({ video: 'youtube', newsletter: 'substack', other: 'article' })[type] || type || 'article';
}

$$('[data-discover-filter]').forEach((button) => button.addEventListener('click', () => {
  _discoverTypeFilter = button.dataset.discoverFilter || 'all';
  $$('[data-discover-filter]').forEach((filter) => {
    const selected = filter === button;
    filter.classList.toggle('active', selected);
    filter.classList.toggle('on', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  renderDiscover();
}));
$('#discoverSearch')?.addEventListener('input', renderDiscover);

/* ---------- card detail ---------- */
const detailDialog = $('.detail-dialog');
let _currentDetailResource = null;
let _sessionStart = null;      // when current detail was opened
const MIN_SESSION_SECS = 10;   // ignore accidental taps under 10 s
const DETAIL_SUMMARY_MAX_CHARS = 360;

function conciseDetailSummary(value) {
  const summary = String(value || '').replace(/\s+/g, ' ').trim();
  if (summary.length <= DETAIL_SUMMARY_MAX_CHARS) return summary;

  const excerpt = summary.slice(0, DETAIL_SUMMARY_MAX_CHARS - 1);
  const sentenceEnd = Math.max(excerpt.lastIndexOf('.'), excerpt.lastIndexOf('!'), excerpt.lastIndexOf('?'));
  return `${(sentenceEnd >= 220 ? excerpt.slice(0, sentenceEnd + 1) : excerpt.trimEnd())}…`;
}

/** Call when a resource detail closes — reports actual elapsed time */
async function flushSessionTime() {
  const obj = _currentDetailResource;
  if (!obj?._id || !_sessionStart) return;
  const elapsed = Math.floor((Date.now() - _sessionStart) / 1000);
  _sessionStart = null;
  if (elapsed < MIN_SESSION_SECS) return; // too short — not meaningful

  // Report as a 'progressed' event with real seconds
  const pct = obj.progress || 0;
  apiFetch('/api/activity', {
    method: 'POST',
    body: JSON.stringify({
      resource_id: obj._id,
      event_type: 'progressed',
      duration_seconds: elapsed,
      progress_percentage: pct,
    }),
  }).catch(() => {});
}

function renderDetailDialog(obj) {
  _currentDetailResource = obj;

  // Identity
  const byParts = [obj.by].filter(Boolean);
  $('#detailKicker').textContent = [TYPE_LABEL[obj.type], ...byParts].filter(Boolean).join(' · ');
  $('#detailTitle').textContent = obj.title || 'Untitled';

  // Meta line: duration/reading time · date added
  const metaParts = [];
  if (obj.meta) metaParts.push(obj.meta);
  if (obj.date) metaParts.push(obj.date);
  $('#detailMeta').textContent = metaParts.join(' · ');

  const thumbnail = $('#detailThumbnail');
  const thumbnailImage = $('#detailThumbnailImage');
  if (obj.thumbnail) {
    thumbnailImage.src = obj.thumbnail;
    thumbnailImage.alt = `Thumbnail for ${obj.title || 'video'}`;
    thumbnail.hidden = false;
  } else {
    thumbnail.hidden = true;
    thumbnailImage.removeAttribute('src');
    thumbnailImage.alt = '';
  }

  // AI Summary — always visible; loading state while generating
  const summaryEl = $('#detailSummary');
  const summary = obj.summary || obj.ai_summary || '';
  summaryEl.textContent = conciseDetailSummary(summary) || 'Generating summary…';
  summaryEl.classList.toggle('detail-summary--loading', !summary);

  // Why AI recommended this (rec cards only)
  const whyBlock = $('#detailWhyBlock');
  if (whyBlock) {
    if (obj.why) {
      $('#detailWhy').textContent = obj.why;
      whyBlock.hidden = false;
    } else {
      whyBlock.hidden = true;
    }
  }

  // Key takeaways / covers
  const covers = obj.covers || [];
  const coversBlock = $('#detailCoversBlock');
  if (covers.length > 0) {
    $('#detailCovers').innerHTML = covers.map(c => `<li>${c}</li>`).join('');
    coversBlock.hidden = false;
  } else {
    coversBlock.hidden = true;
  }

  // Tags include the content type, platform/format, creator, and AI topics.
  const topics = obj.topics || [];
  const byTags = obj.by ? obj.by.split(' · ') : [];
  const sourceTags = [TYPE_LABEL[obj.type], platformName(obj)];
  const allTags = [...new Set([...sourceTags, ...topics.slice(0, 1)].filter(Boolean))].slice(0, 3);
  const topicsEl = $('#detailTopics');
  topicsEl.innerHTML = allTags.map(t => `<span>${t}</span>`).join('');
  topicsEl.hidden = allTags.length === 0;

  // Open source link
  const link = $('#detailOpen');
  link.href = obj.url || '#';
  link.textContent = `Open on ${platformName(obj)}`;
  link.style.display = obj.url ? '' : 'none';

  // Delete button
  const deleteBtn = $('#detailDelete');
  deleteBtn.hidden = !obj._id;

  // Clear related (will be filled after API call)
  $('#detailRelatedWrap').hidden = true;
  $('#detailRelatedList').innerHTML = '';
}

async function openDetail(obj) {
  // Flush previous session before opening a new one
  await flushSessionTime();

  renderDetailDialog(obj);
  detailDialog.showModal();

  if (!obj._id) return; // rec card with no library ID — no API to call

  // Start session timer for this resource
  _sessionStart = Date.now();

  // Log 'opened' activity event (fire and forget)
  apiFetch('/api/activity', {
    method: 'POST',
    body: JSON.stringify({ resource_id: obj._id, event_type: 'opened' }),
  }).catch(() => {});

  // Fetch full detail for related resources and fresher data
  try {
    const { data } = await apiFetch(`/api/resources/${obj._id}`);

    // Update summary — prefer ai_summary, fall back to description
    const freshSummary = data.summary || data.ai_summary || data.description || '';
    if (freshSummary) {
      $('#detailSummary').textContent = conciseDetailSummary(freshSummary);
      $('#detailSummary').classList.remove('detail-summary--loading');
    }

    if (data.thumbnail) {
      obj.thumbnail = data.thumbnail;
      const thumbnailImage = $('#detailThumbnailImage');
      thumbnailImage.src = data.thumbnail;
      thumbnailImage.alt = `Thumbnail for ${obj.title || 'video'}`;
      $('#detailThumbnail').hidden = false;
    }

    // Show related resources
    if (data.related && data.related.length > 0) {
      const relatedList = $('#detailRelatedList');
      relatedList.innerHTML = data.related.map(r => {
        const c = apiToCard(r);
        return `
          <button class="detail-related-item" data-related-id="${r.id}">
            <span class="dri-type">${TYPE_LABEL[c.type] || 'Resource'}</span>
            <span class="dri-title">${c.title}</span>
            <span class="dri-by">${c.by || ''}</span>
          </button>`;
      }).join('');

      // Clicking a related item fetches and opens its detail
      $$('.detail-related-item', relatedList).forEach(btn => {
        btn.addEventListener('click', async () => {
          const relId = btn.dataset.relatedId;
          try {
            const { data: relData } = await apiFetch(`/api/resources/${relId}`);
            const relCard = apiToCard(relData);
            detailDialog.close();
            openDetail(relCard);
          } catch {}
        });
      });

      $('#detailRelatedWrap').hidden = false;
    }
  } catch {}
}

document.addEventListener('click', async (e) => {
  // Retry failed resource processing
  const retryBtn = e.target.closest('[data-retry-id]');
  if (retryBtn) {
    e.stopPropagation();
    const id = retryBtn.dataset.retryId;
    retryBtn.disabled = true;
    retryBtn.textContent = 'Retrying…';
    try {
      await apiFetch(`/api/resources/${id}/retry`, { method: 'POST' });
      toast('Reprocessing — check back in a moment');
      pollForResource(id);
    } catch (err) {
      toast('Retry failed: ' + err.message);
      retryBtn.disabled = false;
      retryBtn.textContent = 'Retry';
    }
    return;
  }

  // Card Ask AI button — open Ask AI with resource context, don't open detail
  const askCard = e.target.closest('[data-ask-card]');
  if (askCard) {
    e.stopPropagation();
    const obj = CARD_INDEX[+askCard.dataset.askCard];
    if (obj) openAsk(null, { title: obj.title, type: obj.type, by: obj.by, summary: obj.summary || '', url: obj.url });
    return;
  }
  const c = e.target.closest('[data-card]');
  if (c && !e.target.closest('a') && !e.target.closest('[data-retry-id]')) openDetail(CARD_INDEX[+c.dataset.card]);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.matches('[data-card]')) {
    e.preventDefault(); openDetail(CARD_INDEX[+document.activeElement.dataset.card]);
  }
});

/* ---------- Detail actions ---------- */
$('#detailDelete')?.addEventListener('click', async () => {
  const obj = _currentDetailResource;
  if (!obj?._id) return;
  if (!confirm(`Delete "${obj.title}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/api/resources/${obj._id}`, { method: 'DELETE' });
    detailDialog.close();
    loadResources();
    toast('Deleted');
  } catch (err) {
    toast('Could not delete — try again');
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
  // Discover uses the shared visual filter component but owns its state above.
  if (!chip.dataset.type && !chip.dataset.topic) return;
  $$('.chip', set).forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
  chip.classList.add('on');
  chip.setAttribute('aria-pressed', 'true');
  if (set.dataset.filterSet === 'type') fType = chip.dataset.type;
  else fTopic = chip.dataset.topic;
  applyFilters();
}));

/* ---------- view routing ---------- */
const VIEWS = ['learning', 'discover', 'goals', 'goal'];
let _discoverLoaded = false;
let _goalsLoaded = false;
function setView(name){
  // Legacy #goals route → discover Goals tab
  if (name === 'goals') {
    setView('discover');
    setTimeout(() => setDiscoverTab('goals'), 10);
    return;
  }
  if (!VIEWS.includes(name)) name = 'learning';
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  $$('.nav a').forEach((a) => {
    const active = a.dataset.view === name || (name === 'goal' && a.dataset.view === 'discover');
    a.classList.toggle('active', active);
    if (active) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
  });
  const titles = { learning: 'Learning — Learning Engine', discover: 'Discover — Learning Engine', goal: 'Goal — Learning Engine' };
  document.title = titles[name] || 'Learning Engine';
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0 });
  if (!document.querySelector('dialog[open]')) $('#main').focus({ preventScroll: true });
  // Lazy-load Discover on first visit
  if (name === 'discover' && !_discoverLoaded) {
    _discoverLoaded = true;
    loadDiscover();
  }
}
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

/* ---------- Discover tabs ---------- */
let _discoverTab = 'foryou';
function setDiscoverTab(tab) {
  _discoverTab = tab;
  $$('[data-discover-tab]').forEach(b => {
    const isActive = b.dataset.discoverTab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
    b.tabIndex = isActive ? 0 : -1;
  });
  $$('[data-tab-panel]').forEach(p => {
    p.hidden = p.dataset.tabPanel !== tab;
  });
  if (tab === 'goals') {
    if (!_discoverLoaded) {
      _discoverLoaded = true;
      loadDiscover(); // populates _allRecs; re-renders goals after
    }
    if (!_goalsLoaded) {
      _goalsLoaded = true;
      loadGoals();
    }
  }
}

$$('[data-discover-tab]').forEach(b => {
  b.addEventListener('click', () => setDiscoverTab(b.dataset.discoverTab));
  b.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = $$('[data-discover-tab]');
    const current = tabs.indexOf(b);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setDiscoverTab(tabs[next].dataset.discoverTab);
    tabs[next].focus();
  });
});
$$('[data-view]').forEach((el) => {
  if (el.tagName === 'A') return;
  el.addEventListener('click', () => {
    const tab = el.dataset.discoverTabBack;
    location.hash = '#' + el.dataset.view;
    if (tab) setTimeout(() => setDiscoverTab(tab), 10);
  });
});

/* ---------- theme ---------- */
function setTheme(mode) {
  // mode: 'light' | 'dark' | 'system'
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.body.classList.toggle('dark', dark);
  try { localStorage.setItem('le-theme', mode); } catch {}
  const effectiveMode = dark ? 'dark' : 'light';
  $$('[data-theme-set]').forEach(b => {
    // Settings picker (light/system/dark): highlight the stored mode
    // Rail switch (light/dark only): highlight the effective mode
    const inSettings = !!b.closest('.setting-theme');
    const selected = inSettings ? b.dataset.themeSet === mode : b.dataset.themeSet === effectiveMode;
    b.classList.toggle('on', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
}
let _storedTheme;
try { _storedTheme = localStorage.getItem('le-theme'); } catch {}
setTheme(_storedTheme || 'system');
$$('[data-theme-set]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));

/* ---------- UI mode (classic / mario) ---------- */
function _applyUiMode(mode) {
  const isMario = mode === 'mario';
  document.documentElement.setAttribute('data-ui', isMario ? 'mario' : 'classic');
  // Show/hide Mario decorative elements
  $$('.mario-xp-bar, .mario-coins, .mario-sprite').forEach(el => { el.hidden = !isMario; });
  // Swap brand mark
  const classic = document.querySelector('.brand-mark-classic');
  const mario = document.querySelector('.brand-mark-mario');
  if (classic) classic.hidden = isMario;
  if (mario) mario.hidden = !isMario;
  // Sync buttons
  $$('[data-ui-set]').forEach(b => {
    const selected = b.dataset.uiSet === (isMario ? 'mario' : 'classic');
    b.classList.toggle('on', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
}

function setUiMode(mode) {
  try { localStorage.setItem('le-ui-mode', mode); } catch {}
  _applyUiMode(mode);
}

// Init on load
let _storedUiMode;
try { _storedUiMode = localStorage.getItem('le-ui-mode'); } catch {}
_applyUiMode(_storedUiMode || 'mario');

// Toggle handler — reloads page so all CSS is cleanly applied
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ui-set]');
  if (!btn) return;
  const mode = btn.dataset.uiSet;
  const current = localStorage.getItem('le-ui-mode') || 'mario';
  if (mode === current) return;
  setUiMode(mode);
  // Small delay so the user sees the button activate before reload
  setTimeout(() => location.reload(), 120);
});

/* ---------- settings dialog ---------- */
let _prefs = null;
const settingsDialog = $('.settings-dialog');

async function openSettings() {
  if (!settingsDialog) return;
  try {
    const { data } = await apiFetch('/api/preferences');
    _prefs = data;
    // Populate fields
    const targetHours = Math.round((data.weekly_target_minutes ?? 300) / 60);
    const input = $('#weeklyTargetInput');
    if (input) input.value = targetHours;
    const aiSel = $('#aiRecsSelect');
    if (aiSel) aiSel.value = String(data.ai_recommendations_enabled ?? 1);
    // Sync theme buttons inside settings
    const currentMode = localStorage.getItem('le-theme') || 'system';
    $$('[data-theme-set]').forEach(b => {
      const selected = b.dataset.themeSet === currentMode;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    // Sync UI mode buttons
    const currentUiMode = localStorage.getItem('le-ui-mode') || 'mario';
    $$('[data-ui-set]').forEach(b => {
      const selected = b.dataset.uiSet === currentUiMode;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
  } catch {}
  settingsDialog.showModal();
}

$('[data-open-settings]')?.addEventListener('click', openSettings);

// Auto-save weekly target on change
$('#weeklyTargetInput')?.addEventListener('change', async () => {
  const hrs = Math.max(0, Math.min(40, parseInt($('#weeklyTargetInput').value) || 0));
  $('#weeklyTargetInput').value = hrs;
  try {
    await apiFetch('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ weekly_target_minutes: hrs * 60 }),
    });
    _prefs = { ..._prefs, weekly_target_minutes: hrs * 60 };
    renderWeeklyFocus(); // update the goals suggestion
  } catch { toast('Could not save target'); }
});

// Auto-save AI recs setting
$('#aiRecsSelect')?.addEventListener('change', async () => {
  const val = parseInt($('#aiRecsSelect').value);
  try {
    await apiFetch('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ ai_recommendations_enabled: val }),
    });
  } catch { toast('Could not save setting'); }
});

$('#settingsSignout')?.addEventListener('click', () => {
  settingsDialog.close();
  toast('You are in single-user mode — no sign out needed.');
});

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  let n = $('.toast');
  if (!n) { n = document.createElement('div'); n.className = 'toast'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); n.setAttribute('aria-atomic', 'true'); document.body.append(n); }
  n.textContent = msg; n.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('show'), Math.max(3000, msg.length * 60));
}

/* ---------- Ask AI (persistent panel, conversation model) ---------- */
const askPanel = $('#askPanel');
const CONV_KEY = 'le-conversations';

function _loadConvs() {
  try { return JSON.parse(localStorage.getItem(CONV_KEY) || '[]'); } catch { return []; }
}
function _saveConvs() {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(_conversations.slice(0, 30))); } catch {}
}

let _conversations = _loadConvs();
let _activeConvId = null;

function _createConv(resource) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const title = resource?.title
    ? (resource.title.length > 38 ? resource.title.slice(0, 38) + '\u2026' : resource.title)
    : 'New chat';
  const conv = { id, title, resource: resource || null, messages: [], updatedAt: Date.now() };
  _conversations.unshift(conv);
  _saveConvs();
  return conv;
}
function _getConv(id) { return _conversations.find(c => c.id === id); }
function _updateConv(id, patch) {
  const i = _conversations.findIndex(c => c.id === id);
  if (i >= 0) { _conversations[i] = { ..._conversations[i], ...patch, updatedAt: Date.now() }; _saveConvs(); }
}
function _deleteConv(id) { _conversations = _conversations.filter(c => c.id !== id); _saveConvs(); }

function _relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function _showListView() {
  _activeConvId = null;
  $('#askListView').hidden = false;
  $('#askChatView').hidden = true;
  _renderConvList();
}

function _renderConvList() {
  const el = $('#askConvs');
  if (!el) return;
  if (_conversations.length === 0) {
    el.innerHTML = '<p class="ask-empty">No conversations yet — start one below.</p>';
    return;
  }
  el.innerHTML = _conversations.map(c => {
    const lastMsg = c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
    const preview = lastMsg
      ? lastMsg.content.slice(0, 52) + (lastMsg.content.length > 52 ? '\u2026' : '')
      : 'No messages yet';
    return `<button class="ask-conv-item" data-conv-id="${c.id}">
      <span class="ask-conv-dot${c.resource ? ' ask-conv-dot--res' : ''}"></span>
      <span class="ask-conv-body">
        <span class="ask-conv-title">${c.title}</span>
        <span class="ask-conv-preview">${preview}</span>
      </span>
      <span class="ask-conv-time">${_relTime(c.updatedAt)}</span>
    </button>`;
  }).join('');
  $$('.ask-conv-item', el).forEach(btn => {
    btn.addEventListener('click', () => _openConv(btn.dataset.convId));
  });
}

function _openConv(id) {
  _activeConvId = id;
  const conv = _getConv(id);
  if (!conv) return;
  $('#askListView').hidden = true;
  $('#askChatView').hidden = false;
  const resCard = $('#askResourceCard');
  if (conv.resource) {
    resCard.innerHTML = `<div class="ask-res-badge">
      <span class="ask-res-type">${TYPE_LABEL[conv.resource.type] || 'Resource'}</span>
      <span class="ask-res-title">${conv.resource.title}</span>
    </div>`;
    resCard.hidden = false;
  } else {
    resCard.hidden = true;
  }
  _renderChat(conv);
  setTimeout(() => $('#askInput')?.focus(), 60);
}

function _renderChat(conv) {
  const thread = $('#askThread');
  if (!thread) return;
  thread.innerHTML = '';
  conv.messages.forEach(msg => {
    const el = document.createElement('div');
    el.className = `bubble ${msg.role === 'user' ? 'q' : 'a'}`;
    if (msg.role === 'assistant') { el.innerHTML = msg.content.replace(/\n/g, '<br>'); }
    else { el.textContent = msg.content; }
    thread.append(el);
  });
  const suggests = $('#askSuggests');
  if (suggests) {
    suggests.hidden = conv.messages.length > 0;
    if (conv.messages.length === 0 && conv.resource) {
      const qs = _resourceSuggests(conv.resource.type);
      suggests.innerHTML = qs.map(q => `<button data-ask-q="${q}">${q}</button>`).join('');
    }
  }
  thread.scrollTop = thread.scrollHeight;
}

function _resourceSuggests(type) {
  if (type === 'youtube') return ['What are the key takeaways?', 'How does this connect to my goals?', 'What should I watch next?'];
  if (type === 'pdf') return ['Summarise the main arguments', 'How does this relate to my library?', 'What should I read next?'];
  if (type === 'substack') return ['What are the key insights?', 'How does this connect to my field?', 'What should I explore next?'];
  return ['What are the key insights?', 'How does this connect to my goals?', 'What should I read next?'];
}

function _setPanelOpen(open) {
  document.querySelector('.app').classList.toggle('ask-open', open);
  const trigger = document.querySelector('.ask-btn');
  trigger?.classList.toggle('active', open);
  trigger?.setAttribute('aria-expanded', String(open));
  askPanel?.setAttribute('aria-hidden', String(!open));
  if ('inert' in HTMLElement.prototype && askPanel) askPanel.inert = !open;
}
_setPanelOpen(false);

function openAsk(q, resource) {
  _setPanelOpen(true);
  if (resource) {
    let conv = _conversations.find(c => c.resource?.title === resource.title);
    if (!conv) conv = _createConv(resource);
    _openConv(conv.id);
    if (q) askSend(q);
  } else if (q) {
    const conv = _createConv(null);
    _openConv(conv.id);
    askSend(q);
  } else {
    _showListView();
  }
}

function closeAsk() {
  _setPanelOpen(false);
}

async function askSend(q) {
  if (!_activeConvId) {
    const conv = _createConv(null);
    _openConv(conv.id);
  }
  const conv = _getConv(_activeConvId);
  if (!conv) return;
  if (conv.messages.length === 0 && conv.title === 'New chat') {
    const t = q.length > 38 ? q.slice(0, 38) + '\u2026' : q;
    _updateConv(_activeConvId, { title: t });
    conv.title = t;
  }
  conv.messages.push({ role: 'user', content: q });
  _updateConv(_activeConvId, { messages: conv.messages });

  const thread = $('#askThread');
  const suggests = $('#askSuggests');
  if (suggests) suggests.hidden = true;

  const qe = document.createElement('div');
  qe.className = 'bubble q';
  qe.textContent = q;
  thread.append(qe);
  thread.scrollTop = thread.scrollHeight;

  const ae = document.createElement('div');
  ae.className = 'bubble a ask-loading';
  ae.innerHTML = '<span class="ask-dots"><span></span><span></span><span></span></span>';
  thread.append(ae);
  thread.scrollTop = thread.scrollHeight;

  try {
    const body = {
      messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (conv.resource) body.resource = conv.resource;
    // Send server-side conversation_id on subsequent turns so the server
    // appends to the same DB conversation rather than creating a new one each time
    if (conv.serverConvId) body.conversation_id = conv.serverConvId;

    const { data } = await apiFetch('/api/ask', { method: 'POST', body: JSON.stringify(body) });
    const answer = data.answer || 'No answer.';
    ae.classList.remove('ask-loading');
    ae.innerHTML = answer.replace(/\n/g, '<br>');
    conv.messages.push({ role: 'assistant', content: answer });
    // Persist the server-side conversation UUID so future turns attach to it
    if (data.conversation_id && !conv.serverConvId) {
      _updateConv(_activeConvId, { messages: conv.messages, serverConvId: data.conversation_id });
    } else {
      _updateConv(_activeConvId, { messages: conv.messages });
    }
  } catch (err) {
    console.error('[ask] failed:', err.message);
    ae.classList.remove('ask-loading');
    ae.textContent = err.message?.includes('DEEPSEEK_API_KEY')
      ? 'AI is not configured yet — ask the admin to add DEEPSEEK_API_KEY to the server.'
      : `Could not get an answer: ${err.message}`;
  }
  thread.scrollTop = thread.scrollHeight;
}

// Delegated click: data-ask-q and data-ask
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ask-q]');
  if (t) {
    e.preventDefault();
    if (t.closest('#askSuggests') && _activeConvId) {
      askSend(t.dataset.askQ);
    } else {
      openAsk(t.dataset.askQ);
    }
    return;
  }
  const askTrigger = e.target.closest('[data-ask]');
  if (askTrigger) {
    e.preventDefault();
    // Rail Ask AI button toggles the panel
    const isOpen = document.querySelector('.app').classList.contains('ask-open');
    if (isOpen && !e.target.closest('[data-ask-q]')) {
      closeAsk();
    } else {
      openAsk();
    }
  }
});

$('#askClosePanel')?.addEventListener('click', closeAsk);
$('#askBackBtn')?.addEventListener('click', _showListView);
$('#askDelConv')?.addEventListener('click', () => {
  if (!_activeConvId) return;
  _deleteConv(_activeConvId);
  _showListView();
});
$('#askNewBtn')?.addEventListener('click', () => {
  const conv = _createConv(null);
  _openConv(conv.id);
});
$('#askForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#askInput').value.trim();
  if (!v) return;
  askSend(v);
  $('#askInput').value = '';
});
$('#askHomeForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#askHomeInput').value.trim();
  if (!v) return;
  $('#askHomeInput').value = '';
  openAsk(v);
});
$('#detailAskBtn')?.addEventListener('click', () => {
  const obj = _currentDetailResource;
  if (!obj) return;
  detailDialog.close();
  openAsk(null, {
    title: obj.title,
    type: obj.type,
    by: obj.by,
    summary: obj.summary || obj.ai_summary || '',
    url: obj.url,
  });
});

// Initialize conv list on boot
_renderConvList();

/* ---------- Add learning ---------- */
const addDialog = $('.add-dialog');
const showStep = (dlg, step) => $$('.sheet-step', dlg).forEach((s) => s.hidden = s.dataset.step !== step);

$$('[data-add], [data-welcome-add]').forEach((b) => b.addEventListener('click', () => {
  dismissWelcome();
  $('#addError').hidden = true;
  showStep(addDialog, 'form');
  addDialog.showModal();
  setTimeout(() => $('#resourceUrl').focus(), 50);
}));

let _pollTimer = null;
let _highlightResourceId = null;

function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

function showAddPreview(resource) {
  const typeLabel = { youtube: 'Video', article: 'Article', substack: 'Newsletter', pdf: 'PDF' };
  const type = resource.source_type || resource.type || 'article';
  const mins = resource.duration_seconds
    ? Math.round(resource.duration_seconds / 60)
    : (resource.reading_time_minutes || 0);
  const metaPart = mins > 0 ? ` · ${mins} min${type !== 'youtube' ? ' read' : ''}` : '';
  const src = resource.source || (type === 'youtube' ? 'YouTube' : type);

  $('#previewKicker').textContent = resource.duplicate ? 'Already in your library' : 'Understood as';
  $('#previewMark').textContent = type === 'youtube' ? '▶' : type === 'pdf' ? '⬜' : '⬛';
  $('#previewSrc').textContent = `${typeLabel[type] || 'Article'}${src ? ' · ' + src : ''}${metaPart}`;
  $('#previewTitle').textContent = resource.title || resource.url || 'Saved';

  const topics = Array.isArray(resource.topics) ? resource.topics : [];
  const topicsEl = $('#previewTopics');
  const topicsLabel = $('#previewTopicsLabel');
  if (topics.length > 0) {
    topicsEl.innerHTML = topics.map(t => `<span>${t}</span>`).join('');
    topicsLabel.hidden = false;
    topicsEl.hidden = false;
  } else {
    topicsLabel.hidden = true;
    topicsEl.hidden = true;
  }

  const summaryEl = $('#previewSummary');
  if (resource.ai_summary) {
    summaryEl.textContent = resource.ai_summary;
    summaryEl.hidden = false;
  } else {
    summaryEl.hidden = true;
  }

  if (resource.status === 'failed') {
    $('#previewKicker').textContent = 'Saved with limited info';
    $('#previewSrc').textContent = `${typeLabel[type] || 'Resource'} — could not fully process`;
  }

  showStep(addDialog, 'preview');
}

// Poll silently in background — no modal steps, just refresh the grid when done
async function pollForResource(id) {
  stopPolling();
  let attempts = 0;
  _pollTimer = setInterval(async () => {
    attempts++;
    try {
      const { data } = await apiFetch(`/api/resources/${id}`);
      if (data.status === 'ready' || data.status === 'failed') {
        stopPolling();
        loadResources(); // refresh grid with full data (thumbnail, summary, etc.)
      }
    } catch (err) {
      console.warn('Poll error:', err.message);
    }
    if (attempts > 30) { // 60 second timeout
      stopPolling();
      loadResources();
    }
  }, 2000);
}

function closeAddDialog() {
  stopPolling();
  addDialog.close();
  $('#addForm').reset();
  showStep(addDialog, 'form');
}

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#resourceUrl').value.trim();
  if (!url) return;

  const errEl = $('#addError');
  errEl.hidden = true;
  $('#addSubmitBtn').disabled = true;
  showStep(addDialog, 'processing');

  try {
    const { data, duplicate } = await apiFetch('/api/resources', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });

    _highlightResourceId = data.id;
    closeAddDialog();
    loadResources(); // show card immediately (skeleton if still processing)

    if (!duplicate && data.status === 'processing') {
      pollForResource(data.id); // silently refresh when AI processing finishes
    }
  } catch (err) {
    showStep(addDialog, 'form');
    errEl.textContent = err.message || 'Something went wrong — check the link and try again.';
    errEl.hidden = false;
  } finally {
    $('#addSubmitBtn').disabled = false;
  }
});

$('#saveResource').addEventListener('click', closeAddDialog);

/* ---------- Goals ---------- */
const goalDialog = $('.goal-dialog');
const goalsList = $('#goalsList'), goalsEmpty = $('#goalsEmpty'), suggestWrap = $('#goalSuggestions');
const dismissedSuggestions = new Set((() => { try { return JSON.parse(localStorage.getItem('le-dismissed-suggestions') || '[]'); } catch { return []; } })());
const startedGoalIds = new Set((() => { try { return JSON.parse(localStorage.getItem('le-started-goal-ids') || '[]'); } catch { return []; } })());

let _liveGoals = []; // populated from API
let _currentGoalId = null;
let _goalListTab = 'all';

/* Save dismissed suggestions to localStorage so they persist across sessions */
function persistDismissed() {
  try { localStorage.setItem('le-dismissed-suggestions', JSON.stringify([...dismissedSuggestions])); } catch {}
}
function persistStartedGoals() {
  try { localStorage.setItem('le-started-goal-ids', JSON.stringify([...startedGoalIds])); } catch {}
}

/* Helpers to compute local metrics from RESOURCES (for suggestion cards only) */
function goalMetrics(areas){
  const matched = RESOURCES.filter((r) => r.topics.some((t) => areas.includes(t)));
  const byArea = {};
  areas.forEach((a) => { byArea[a] = matched.filter((r) => r.topics.includes(a)).length; });
  const ranked = Object.entries(byArea).sort((a, b) => b[1] - a[1]);
  const started = ranked.filter((x) => x[1] > 0).sort((a, b) => a[1] - b[1]);
  const thin = started[0] || ranked.filter((x) => x[1] === 0)[0] || [areas[areas.length - 1], 0];
  return {
    resources: matched.length,
    topArea: (ranked[0] && ranked[0][1]) ? ranked[0][0] : (areas[0] || '—'),
    thinArea: thin[0],
  };
}

/* ── Render goal list from API data ── */
function goalCardHTML(g, i){
  const areas = g.areas || [];
  const chips = areas.slice(0, 2).map((a) => `<span>${a}</span>`).join('');
  const isSuggestedGoal = SUGGESTED_GOALS.some((goal) => goal.title === g.title);
  return `
    <article class="goal-card" data-goal-id="${g.id}" role="button" tabindex="0" aria-label="Open ${g.title}">
      <div class="gc-head"><h3>${g.title}</h3></div>
      <div class="gc-areas">${chips}</div>
      <div class="gc-ai-recs">
        <span class="gc-ai-cta">View resources</span>
        ${isSuggestedGoal ? `<button class="gc-remove" type="button" data-remove-goal="${g.id}">Remove goal</button>` : ''}
      </div>
    </article>`;
}

async function loadGoals() {
  const goalsList = $('#goalsList');
  try {
    const { data } = await apiFetch('/api/goals');
    const seenTitles = new Set();
    _liveGoals = (data || []).filter((goal) => {
      const key = goal.title.trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    renderGoals();
    renderSuggestions();
  } catch (err) {
    console.warn('loadGoals failed:', err.message);
    if (goalsList) goalsList.innerHTML = '<p class="goals-empty" style="grid-column:1/-1">Could not load goals — try refreshing.</p>';
  }
}

function renderWeeklyFocus() {
  const el = $('#weeklyFocus');
  if (!el) return;

  // Pick a focus topic from active goals (area with least coverage)
  let focusTopic = null;
  let sourceGoalTitle = null;
  for (const g of _liveGoals) {
    if (g.focus_area) { focusTopic = g.focus_area; sourceGoalTitle = g.title; break; }
    if (g.areas && g.areas[0]) { focusTopic = g.areas[0]; sourceGoalTitle = g.title; }
  }

  // Fallback: first resource topic with low coverage
  if (!focusTopic && RESOURCES.length > 0) {
    const topicCounts = {};
    RESOURCES.forEach(r => r.topics.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; }));
    const sorted = Object.entries(topicCounts).sort((a, b) => a[1] - b[1]);
    if (sorted.length > 0) focusTopic = sorted[0][0];
  }

  if (!focusTopic) { el.hidden = true; return; }

  // Weekly target from preferences (default 5h = 300m)
  const targetMins = _prefs?.weekly_target_minutes ?? 300;
  const targetH = Math.round(targetMins / 60);
  const timeStr = targetH > 0 ? `${targetH}h` : `${targetMins}m`;

  $('#wfSuggestion').textContent = `Spend ${timeStr} on ${focusTopic} this week`;
  $('#wfWhy').textContent = sourceGoalTitle
    ? `It's your lightest area inside "${sourceGoalTitle}" — the highest-leverage place to build next.`
    : `You've saved resources touching this topic but haven't gone deep yet.`;
  el.hidden = false;

  // Related resources for this topic
  const related = RESOURCES.filter(r => r.topics.includes(focusTopic)).slice(0, 5);
  const wfRes = $('#wfResources');
  if (wfRes) {
    wfRes.innerHTML = related.length
      ? related.map(r => `
          <button class="wf-res-item" data-card="${registerCard(r)}">
            <span class="wf-res-type">${TYPE_LABEL[r.type] || 'Resource'}</span>
            <span class="wf-res-title">${r.title}</span>
            <span class="wf-res-by">${r.by || ''}</span>
          </button>`).join('')
      : `<p class="wf-empty">No saved resources on ${focusTopic} yet — check Discover for suggestions.</p>`;
  }
}

$('#wfToggle')?.addEventListener('click', () => {
  const res = $('#wfResources');
  const btn = $('#wfToggle');
  if (!res) return;
  const open = !res.hidden;
  res.hidden = open;
  btn.textContent = open ? 'See related resources ↓' : 'Hide resources ↑';
});

function renderGoals(){
  const defaultTitles = new Set(SUGGESTED_GOALS.map(goal => goal.title));
  const userGoals = _liveGoals.filter(goal => !defaultTitles.has(goal.title) || startedGoalIds.has(goal.id));
  goalsEmpty.hidden = userGoals.length > 0;
  goalsList.querySelectorAll('.goal-card').forEach((c) => c.remove());
  goalsList.insertAdjacentHTML('beforeend', userGoals.map(goalCardHTML).join(''));
  goalsList.querySelectorAll('[data-goal-id]').forEach((b) => {
    const open = () => openGoalDetail(b.dataset.goalId);
    b.addEventListener('click', (event) => {
      if (!event.target.closest('[data-remove-goal]')) open();
    });
    b.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('[data-remove-goal]')) {
        event.preventDefault();
        open();
      }
    });
  });
  goalsList.querySelectorAll('[data-remove-goal]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      startedGoalIds.delete(button.dataset.removeGoal);
      persistStartedGoals();
      renderGoals();
      renderSuggestions();
      setGoalListTab('all');
      toast('Returned to All goals.');
    });
  });
}

function setGoalListTab(tab) {
  _goalListTab = tab === 'your' ? 'your' : 'all';
  $$('[data-goal-list-tab]').forEach((button) => {
    const selected = button.dataset.goalListTab === _goalListTab;
    button.classList.toggle('active', selected);
    button.classList.toggle('on', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('#allGoalsSection').hidden = _goalListTab !== 'all';
  $('#yourGoalsSection').hidden = _goalListTab !== 'your';
}

$$('[data-goal-list-tab]').forEach((button) => {
  button.addEventListener('click', () => setGoalListTab(button.dataset.goalListTab));
});

function renderSuggestions(){
  const live = SUGGESTED_GOALS.filter((suggestion) => {
    const existing = _liveGoals.find(goal => goal.title === suggestion.title);
    return !existing || !startedGoalIds.has(existing.id);
  });
  $('#allGoalsSection').hidden = false;
  suggestWrap.hidden = false;
  suggestWrap.querySelectorAll('.suggest-card').forEach((c) => c.remove());
  suggestWrap.insertAdjacentHTML('beforeend', live.map((s) => {
    const m = goalMetrics(s.areas);
    return `
      <div class="suggest-card">
        <p class="kicker"><span class="ai-tag">AI</span> Suggested goal</p>
        <h3>${s.title}</h3>
        <p class="sc-why">${s.why}</p>
        <div class="btn-row">
          <button class="btn-outline btn-sm" data-start-goal="${s.title}">Start this goal</button>
        </div>
      </div>`;
  }).join(''));
}

async function createGoalFromData(g, { openDetail = true, message = 'Goal created' } = {}) {
  try {
    const { data } = await apiFetch('/api/goals', {
      method: 'POST',
          body: JSON.stringify({
        title: g.title,
        reason: g.why || g.reason || '',
        areas: g.areas || [],
        ai_suggested: true,
      }),
    });
    if (goalDialog.open) goalDialog.close();
    await loadGoals();
    startedGoalIds.add(data.id);
    persistStartedGoals();
    renderGoals();
    renderSuggestions();
    if (openDetail) {
      setGoalListTab('your');
      openGoalDetail(data.id);
    }
    toast(message);
  } catch (err) {
    toast('Could not create goal — try again');
  }
}

async function openGoalDetail(goalId) {
  _currentGoalId = goalId;
  location.hash = '#goal';

  try {
    const { data: g } = await apiFetch(`/api/goals/${goalId}`);
    const areas = g.areas || [];

    $('#goalTitle').textContent = g.title;
    const breadcrumb = $('#goalBreadcrumbName');
    if (breadcrumb) breadcrumb.textContent = g.title;
    $('#goalWhy').textContent = g.reason || g.description || '';
    $('#goalDeleteBtn').hidden = false;

    $('#goalCount').textContent = 'A focused set of AI-suggested videos and articles for this learning direction.';

    // Recommendations for this goal — fetch if not yet loaded
    const recsSection = $('#goalRecsSection');
    const recsGrid = $('#goalRecsGrid');
    if (recsSection && recsGrid) {
      let goalRecommendationData = [];
      try {
        const { data: recs } = await apiFetch(`/api/recommendations?goal_id=${encodeURIComponent(goalId)}`);
        goalRecommendationData = recs || [];
      } catch (_) { /* suggestions are unavailable until AI is configured */ }
      const goalRecs = goalRecommendationData
        .map(recToCard)
        .slice(0, 6);
      if (goalRecs.length > 0) {
        recsGrid.innerHTML = goalRecs.map(r => card(r, { rec: true })).join('');
        recsSection.hidden = false;
      } else {
        recsGrid.innerHTML = '<p class="goals-empty">Suggested resources are being prepared for this goal.</p>';
        recsSection.hidden = false;
      }
    }
  } catch (err) {
    console.error('openGoalDetail failed:', err.message);
    toast('Could not load goal detail');
  }
}

/* ── Delete goal ── */
$('#goalDeleteBtn')?.addEventListener('click', async () => {
  if (!_currentGoalId) return;
  const g = _liveGoals.find(x => x.id === _currentGoalId);
  if (!confirm(`Delete "${g?.title || 'this goal'}"? Resources won't be deleted.`)) return;
  try {
    await apiFetch(`/api/goals/${_currentGoalId}`, { method: 'DELETE' });
    location.hash = '#discover';
    setDiscoverTab('goals');
    await loadGoals();
    toast('Goal deleted');
  } catch {
    toast('Could not delete goal — try again');
  }
});

/* ── Suggestion actions (delegated) ── */
document.addEventListener('click', async (e) => {
  const start = e.target.closest('[data-start-goal]');
  if (start) {
    const existing = _liveGoals.find(goal => goal.title === start.dataset.startGoal);
    if (existing) {
      startedGoalIds.add(existing.id);
      persistStartedGoals();
      renderGoals();
      renderSuggestions();
      toast('Added to Your goals.');
    } else {
      const suggestion = SUGGESTED_GOALS.find(goal => goal.title === start.dataset.startGoal);
      if (suggestion) await createGoalFromData(suggestion, { openDetail: false, message: 'Added to Your goals.' });
    }
    return;
  }
  const mk = e.target.closest('[data-make-goal]');
  if (mk) {
    const s = SUGGESTED_GOALS.find((x) => x.title === mk.dataset.makeGoal);
    if (s) await createGoalFromData({ ...s });
  }
  const sk = e.target.closest('[data-skip-goal]');
  if (sk) {
    dismissedSuggestions.add(sk.dataset.skipGoal);
    persistDismissed();
    renderSuggestions();
    toast('Kept in the background');
  }
});

/* ── Create goal dialog — name + keywords → areas → POST /api/goals ── */
$$('[data-create-goal]').forEach((b) => b.addEventListener('click', () => {
  showStep(goalDialog, 'ask'); $('#goalForm').reset(); goalDialog.showModal();
  setTimeout(() => $('#goalName').focus(), 50);
}));

let goalDraft = null;
$('#goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#goalName').value.trim() || 'Untitled goal';
  const raw  = $('#goalKeywords').value.trim();
  const kw   = raw.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);

  // Match keywords against library resources to infer areas
  const hay = (r) => `${r.title} ${r.by} ${(r.topics || []).join(' ')} ${(r.covers || []).join(' ')}`.toLowerCase();
  let matched = RESOURCES.filter((r) => kw.length && kw.some((k) => hay(r).includes(k)));
  if (!matched.length) matched = RESOURCES.filter((r) => r.topics.some((t) => /ux|agent|eval|product|design/i.test(t)));
  const areas = [...new Set(matched.flatMap((r) => r.topics))].slice(0, 6);
  const suggested = matched.slice(0, 4);

  goalDraft = {
    title: name,
    why: raw ? `You want to get better at: ${raw}.` : 'A direction you set for yourself.',
    areas: areas.length ? areas : ['AI fundamentals', 'AI UX', 'AI agents'],
  };

  $('#goalDraftTitle').textContent = name;
  $('#draftAreas').innerHTML = goalDraft.areas.map((a) => `<li>${a}</li>`).join('');
  $('#draftResources').innerHTML = suggested.length
    ? suggested.map((r) => `
        <div class="draft-res" data-card="${registerCard(r)}" role="button" tabindex="0">
          <span class="dr-type">${TYPE_LABEL[r.type]}</span>
          <span class="dr-title">${r.title}</span>
          <span class="dr-by">${r.by}</span>
        </div>`).join('')
    : '<p class="sheet-lede">No saved resources match yet — add some from Discover.</p>';
  showStep(goalDialog, 'structure');
});

$('[data-goal-edit]').addEventListener('click', () => showStep(goalDialog, 'ask'));
$('#confirmGoal').addEventListener('click', () => goalDraft && createGoalFromData(goalDraft));

/* ---------- misc ---------- */
$$('.sheet-close').forEach((b) => { const d = b.closest('dialog'); if (d) b.addEventListener('click', () => d.close()); });
$$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
// Escape for dialogs is handled natively by the browser for <dialog> elements

// Flush session timer when the detail dialog closes, then refresh analytics
detailDialog.addEventListener('close', () => {
  flushSessionTime().then(() => loadAnalytics());
});

/* ---------- welcome ---------- */
const welcome = $('.welcome-dialog');
function dismissWelcome(){ try { localStorage.setItem('le-welcomed', '1'); } catch {} if (welcome.open) welcome.close(); }
$('[data-welcome-dismiss]').addEventListener('click', dismissWelcome);
if (welcome) welcome.addEventListener('click', e => { if (e.target === welcome) dismissWelcome(); });
let welcomed;
try { welcomed = localStorage.getItem('le-welcomed'); } catch {}
if (!welcomed) welcome.showModal();

/* ---------- analytics ---------- */

function fmtSeconds(s) {
  if (!s || s < 60) return s > 0 ? `${s}s` : '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

async function loadAnalytics() {
  try {
    const [{ data: summary }, { data: weekly }, { data: topics, insight }] = await Promise.all([
      apiFetch('/api/analytics'),
      apiFetch('/api/analytics/weekly'),
      apiFetch('/api/analytics/topics'),
    ]);

    const insightsEl = $('#learnInsights');

    // Single primary metric — actual learning time from activity events
    const weekTime = fmtSeconds(summary.week_seconds);
    $('#liStatTime').querySelector('.li-val').textContent = weekTime || '0m';

    // Only show the insights block if there's any activity
    const hasActivity = summary.total_resources > 0;
    insightsEl.hidden = !hasActivity;
    if (!hasActivity) return;

    // Weekly bar chart
    const maxSec = Math.max(...weekly.map(d => d.seconds), 1);
    const hasWeekActivity = weekly.some(d => d.seconds > 0);
    if (hasWeekActivity) {
      const barsEl = $('#liBars');
      barsEl.innerHTML = weekly.map(d => {
        const heightPct = Math.round((d.seconds / maxSec) * 100);
        const label = fmtSeconds(d.seconds);
        const isToday = d.date === new Date().toISOString().slice(0, 10);
        const hasTime = d.seconds > 0;
        const stateClass = hasTime ? ' li-bar--active' : ' li-bar--empty';
        return `
          <div class="li-bar${stateClass}${isToday ? ' li-bar--today' : ''}" title="${d.day}: ${label}" role="img" aria-label="${d.day}: ${label} studied">
            <span class="li-bar-fill" style="height:${Math.max(heightPct, 2)}%"></span>
            <span class="li-bar-day">${isToday ? 'Today' : d.day}</span>
            <span class="li-bar-time">${hasTime ? label : ''}</span>
          </div>`;
      }).join('');
      $('#liChart').hidden = false;
    }

    // Insight sentence
    if (insight) {
      $('#liInsight').textContent = insight;
      $('#liInsight').hidden = false;
    }
  } catch (err) {
    console.warn('loadAnalytics failed:', err.message);
  }
}

/* ---------- boot ---------- */
setView(location.hash.slice(1) || 'learning');
// Load preferences first so _prefs is available for weekly focus
apiFetch('/api/preferences').then(({ data }) => { _prefs = data; }).catch(() => {});
loadResources();
loadAnalytics();
loadGoals();
