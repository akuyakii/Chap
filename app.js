const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let book = { chapters: [] };
let current = 0;

function applyPrefs() {
  document.documentElement.dataset.theme = store.get('theme', 'light');
  document.documentElement.style.setProperty('--size', store.get('size', '20') + 'px');
}

async function loadChapter(i) {
  const ch = book.chapters[i];
  if (!ch) return;
  current = i;
  $('chapterTitle').textContent = ch.title;
  $('content').textContent = 'جاري التحميل...';
  try {
    const res = await fetch(ch.file);
    if (!res.ok) throw new Error(res.status);
    $('content').textContent = (await res.text()).trim();
  } catch {
    $('content').textContent = 'تعذر تحميل الفصل.';
  }
  $('prevBtn').disabled = i === 0;
  $('nextBtn').disabled = i === book.chapters.length - 1;
  document.querySelectorAll('#chapterList a').forEach((a, n) => a.classList.toggle('active', n === i));
  store.set('last', ch.id);
  history.replaceState(null, '', '#' + ch.id);
  window.scrollTo(0, 0);
}

function indexFromHash() {
  const id = location.hash.slice(1) || store.get('last', '');
  const i = book.chapters.findIndex((c) => c.id === id);
  return i >= 0 ? i : 0;
}

async function init() {
  applyPrefs();
  const res = await fetch('chapters/index.json');
  book = await res.json();
  document.title = book.title;
  $('bookTitle').textContent = book.title;
  $('chapterList').innerHTML = '';
  book.chapters.forEach((c, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + c.id;
    a.textContent = c.title;
    a.onclick = (e) => { e.preventDefault(); $('sidebar').classList.add('hidden'); loadChapter(i); };
    li.appendChild(a);
    $('chapterList').appendChild(li);
  });
  loadChapter(indexFromHash());
}

$('menuBtn').onclick = () => $('sidebar').classList.toggle('hidden');
$('prevBtn').onclick = () => loadChapter(current - 1);
$('nextBtn').onclick = () => loadChapter(current + 1);
$('themeBtn').onclick = () => { store.set('theme', store.get('theme', 'light') === 'dark' ? 'light' : 'dark'); applyPrefs(); };
$('fontPlus').onclick = () => { store.set('size', Math.min(36, +store.get('size', 20) + 2)); applyPrefs(); };
$('fontMinus').onclick = () => { store.set('size', Math.max(14, +store.get('size', 20) - 2)); applyPrefs(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && current < book.chapters.length - 1) loadChapter(current + 1);
  if (e.key === 'ArrowRight' && current > 0) loadChapter(current - 1);
});

init();
