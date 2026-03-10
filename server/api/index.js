const axios = require('axios');

const BASE = 'https://api.mangadex.org';

async function api(path) {
  const r = await axios.get(BASE + path, { timeout: 20000 });
  return r.data;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
}

function formatManga(m) {
  const attr = m.attributes;
  const title = attr.title.en || Object.values(attr.title)[0] || 'Unknown';
  const desc = (attr.description && (attr.description.en || Object.values(attr.description)[0])) || '';
  const coverId = (m.relationships || []).find(r => r.type === 'cover_art');
  const coverFile = coverId && coverId.attributes && coverId.attributes.fileName;
  const image = coverFile ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg` : '';
  const genres = (attr.tags || []).filter(t => t.attributes.group === 'genre').map(t => t.attributes.name.en || '');
  return {
    id: m.id,
    title,
    image,
    description: desc.substring(0, 200),
    status: attr.status || '',
    genres,
    latestChapter: attr.lastChapter || '',
    views: ''
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '/';
  const params = req.query || {};

  try {
    if (url === '/' || url.startsWith('/?')) {
      return res.json({ status: 'ok', api: 'manga-api-mangadex' });
    }

    // /list?page=1
    if (url.startsWith('/list')) {
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;
      const data = await api(`/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]=en`);
      const mangas = (data.data || []).map(formatManga);
      const totalPages = Math.ceil((data.total || 20) / 20);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /search?query=naruto&page=1
    if (url.startsWith('/search')) {
      const q = params.query || '';
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;
      if (!q) return res.json({ mangas: [], currentPage: 1, totalPages: 1 });
      const data = await api(`/manga?limit=20&offset=${offset}&title=${encodeURIComponent(q)}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`);
      const mangas = (data.data || []).map(formatManga);
      const totalPages = Math.ceil((data.total || 1) / 20);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /genre?genre=action&page=1
    if (url.startsWith('/genre')) {
      const genre = params.genre || '';
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      // MangaDex genre tag IDs
      const GENRE_IDS = {
        'action': '391b0423-d847-456f-aff0-8b0cfc03066b',
        'adventure': '87cc87cd-a395-47af-b27a-93258283bbc6',
        'comedy': '4d32cc48-9f00-4cca-9b5a-a839f0764984',
        'drama': 'b9af3a63-f058-46de-a9a0-e0c13906197a',
        'fantasy': 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
        'horror': 'cdad7e68-1419-41dd-bdce-27753074a640',
        'mystery': 'ee968100-4191-4968-93d3-f68d863pak',
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

      let apiUrl = `/manga?limit=20&offset=${offset}&includes[]=cover_art&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]=en`;
      if (genre && GENRE_IDS[genre]) {
        apiUrl += `&includedTags[]=${GENRE_IDS[genre]}`;
      }
      const data = await api(apiUrl);
      const mangas = (data.data || []).map(formatManga);
      const totalPages = Math.ceil((data.total || 1) / 20);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    // /manga/:id
    if (url.startsWith('/manga/')) {
      const id = url.replace('/manga/', '').split('?')[0];
      const [mangaData, chapData] = await Promise.all([
        api(`/manga/${id}?includes[]=cover_art`),
        api(`/manga/${id}/feed?limit=96&order[chapter]=desc&translatedLanguage[]=en`)
      ]);
      const m = mangaData.data;
      const base = formatManga(m);
      const chapters = (chapData.data || []).map(c => ({
        id: c.id,
        name: `Chapter ${c.attributes.chapter || '?'}${c.attributes.title ? ' - ' + c.attributes.title : ''}`,
        date: c.attributes.publishAt ? c.attributes.publishAt.split('T')[0] : ''
      }));
      return res.json({ ...base, chapters });
    }

    // /chapter/:chapterId (MangaDex chapter id only)
    if (url.startsWith('/chapter/')) {
      const parts = url.replace('/chapter/', '').split('?')[0].split('/');
      const chapterId = parts[parts.length - 1];
      const data = await api(`/at-home/server/${chapterId}`);
      const base = data.baseUrl;
      const hash = data.chapter.hash;
      const images = (data.chapter.data || []).map((f, i) => ({
        img: `${base}/data/${hash}/${f}`,
        page: i + 1
      }));
      return res.json(images);
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
