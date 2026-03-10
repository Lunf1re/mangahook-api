const axios = require('axios');

const MDX = 'https://api.mangadex.org';
const COMICK = 'https://api.comick.fun';

const http = axios.create({ timeout: 15000 });

async function mdx(path) {
  try {
    const r = await http.get(MDX + path);
    return r.data;
  } catch(e) { return null; }
}

async function comick(path) {
  try {
    const r = await http.get(COMICK + path, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://comick.fun/' }
    });
    return r.data;
  } catch(e) { return null; }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
}

// Format MangaDex manga
function fmtMdx(m) {
  if (!m) return null;
  const attr = m.attributes || {};
  const title = (attr.title && (attr.title.en || Object.values(attr.title)[0])) || 'Unknown';
  const desc = (attr.description && (attr.description.en || Object.values(attr.description)[0])) || '';
  const coverId = (m.relationships || []).find(r => r.type === 'cover_art');
  const coverFile = coverId && coverId.attributes && coverId.attributes.fileName;
  const image = coverFile ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg` : '';
  const genres = (attr.tags || []).filter(t => t.attributes && t.attributes.group === 'genre').map(t => t.attributes.name.en || '');
  return {
    id: 'mdx:' + m.id,
    _mdxId: m.id,
    title,
    image,
    description: desc.substring(0, 200),
    status: attr.status || '',
    genres,
    latestChapter: attr.lastChapter || '',
    views: '',
    source: 'MangaDex'
  };
}

// Format ComicK manga
function fmtComick(m) {
  if (!m) return null;
  const md = m.md_comics || m;
  const title = md.title || md.slug || 'Unknown';
  const image = md.cover_url || (md.md_covers && md.md_covers[0] && `https://meo.comick.pictures/${md.md_covers[0].b2key}`) || '';
  const desc = md.desc || md.summary || '';
  const genres = (md.md_comic_md_genres || []).map(g => g.md_genres && g.md_genres.name).filter(Boolean);
  return {
    id: 'ck:' + (md.hid || md.slug),
    _ckHid: md.hid,
    _ckSlug: md.slug,
    title,
    image,
    description: desc.substring(0, 200),
    status: md.status === 1 ? 'ongoing' : md.status === 2 ? 'completed' : '',
    genres,
    latestChapter: md.last_chapter ? String(md.last_chapter) : '',
    views: md.view_count ? String(md.view_count) : '',
    source: 'ComicK'
  };
}

// Deduplicate by title similarity
function dedup(list) {
  const seen = new Map();
  const out = [];
  for (const m of list) {
    const key = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) {
      seen.set(key, true);
      out.push(m);
    }
  }
  return out;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = (req.url || '/').split('?')[0];
  const params = req.query || {};

  try {
    // Health
    if (url === '/') return res.json({ status: 'ok', sources: ['MangaDex', 'ComicK'] });

    // /list?page=1
    if (url === '/list') {
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      const [mdxData, ckData] = await Promise.all([
        mdx(`/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`),
        comick(`/top?page=${page}&accept_erotic_content=true`)
      ]);

      const mdxMangas = ((mdxData && mdxData.data) || []).map(fmtMdx).filter(Boolean);
      const ckMangas = ((Array.isArray(ckData) ? ckData : (ckData && ckData.rank)) || []).map(fmtComick).filter(Boolean);

      const merged = dedup([...mdxMangas, ...ckMangas]);
      const totalPages = Math.ceil(((mdxData && mdxData.total) || 200) / 20);
      return res.json({ mangas: merged, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /search?query=...&page=1
    if (url === '/search') {
      const q = params.query || '';
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;
      if (!q) return res.json({ mangas: [], currentPage: 1, totalPages: 1 });

      const [mdxData, ckData] = await Promise.all([
        mdx(`/manga?limit=20&offset=${offset}&title=${encodeURIComponent(q)}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`),
        comick(`/v1.0/search?q=${encodeURIComponent(q)}&limit=20&page=${page}`)
      ]);

      const mdxMangas = ((mdxData && mdxData.data) || []).map(fmtMdx).filter(Boolean);
      const ckMangas = (Array.isArray(ckData) ? ckData : []).map(fmtComick).filter(Boolean);

      const merged = dedup([...mdxMangas, ...ckMangas]);
      const totalPages = Math.ceil(((mdxData && mdxData.total) || merged.length) / 20);
      return res.json({ mangas: merged, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /genre?genre=action&page=1
    if (url === '/genre') {
      const genre = params.genre || '';
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      const GENRE_IDS = {
        'action': '391b0423-d847-456f-aff0-8b0cfc03066b',
        'adventure': '87cc87cd-a395-47af-b27a-93258283bbc6',
        'comedy': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
        'drama': 'b9af3a63-f058-46de-a9a0-e0c13906197a',
        'fantasy': 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
        'horror': 'cdad7e68-1419-41dd-bdce-27753074a640',
        'mystery': '07251805-a27e-4d59-b488-f0bfbec15168',
        'romance': '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
        'sci-fi': '256c8bd9-4904-4360-bf4f-508a76d67183',
        'slice-of-life': 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
        'sports': '69964a64-2f90-4d33-beeb-107651b6c03a',
        'supernatural': 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
        'thriller': '07251805-a27e-4d59-b488-f0bfbec15168',
        'martial-arts': '799c202e-7daa-44eb-9cf7-8a3c0441531e',
        'historical': '33771934-028e-4cb3-8744-691e866a923e',
        'school-life': 'caaa44eb-cd40-4177-b930-79d3ef2afe87',
        'shounen': '27564bd6-d1af-45b7-bba7-e28b0be0e62a',
        'seinen': 'a3c67850-4684-404e-9b7f-c69850ee5da6',
        'shoujo': '155d0d26-5a7b-43c6-8ab5-9b5e17c76b33',
        'ecchi': '2d1f5d56-a1e5-4d0d-a961-2193588b08ec',
      };

      const CK_GENRES = {
        'action':1,'adventure':2,'comedy':3,'drama':4,'fantasy':5,'horror':6,
        'mystery':7,'romance':8,'sci-fi':9,'slice-of-life':10,'sports':11,
        'supernatural':12,'thriller':13,'martial-arts':14,'historical':15,
        'shounen':16,'seinen':17,'shoujo':18,'ecchi':19,'school-life':20
      };

      let mdxUrl = `/manga?limit=20&offset=${offset}&includes[]=cover_art&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      if (genre && GENRE_IDS[genre]) mdxUrl += `&includedTags[]=${GENRE_IDS[genre]}`;

      let ckUrl = `/v1.0/search?limit=20&page=${page}&sort=follow`;
      if (genre && CK_GENRES[genre]) ckUrl += `&genre=${CK_GENRES[genre]}`;

      const [mdxData, ckData] = await Promise.all([mdx(mdxUrl), comick(ckUrl)]);

      const mdxMangas = ((mdxData && mdxData.data) || []).map(fmtMdx).filter(Boolean);
      const ckMangas = (Array.isArray(ckData) ? ckData : []).map(fmtComick).filter(Boolean);

      const merged = dedup([...mdxMangas, ...ckMangas]);
      const totalPages = Math.ceil(((mdxData && mdxData.total) || 200) / 20);
      return res.json({ mangas: merged, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /manga/:id — works for both mdx:xxx and ck:xxx
    if (url.startsWith('/manga/')) {
      const id = url.replace('/manga/', '');
      const lang = params.lang || 'en';

      if (id.startsWith('mdx:')) {
        const mdxId = id.replace('mdx:', '');
        const mangaData = await mdx(`/manga/${mdxId}?includes[]=cover_art`);
        if (!mangaData) return res.status(404).json({ error: 'Not found' });
        const base = fmtMdx(mangaData.data);

        // Fetch ALL chapters
        let allChapters = [];
        let offset = 0;
        while (true) {
          const batch = await mdx(`/manga/${mdxId}/feed?limit=500&offset=${offset}&order[chapter]=asc&translatedLanguage[]=${lang}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`);
          if (!batch || !batch.data || batch.data.length === 0) break;
          allChapters = allChapters.concat(batch.data);
          if (allChapters.length >= batch.total) break;
          offset += 500;
        }

        // Deduplicate chapters by number
        const seen = new Map();
        for (const c of allChapters) {
          const num = c.attributes.chapter || '?';
          if (!seen.has(num)) seen.set(num, c);
        }
        const chapters = Array.from(seen.values())
          .sort((a, b) => parseFloat(b.attributes.chapter || 0) - parseFloat(a.attributes.chapter || 0))
          .map(c => ({
            id: 'mdx:' + c.id,
            name: `Chapter ${c.attributes.chapter || '?'}${c.attributes.title ? ' - ' + c.attributes.title : ''}`,
            date: c.attributes.publishAt ? c.attributes.publishAt.split('T')[0] : ''
          }));

        return res.json({ ...base, chapters });

      } else if (id.startsWith('ck:')) {
        const hid = id.replace('ck:', '');
        const [comicData, chapData] = await Promise.all([
          comick(`/comic/${hid}`),
          comick(`/comic/${hid}/chapters?lang=${lang}&limit=9999&page=1`)
        ]);

        if (!comicData) return res.status(404).json({ error: 'Not found' });
        const base = fmtComick(comicData.comic || comicData);

        const rawChaps = (chapData && chapData.chapters) || [];
        const seen = new Map();
        for (const c of rawChaps) {
          const num = c.chap || '?';
          if (!seen.has(num)) seen.set(num, c);
        }
        const chapters = Array.from(seen.values())
          .sort((a, b) => parseFloat(b.chap || 0) - parseFloat(a.chap || 0))
          .map(c => ({
            id: 'ck:' + c.hid,
            name: `Chapter ${c.chap || '?'}${c.title ? ' - ' + c.title : ''}`,
            date: c.created_at ? c.created_at.split('T')[0] : ''
          }));

        return res.json({ ...base, chapters });
      }

      return res.status(404).json({ error: 'Unknown manga source' });
    }

    // /chapter/:id — works for both mdx:xxx and ck:xxx
    if (url.startsWith('/chapter/')) {
      const raw = url.replace('/chapter/', '');
      // Handle mdx:id/ck:id (strip prefixes)
      const id = raw.replace(/^(mdx:|ck:)/, '');
      const prefix = raw.startsWith('ck:') ? 'ck' : 'mdx';

      if (prefix === 'mdx') {
        const data = await mdx(`/at-home/server/${id}`);
        if (!data) return res.status(500).json({ error: 'Failed to load chapter' });
        const base = data.baseUrl;
        const hash = data.chapter.hash;
        const images = (data.chapter.data || []).map((f, i) => ({
          img: `${base}/data/${hash}/${f}`,
          page: i + 1
        }));
        return res.json(images);
      } else {
        const data = await comick(`/chapter/${id}`);
        if (!data) return res.status(500).json({ error: 'Failed to load chapter' });
        const images = ((data.chapter && data.chapter.md_images) || []).map((img, i) => ({
          img: `https://meo.comick.pictures/${img.b2key}`,
          page: i + 1
        }));
        return res.json(images);
      }
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
