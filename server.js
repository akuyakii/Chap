const express = require('express');
const path = require('path');

const app = express();
const BASE = 'https://atsu.moe';
const CDN  = 'https://cdn.atsu.moe';
const PORT = 3000;
// Locked to Romance only (genre id 9). Override with GENRE_ID=... npm start
const LOCKED_GENRE = process.env.GENRE_ID || '9';

// ─── Helpers ────────────────────────────────────────────────────────────────

const HEADERS = {
  'Accept': '*/*',
  'Referer': 'https://atsu.moe/',
  'Origin': 'https://atsu.moe',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Google Chrome";v="131","Chromium";v="131"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

async function atsuFetch(urlPath, params = {}) {
  const url = new URL(BASE + urlPath);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: HEADERS });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function cdnUrl(imgPath) {
  // The API sometimes returns an object ({ image: '...' }) instead of a string
  if (imgPath && typeof imgPath === 'object') {
    imgPath = imgPath.image || imgPath.path || imgPath.url || imgPath.src || '';
  }
  if (typeof imgPath !== 'string' || !imgPath) return '';
  if (imgPath.startsWith('http')) return imgPath;
  const p = imgPath.startsWith('/') ? imgPath : '/' + imgPath;
  if (!p.startsWith('/static/')) return CDN + '/static' + p;
  return CDN + p;
}

// ─── Genre / Tag lists ───────────────────────────────────────────────────────

const GENRES = [
  { id: 1,  name: 'Sci-Fi' },
  { id: 6,  name: 'Comedy' },
  { id: 7,  name: 'Slice of Life' },
  { id: 9,  name: 'Romance' },
  { id: 22, name: 'Supernatural' },
  { id: 31, name: 'Drama' },
  { id: 32, name: 'Mystery' },
  { id: 36, name: 'Fantasy' },
  { id: 37, name: 'Adventure' },
  { id: 39, name: 'Action' },
  { id: 44, name: 'Horror' },
  { id: 48, name: 'Sports' },
  { id: 50, name: 'Psychological' },
  { id: 54, name: 'Martial Arts' },
];

const TAGS = [
  { id: 20, name: 'Harem' },
  { id: 94, name: 'Isekai' },
  { id: 2,  name: 'School Life' },
];

const SORTS = [
  { value: 'views:desc',       label: 'Most Viewed' },
  { value: 'trending:desc',    label: 'Trending' },
  { value: 'dateAdded:desc',   label: 'Newest' },
  { value: 'avgRating:desc',   label: 'Top Rated' },
  { value: 'released:desc',    label: 'Recently Released' },
];

// ─── Static files ────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ─── API: Genres/Tags ────────────────────────────────────────────────────────

app.get('/api/meta', (_req, res) => {
  res.json({ genres: GENRES.filter(g => String(g.id) === LOCKED_GENRE), tags: [], sorts: SORTS, locked: true });
});

// ─── API: Browse (Typesense search) ──────────────────────────────────────────

app.get('/api/browse', async (req, res) => {
  try {
    const { sort = 'views:desc', page = 1, q = '*' } = req.query;
    const genreId = LOCKED_GENRE, tagId = '';

    const filters = [
      `hidden:!=true`,
      `views:>0`,
      `isAdult:=false`,
    ];
    if (genreId) filters.push(`genreIds:=\`${genreId}\``);
    if (tagId)   filters.push(`tagIds:=\`${tagId}\``);

    const params = {
      q,
      filter_by: filters.join(' && '),
      sort_by: sort,
      page,
      per_page: 40,
    };
    if (q !== '*') {
      params.query_by = 'title,englishTitle,otherNames';
      params.query_by_weights = '4,3,1';
      params.num_typos = '4,3,1';
    }

    const data = await atsuFetch('/collections/manga/documents/search', params);
    const hits = (data.hits || []).map(h => {
      const d = h.document;
      return {
        id:           d.id,
        title:        d.englishTitle || d.title,
        poster:       cdnUrl(d.poster || d.posterMedium || d.image),
        type:         d.type,
        status:       d.status,
        rating:       d.avgRating,
        views:        d.views,
        chapterCount: d.chapterCount,
      };
    });

    res.json({ hits, total: data.found || 0, page: Number(page) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Manga detail + chapters ─────────────────────────────────────────────

app.get('/api/manga/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [pageRes, chapRes] = await Promise.all([
      atsuFetch('/api/manga/page', { id }),
      atsuFetch('/api/manga/allChapters', { mangaId: id }),
    ]);

    const m = pageRes.mangaPage || pageRes;
    const rawChapters = chapRes.chapters || (Array.isArray(chapRes) ? chapRes : []);

    res.json({
      id,
      title:    m.englishTitle || m.title,
      altTitle: m.title,
      poster:   cdnUrl(m.poster || m.posterMedium || m.image),
      type:     m.type,
      status:   m.status,
      synopsis: m.synopsis,
      rating:   m.avgRating,
      genres:   (m.genres  || []).map(g => g.name || g),
      tags:     (m.tags    || []).map(t => t.name || t),
      authors:  (m.authors || []).map(a => a.name || a),
      chapters: rawChapters
        .map(c => ({ id: c.id, title: c.title, number: Number(c.number), createdAt: c.createdAt, scanId: c.scanlationMangaId, pageCount: c.pageCount || c.pages || 0 }))
        .sort((a, b) => b.number - a.number),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Chapter pages ───────────────────────────────────────────────────────

app.get('/api/chapter/:mangaId/:chapterId', async (req, res) => {
  try {
    const { mangaId, chapterId } = req.params;
    const data = await atsuFetch('/api/read/chapter', { mangaId, chapterId });
    const pages = (data.readChapter && data.readChapter.pages) || data.pages || [];
    const images = pages.map(p => cdnUrl(p.image));
    res.json({ images, total: images.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Image proxy (bypass browser CORS) ───────────────────────────────────

app.get('/api/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).end('missing url');
    const decoded = decodeURIComponent(url);
    if (!decoded.startsWith('https://cdn.atsu.moe/') && !decoded.startsWith('https://atsu.moe/')) {
      return res.status(403).end('forbidden');
    }
    const r = await fetch(decoded, {
      headers: { ...HEADERS, Accept: 'image/avif,image/webp,image/*,*/*' },
    });
    if (!r.ok) return res.status(r.status).end();
    const buf = await r.arrayBuffer();
    res.set('Content-Type', r.headers.get('content-type') || 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(502).end();
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n📖  Chap Reader  →  http://localhost:${PORT}\n`);
});
