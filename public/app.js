/* ── State ──────────────────────────────────────────── */
const state = {
  genres: [], tags: [], sorts: [],
  browse: { favs: false, hist: false, genreId: '', tagId: '', sort: '', q: '', type: '', page: 1, total: 0 },
  manga: null,         // current manga detail
  chapters: [],        // current manga chapters
  reader: {            // current reader session
    mangaId: '',
    chapterId: '',
    index: 0,          // index in chapters array
    page: 0,
    images: [],
    mode: localStorage.getItem('readerMode') || 'scroll',
    busy: false, loaded: 0, auto: true,  // 'scroll' | 'page'
  },
};

/* ── DOM refs ───────────────────────────────────────── */
const $ = id => document.getElementById(id);
const browseView  = $('browseView');
const detailView  = $('detailView');
const readerView  = $('readerView');
const spinner     = $('spinner');
const backBtn     = $('backBtn');
const topTitle    = $('topTitle');
const grid        = $('grid');
const pagination  = $('pagination');
const genreSelect = $('genreSelect');
const tagSelect   = $('tagSelect');
const sortSelect  = $('sortSelect');
const typeFilter  = $('typeFilter');
const searchInput = $('searchInput');
const readerPages = $('readerPages');
const readerNav   = $('readerNav');
const pageCounter = $('pageCounter');

/* ── Utilities ──────────────────────────────────────── */
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function proxyImg(url) {
  return '/api/image?url=' + encodeURIComponent(url);
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const readSet  = id => new Set(store.get('read:' + id, []));
function markRead(mangaId, chapterId) {
  const s = readSet(mangaId); s.add(chapterId);
  store.set('read:' + mangaId, [...s]);
}
const getFavs = () => store.get('favs', {});
function toggleFav(m) {
  const f = getFavs();
  if (f[m.id]) delete f[m.id]; else f[m.id] = { id: m.id, title: m.title, poster: m.poster, type: m.type };
  store.set('favs', f);
  return !!f[m.id];
}

const getHist = () => store.get('history', {});
function saveHist(m, ch) {
  const h = getHist();
  h[m.id] = { id: m.id, title: m.title, poster: m.poster, type: m.type, chapterId: ch.id, number: ch.number, ts: Date.now() };
  store.set('history', h);
  paintResume();
}
const lastHist = () => Object.values(getHist()).sort((x, y) => y.ts - x.ts)[0];
function paintResume() {
  const l = lastHist(), b = $('resumeBtn');
  b.disabled = !l;
  b.textContent = l ? `▶ Continue: ${l.title} · Ch. ${l.number}` : '▶ Continue (nothing yet)';
}
async function resumeLast() {
  const l = lastHist();
  if (!l) return;
  showSpinner(true);
  try {
    const m = await api(`/api/manga/${l.id}`);
    state.manga = m; state.chapters = m.chapters;
    const idx = m.chapters.findIndex(c => c.id === l.chapterId);
    const i = idx >= 0 ? idx : 0;
    await openReader(l.id, m.chapters[i].id, i);
  } catch (e) {
    alert('Error: ' + e.message);
    showSpinner(false);
  }
}

state.reader.auto = store.get('autoNext', true);
function completeChapter() {
  const r = state.reader;
  if (r.done || !r.mangaId) return;
  r.done = true;
  markRead(r.mangaId, r.chapterId);
}
function checkEnd() {
  const r = state.reader;
  if (document.body.dataset.view !== 'reader' || r.busy || r.mode !== 'scroll') return;
  // every page loaded and the user actually scrolled to the bottom
  if (!r.images.length || r.loaded < r.images.length || window.scrollY < 50) return;
  if ($('readerEnd').getBoundingClientRect().top > window.innerHeight + 200) return;
  completeChapter();
  if (r.auto) nextChapter();
}
function nextChapter() {
  const r = state.reader;
  if (r.busy) return false;
  const idx = r.index - 1;            // list is newest-first, so -1 = next chapter
  if (idx < 0) return false;
  openReader(r.mangaId, state.chapters[idx].id, idx);
  return true;
}
function paintAuto() { $('autoBtn').textContent = state.reader.auto ? 'Auto ✓' : 'Auto ✗'; }

const getProg = () => store.get('prog', {});
function recordProg(mangaId, ch, pages) {
  if (!ch || !ch.scanId || !pages) return;
  const p = getProg();
  p[ch.id] = { mangaId, chapterId: ch.id, scanId: ch.scanId, pages, ts: Date.now() };
  store.set('prog', p);
}
function buildExport() {
  const hist = getHist(), favs = getFavs(), bm = [];
  Object.values(hist).forEach(h => bm.push({ mangaId: h.id, status: 'Reading', synced: false, ts: h.ts, type: h.type || 'Manga' }));
  Object.values(favs).forEach(f => { if (!hist[f.id]) bm.push({ mangaId: f.id, status: 'PlanToRead', synced: false, ts: Date.now(), type: f.type || 'Manga' }); });
  const real = getProg(), out = {};
  let t = Date.now();
  Object.keys(hist).forEach(id => {
    const chaps = store.get('chaps:' + id, []);
    const done = readSet(id);
    const reached = chaps.filter(c => done.has(c.id)).map(c => c.number);
    if (!reached.length) return;
    const max = Math.max(...reached);
    // every chapter from the first up to the furthest one reached counts as read
    chaps.filter(c => c.number <= max && c.scanId).sort((x, y) => x.number - y.number).forEach(c => {
      const pages = (real[c.id] && real[c.id].pages) || c.pageCount || 1;
      out[c.id] = { mangaScanlationId: c.scanId, mangaId: id, chapterId: c.id,
        page: Math.max(0, pages - 1), frac: 1, pages, ts: t++, strip: false };
    });
  });
  // chapters read from other manga not in history (safety net)
  Object.values(real).forEach(p => { if (!out[p.chapterId]) out[p.chapterId] = {
    mangaScanlationId: p.scanId, mangaId: p.mangaId, chapterId: p.chapterId,
    page: Math.max(0, p.pages - 1), frac: 1, pages: p.pages, ts: p.ts, strip: false }; });
  const progress = Object.values(out);
  return { bookmarks: bm, progress };
}
// Runs INSIDE atsu.moe (your logged-in tab). Cookies never leave the browser.
const bookmarkletFn = async () => {
  try {
    let t;
    try { t = await navigator.clipboard.readText(); } catch (e) { t = prompt('Paste the export JSON'); }
    const d = JSON.parse(t);
    const post = async (path, body) => {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      return { s: r.status, t: (await r.text()).slice(0, 120) };
    };
    const bs = [], ps = [];
    for (let i = 0; i < d.bookmarks.length; i += 10) bs.push(await post('/api/user/syncBookmarks', d.bookmarks.slice(i, i + 10)));
    for (let i = 0; i < d.progress.length; i += 50) ps.push(await post('/api/read/syncProgress', { progress: d.progress.slice(i, i + 50), deletedChapters: [] }));
    let info = '';
    try {
      const id = d.progress[0].mangaId;
      const j = await (await fetch('/api/manga/page?id=' + id, { credentials: 'include' })).json();
      const mp = j.mangaPage || j;
      const hit = Object.keys(mp).filter(k => /read|progress|continue|bookmark/i.test(k));
      info = '\nPAGE KEYS: ' + hit.map(k => k + '=' + JSON.stringify(mp[k]).slice(0, 160)).join(' ; ');
    } catch (e) { info = '\nPAGE CHECK FAILED: ' + e.message; }
    try {
      const id = d.progress[0].mangaId, cid = d.progress[0].chapterId;
      const cj = await (await fetch('/api/manga/allChapters?mangaId=' + id, { credentials: 'include' })).json();
      const list = cj.chapters || cj;
      const mine = list.find(c => c.id === cid) || list[0];
      info += '\nCHAPTER KEYS: ' + Object.keys(mine).join(',') + '\nTOP-LEVEL: ' + Object.keys(cj).join(',');
      const withP = list.filter(c => c.progress).slice(0, 4).map(c => {
        const p = Object.assign({}, c.progress); delete p.mangaScanlationId; delete p.mangaId;
        return 'ch' + c.number + ' ' + JSON.stringify(p);
      });
      info += '\nPROGRESS: ' + (withP.join(' ; ') || 'none');
    } catch (e) { info += '\nCHAPTERS CHECK FAILED: ' + e.message; }
    alert('Bookmarks: ' + d.bookmarks.length + ' [' + bs.map(x => x.s).join(',') + '] ' + (bs[0] ? bs[0].t : '') +
      '\nProgress: ' + d.progress.length + ' [' + ps.map(x => x.s).join(',') + '] ' + (ps[0] ? ps[0].t : '') + info);
  } catch (e) { alert('Sync error: ' + e.message); }
};
const BOOKMARKLET = 'javascript:(' + bookmarkletFn.toString().replace(/\s+/g, ' ') + ')()';

function showSpinner(v) { spinner.classList.toggle('hidden', !v); }

function setView(name) {
  browseView.classList.toggle('active', name === 'browse');
  detailView.classList.toggle('active', name === 'detail');
  readerView.classList.toggle('active', name === 'reader');
  backBtn.classList.toggle('hidden', name === 'browse');
  topTitle.textContent = name === 'browse' ? 'Chap Reader' : '';
  document.body.dataset.view = name;
  if (name !== 'reader') $('searchForm').classList.remove('hidden');
  else $('searchForm').classList.add('hidden');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

/* ── Init ───────────────────────────────────────────── */
async function init() {
  showSpinner(true);
  try {
    const meta = await api('/api/meta');
    state.genres = meta.genres;
    state.tags   = meta.tags;
    state.sorts  = meta.sorts;

    // Populate selects
    state.genres.forEach(g => {
      genreSelect.insertAdjacentHTML('beforeend', `<option value="${g.id}">${g.name}</option>`);
    });
    state.tags.forEach(t => {
      tagSelect.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.name}</option>`);
    });
    state.sorts.forEach(s => {
      sortSelect.insertAdjacentHTML('beforeend', `<option value="${s.value}">${s.label}</option>`);
    });
    state.browse.sort = state.sorts[0].value;
    // Single locked genre: hide the genre/tag pickers
    if (state.genres.length === 1) {
      genreSelect.closest('section').classList.add('hidden');
      tagSelect.closest('section').classList.add('hidden');
    }

    await loadBrowse();
  } catch (e) {
    grid.innerHTML = `<p style="color:#f66;padding:16px">Error: ${e.message}</p>`;
  } finally {
    showSpinner(false);
  }
}

/* ── Browse ─────────────────────────────────────────── */
async function loadBrowse(resetPage = false) {
  if (resetPage) state.browse.page = 1;
  grid.innerHTML = '';
  if (state.browse.favs || state.browse.hist) {
    pagination.classList.add('hidden');
    const list = state.browse.hist
      ? Object.values(getHist()).sort((x, y) => y.ts - x.ts)
      : Object.values(getFavs());
    if (!list.length) grid.innerHTML = '<p style="padding:16px;color:var(--muted)">Nothing here yet.</p>';
    list.forEach(m => grid.insertAdjacentHTML('beforeend', mangaCard(m)));
    grid.querySelectorAll('.manga-card').forEach(c => c.addEventListener('click', () => loadDetail(c.dataset.id)));
    return;
  }
  showSpinner(true);
  try {
    const b = state.browse;
    let url = `/api/browse?page=${b.page}&sort=${encodeURIComponent(b.sort)}`;
    if (b.genreId) url += `&genreId=${b.genreId}`;
    if (b.tagId)   url += `&tagId=${b.tagId}`;
    if (b.q)       url += `&q=${encodeURIComponent(b.q)}`;

    const data = await api(url);
    state.browse.total = data.total;

    // Type filter client-side
    const hits = b.type ? data.hits.filter(h => h.type === b.type) : data.hits;

    if (!hits.length) {
      grid.innerHTML = '<p style="padding:16px;color:var(--muted)">No results found.</p>';
    } else {
      hits.forEach(m => grid.insertAdjacentHTML('beforeend', mangaCard(m)));
      grid.querySelectorAll('.manga-card').forEach(card => {
        card.addEventListener('click', () => loadDetail(card.dataset.id));
      });
    }

    // Pagination
    const totalPages = Math.ceil(data.total / 40);
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      $('prevPage').disabled = b.page <= 1;
      $('nextPage').disabled = b.page >= totalPages;
      $('pageInfo').textContent = `Page ${b.page} / ${totalPages}`;
    } else {
      pagination.classList.add('hidden');
    }
  } catch (e) {
    grid.innerHTML = `<p style="color:#f66;padding:16px">Error: ${e.message}</p>`;
  } finally {
    showSpinner(false);
  }
}

function mangaCard(m) {
  const img = m.poster ? proxyImg(m.poster) : '';
  const type = m.type || '';
  const ch = m.chapterCount ? `${m.chapterCount} ch` : '';
  return `<div class="manga-card" data-id="${m.id}">
    <img src="${img}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="card-info">
      <div class="card-title">${m.title || 'Unknown'}</div>
      <div class="card-meta">${[type, ch].filter(Boolean).join(' · ')}</div>
    </div>
  </div>`;
}

/* ── Detail ─────────────────────────────────────────── */
async function loadDetail(mangaId) {
  setView('detail');
  showSpinner(true);
  $('chapterList').innerHTML = '';
  try {
    const m = await api(`/api/manga/${mangaId}`);
    state.manga = m;
    state.chapters = m.chapters;

    topTitle.textContent = m.title;
    $('detailPoster').src = m.poster ? proxyImg(m.poster) : '';
    $('detailTitle').textContent = m.title;
    $('detailAlt').textContent = m.altTitle && m.altTitle !== m.title ? m.altTitle : '';
    $('detailSynopsis').textContent = m.synopsis || '';
    $('detailAuthors').textContent = m.authors.length ? 'By ' + m.authors.join(', ') : '';

    const badges = [
      m.type   && `<span class="badge type">${m.type}</span>`,
      m.status && `<span class="badge status">${m.status}</span>`,
      m.rating && `<span class="badge">★ ${Number(m.rating).toFixed(1)}</span>`,
      ...m.genres.map(g => `<span class="badge">${g}</span>`),
    ].filter(Boolean).join('');
    $('detailBadges').innerHTML = badges;

    const done = readSet(mangaId);
    const actions = $('detailActions');
    actions.innerHTML = '';
    const favBtn = document.createElement('button');
    const paintFav = on => { favBtn.textContent = on ? '★ In favorites' : '☆ Add to favorites'; };
    paintFav(!!getFavs()[m.id]);
    favBtn.onclick = () => paintFav(toggleFav(m));
    actions.appendChild(favBtn);
    // Continue = oldest chapter not yet read (list is newest-first)
    const next = [...m.chapters].reverse().find(c => !done.has(c.id)) || m.chapters[0];
    if (next) {
      const cont = document.createElement('button');
      cont.textContent = done.size ? `▶ Continue (Ch. ${next.number})` : `▶ Start (Ch. ${next.number})`;
      cont.onclick = () => openReader(mangaId, next.id, m.chapters.indexOf(next));
      actions.appendChild(cont);
    }

    $('chapterHeading').textContent = `Chapters (${m.chapters.length})`;

    m.chapters.forEach((ch, idx) => {
      const li = document.createElement('li');
      const chTitle = ch.title && ch.title !== `Chapter ${ch.number}` ? ch.title : '';
      if (done.has(ch.id)) li.classList.add('read');
      li.innerHTML = `<a href="#" data-idx="${idx}">
        <span class="ch-num">${done.has(ch.id) ? '✓ ' : ''}Ch. ${ch.number}</span>
        <span class="ch-title">${chTitle}</span>
        <span class="ch-date">${formatDate(ch.createdAt)}</span>
      </a>`;
      li.querySelector('a').addEventListener('click', e => {
        e.preventDefault();
        openReader(mangaId, ch.id, idx);
      });
      $('chapterList').appendChild(li);
    });
  } catch (e) {
    $('detailContent').innerHTML = `<p style="color:#f66;padding:16px">Error: ${e.message}</p>`;
  } finally {
    showSpinner(false);
  }
}

/* ── Reader ─────────────────────────────────────────── */
async function openReader(mangaId, chapterId, chapterIndex) {
  setView('reader');
  showSpinner(true);
  readerPages.innerHTML = '';

  state.reader.busy = true; state.reader.loaded = 0;
  store.set('chaps:' + mangaId, state.chapters.map(c => ({ id: c.id, number: c.number, scanId: c.scanId, pageCount: c.pageCount || 0 })));
  state.reader.done = false;
  if (state.manga && state.chapters[chapterIndex]) saveHist(state.manga, state.chapters[chapterIndex]);
  state.reader.mangaId    = mangaId;
  state.reader.chapterId  = chapterId;
  state.reader.index      = chapterIndex;
  state.reader.page       = 0;
  state.reader.images     = [];

  const ch = state.chapters[chapterIndex];
  $('readerTitle').textContent = `${state.manga?.title || ''} · Ch. ${ch?.number}`;

  // Prev / Next chapter buttons
  $('prevChapBtn').disabled = chapterIndex >= state.chapters.length - 1;
  $('nextChapBtn').disabled = chapterIndex <= 0;
  $('readerProgress').textContent = `${chapterIndex + 1} / ${state.chapters.length}`;

  applyReaderMode();

  try {
    const data = await api(`/api/chapter/${mangaId}/${chapterId}`);
    state.reader.images = data.images;
    recordProg(mangaId, ch, data.images.length);

    data.images.forEach((url, i) => {
      const img = document.createElement('img');
      img.dataset.index = i;
      img.loading = 'lazy';
      img.alt = `Page ${i + 1}`;
      img.src = proxyImg(url);
      img.onload = () => { state.reader.loaded++; checkEnd(); };
      img.onerror = () => { state.reader.loaded++; img.style.opacity = '.3'; checkEnd(); };
      readerPages.appendChild(img);
    });

    if (state.reader.mode === 'page') {
      goToPage(0);
    }
  } catch (e) {
    readerPages.innerHTML = `<p style="color:#f66;padding:24px">Error: ${e.message}</p>`;
  } finally {
    state.reader.busy = false;
    showSpinner(false);
    window.scrollTo(0, 0);
  }
}

function applyReaderMode() {
  const isPage = state.reader.mode === 'page';
  readerPages.classList.toggle('page-mode', isPage);
  readerNav.classList.toggle('hidden', !isPage);
  $('modeBtn').title = isPage ? 'Switch to Scroll' : 'Switch to Page';
  $('modeBtn').textContent = isPage ? '☰' : '⇕';
}

function goToPage(n) {
  const imgs = readerPages.querySelectorAll('img');
  if (!imgs.length) return;
  n = Math.max(0, Math.min(n, imgs.length - 1));
  state.reader.page = n;
  imgs.forEach((img, i) => img.classList.toggle('hidden', i !== n));
  pageCounter.textContent = `${n + 1} / ${imgs.length}`;
  if (n === imgs.length - 1) completeChapter();
  $('prevPageBtn').disabled = n === 0;
  $('nextPageBtn').disabled = n === imgs.length - 1 && !state.reader.auto;
  window.scrollTo(0, 0);
}

/* ── Event listeners ────────────────────────────────── */

// Filters
genreSelect.addEventListener('change', () => { state.browse.genreId = genreSelect.value; loadBrowse(true); });
tagSelect.addEventListener('change',   () => { state.browse.tagId   = tagSelect.value;   loadBrowse(true); });
sortSelect.addEventListener('change',  () => { state.browse.sort    = sortSelect.value;  loadBrowse(true); });

typeFilter.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    typeFilter.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.browse.type = chip.dataset.type;
    loadBrowse(true);
  });
});

// Search
$('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  state.browse.q = searchInput.value.trim();
  loadBrowse(true);
});
searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) { state.browse.q = ''; loadBrowse(true); }
});

// Pagination
$('prevPage').addEventListener('click', () => { state.browse.page--; loadBrowse(); });
$('nextPage').addEventListener('click', () => { state.browse.page++; loadBrowse(); });

// Back button
backBtn.addEventListener('click', () => {
  const v = document.body.dataset.view;
  if (v === 'reader') setView('detail');
  else                setView('browse');
});

// Reader prev/next chapter
$('prevChapBtn').addEventListener('click', () => {
  const idx = state.reader.index + 1;  // chapters sorted desc, so +1 = older
  if (idx < state.chapters.length) {
    const ch = state.chapters[idx];
    openReader(state.reader.mangaId, ch.id, idx);
  }
});
$('nextChapBtn').addEventListener('click', () => {
  const idx = state.reader.index - 1;  // -1 = newer
  if (idx >= 0) {
    const ch = state.chapters[idx];
    openReader(state.reader.mangaId, ch.id, idx);
  }
});

// Reader back
$('readerBack').addEventListener('click', () => setView('detail'));

// Mode toggle
$('modeBtn').addEventListener('click', () => {
  state.reader.mode = state.reader.mode === 'scroll' ? 'page' : 'scroll';
  localStorage.setItem('readerMode', state.reader.mode);
  applyReaderMode();
  if (state.reader.mode === 'page') goToPage(0);
  else readerPages.querySelectorAll('img').forEach(i => i.classList.remove('hidden'));
});

// Page nav
$('prevPageBtn').addEventListener('click', () => goToPage(state.reader.page - 1));
$('nextPageBtn').addEventListener('click', () => {
  const total = readerPages.querySelectorAll('img').length;
  if (state.reader.page >= total - 1) { if (state.reader.auto) nextChapter(); }
  else goToPage(state.reader.page + 1);
});

// Keyboard
document.addEventListener('keydown', e => {
  if (document.body.dataset.view !== 'reader') return;
  if (state.reader.mode === 'page') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      goToPage(state.reader.page + dir);
    }
  }
  if (e.key === 'Escape') setView('detail');
});

/* ── Bootstrap ──────────────────────────────────────── */
init();

function setListMode(mode) {
  const b = state.browse;
  b.favs = mode === 'favs' ? !b.favs : false;
  b.hist = mode === 'hist' ? !b.hist : false;
  $('favBtn').classList.toggle('active', b.favs);
  $('histBtn').classList.toggle('active', b.hist);
  setView('browse');
  loadBrowse(true);
}
$('favBtn').addEventListener('click',  () => setListMode('favs'));
$('histBtn').addEventListener('click', () => setListMode('hist'));
$('resumeBtn').addEventListener('click', resumeLast);
paintResume();

$('autoBtn').addEventListener('click', () => {
  state.reader.auto = !state.reader.auto;
  store.set('autoNext', state.reader.auto);
  paintAuto();
});
paintAuto();
new IntersectionObserver(entries => { if (entries[0].isIntersecting) checkEnd(); }, { rootMargin: '0px 0px 200px 0px' }).observe($('readerEnd'));

$('syncBtn').addEventListener('click', () => {
  const e = buildExport();
  $('exportInfo').textContent = `${e.bookmarks.length} manga · ${e.progress.length} chapters`;
  $('syncDlg').showModal();
});
const copy = async (txt, btn) => {
  try { await navigator.clipboard.writeText(txt); const o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => btn.textContent = o, 1500); }
  catch { prompt('Copy this:', txt); }
};
$('copyExport').addEventListener('click', e => copy(JSON.stringify(buildExport()), e.target));
$('copyBm').addEventListener('click', e => copy(BOOKMARKLET, e.target));
$('closeSync').addEventListener('click', () => $('syncDlg').close());
