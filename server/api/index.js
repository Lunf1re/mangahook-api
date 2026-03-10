const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://manganato.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://manganato.com/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

async function get(url) {
  const r = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  return cheerio.load(r.data);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '/';
  const params = req.query || {};

  try {
    if (url === '/' || url.startsWith('/?')) {
      return res.json({ status: 'ok', api: 'manga-api' });
    }

    if (url.startsWith('/list')) {
      const page = params.page || 1;
      const type = params.type || 'topview';
      const $ = await get(`${BASE}/genre-all/${page}?type=${type}`);
      const mangas = [];
      $('.content-genres-item').each((i, el) => {
        const a = $(el).find('.genres-item-name');
        const img = $(el).find('img');
        const chap = $(el).find('.genres-item-chap');
        mangas.push({
          id: a.attr('href') ? a.attr('href').split('/').pop() : '',
          title: a.text().trim(),
          image: img.attr('src') || img.attr('data-src') || '',
          latestChapter: chap.first().text().trim(),
          description: $(el).find('.genres-item-info').text().trim().substring(0, 200),
          genres: [],
          views: $(el).find('.genres-item-view').text().trim()
        });
      });
      const totalPages = parseInt($('.page-last').text().replace(/[^0-9]/g, '')) || 1;
      return res.json({ mangas, currentPage: Number(page), totalPages, hasNextPage: Number(page) < totalPages });
    }

    if (url.startsWith('/search')) {
      const q = (params.query || '').replace(/\s+/g, '-').toLowerCase();
      const page = params.page || 1;
      if (!q) return res.json({ mangas: [], currentPage: 1, totalPages: 1 });
      const $ = await get(`https://manganato.com/search/story/${q}?page=${page}`);
      const mangas = [];
      $('.search-story-item').each((i, el) => {
        const a = $(el).find('.item-title');
        const img = $(el).find('img');
        mangas.push({
          id: a.attr('href') ? a.attr('href').split('/').pop() : '',
          title: a.text().trim(),
          image: img.attr('src') || img.attr('data-src') || '',
          latestChapter: $(el).find('.item-chapter').first().text().trim(),
          description: '',
          genres: [],
          views: $(el).find('.item-time').text().trim()
        });
      });
      const totalPages = parseInt($('.page-last').text().replace(/[^0-9]/g, '')) || 1;
      return res.json({ mangas, currentPage: Number(page), totalPages, hasNextPage: Number(page) < totalPages });
    }

    if (url.startsWith('/genre')) {
      const genre = params.genre || 'action';
      const page = params.page || 1;
      const type = params.type || 'topview';
      const $ = await get(`${BASE}/genre-${genre}/${page}?type=${type}`);
      const mangas = [];
      $('.content-genres-item').each((i, el) => {
        const a = $(el).find('.genres-item-name');
        const img = $(el).find('img');
        const chap = $(el).find('.genres-item-chap');
        mangas.push({
          id: a.attr('href') ? a.attr('href').split('/').pop() : '',
          title: a.text().trim(),
          image: img.attr('src') || img.attr('data-src') || '',
          latestChapter: chap.first().text().trim(),
          description: '',
          genres: [],
          views: $(el).find('.genres-item-view').text().trim()
        });
      });
      const totalPages = parseInt($('.page-last').text().replace(/[^0-9]/g, '')) || 1;
      return res.json({ mangas, currentPage: Number(page), totalPages, hasNextPage: Number(page) < totalPages });
    }

    if (url.startsWith('/manga/')) {
      const id = url.replace('/manga/', '').split('?')[0];
      const $ = await get(`${BASE}/${id}`);
      const title = $('.story-info-right h1').text().trim();
      const image = $('.story-info-left img').attr('src') || '';
      const description = $('#panel-story-info-description').text().replace('Description :', '').trim();
      const status = $('.table-value').eq(2).text().trim();
      const genres = [];
      $('.table-value').eq(3).find('a').each((i, el) => genres.push($(el).text().trim()));
      const chapters = [];
      $('.row-content-chapter li').each((i, el) => {
        const a = $(el).find('a');
        const href = a.attr('href') || '';
        const chapId = href.split('/').slice(-2).join('/');
        chapters.push({ id: chapId, name: a.text().trim(), date: $(el).find('span').last().text().trim() });
      });
      return res.json({ id, title, image, description, status, genres, chapters });
    }

    if (url.startsWith('/chapter/')) {
      const parts = url.replace('/chapter/', '').split('?')[0].split('/');
      const mangaId = parts[0];
      const chapterId = parts[1];
      const $ = await get(`https://chapmanganato.to/${mangaId}/${chapterId}`);
      const images = [];
      $('.container-chapter-reader img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src) images.push({ img: src, page: i + 1 });
      });
      return res.json(images);
    }

    return res.status(404).json({ error: 'Not found' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
