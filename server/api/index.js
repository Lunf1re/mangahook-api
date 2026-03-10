const axios = require("axios");

const MDX = "https://api.mangadex.org";
const COMICK = "https://api.comick.fun";

const http = axios.create({ timeout: 15000 });

async function mdx(path) {
  try {
    const r = await http.get(MDX + path);
    return r.data;
  } catch (e) {
    return null;
  }
}

async function comick(path) {
  try {
    const r = await http.get(COMICK + path, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://comick.fun/",
      },
    });
    return r.data;
  } catch (e) {
    return null;
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
}

/* =========================
   FORMATTERS
========================= */

function fmtMdx(m) {
  if (!m) return null;

  const attr = m.attributes || {};

  const title =
    (attr.title && (attr.title.en || Object.values(attr.title)[0])) ||
    "Unknown";

  const desc =
    (attr.description &&
      (attr.description.en || Object.values(attr.description)[0])) ||
    "";

  const coverRel = (m.relationships || []).find((r) => r.type === "cover_art");
  const coverFile =
    coverRel && coverRel.attributes && coverRel.attributes.fileName;

  const image = coverFile
    ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`
    : "";

  const genres = (attr.tags || [])
    .filter((t) => t.attributes && t.attributes.group === "genre")
    .map((t) => t.attributes.name.en || "");

  return {
    id: "mdx:" + m.id,
    title,
    image,
    description: desc.substring(0, 200),
    status: attr.status || "",
    genres,
    latestChapter: attr.lastChapter || "",
    views: "",
    source: "MangaDex",
  };
}

function fmtComick(m) {
  if (!m) return null;

  const md = m.md_comics || m;

  const title = md.title || md.slug || "Unknown";

  const image =
    md.cover_url ||
    (md.md_covers &&
      md.md_covers[0] &&
      `https://meo.comick.pictures/${md.md_covers[0].b2key}`) ||
    "";

  const desc = md.desc || md.summary || "";

  const genres = (md.md_comic_md_genres || [])
    .map((g) => g.md_genres && g.md_genres.name)
    .filter(Boolean);

  return {
    id: "ck:" + (md.hid || md.slug),
    title,
    image,
    description: desc.substring(0, 200),
    status: md.status === 1 ? "ongoing" : md.status === 2 ? "completed" : "",
    genres,
    latestChapter: md.last_chapter ? String(md.last_chapter) : "",
    views: md.view_count ? String(md.view_count) : "",
    source: "ComicK",
  };
}

/* =========================
   DEDUP
========================= */

function dedup(list) {
  const seen = new Map();
  const out = [];

  for (const m of list) {
    const key = m.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!seen.has(key)) {
      seen.set(key, true);
      out.push(m);
    }
  }

  return out;
}

/* =========================
   API HANDLER
========================= */

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = (req.url || "/").split("?")[0];
  const params = req.query || {};

  try {
    /* =========================
       HEALTH
    ========================= */

    if (url === "/") {
      return res.json({
        status: "ok",
        sources: ["MangaDex", "ComicK"],
      });
    }

    /* =========================
       LIST
    ========================= */

    if (url.startsWith("/list")) {
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      const [mdxData, ckData] = await Promise.all([
        mdx(
          `/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art`
        ),
        comick(`/top?page=${page}`),
      ]);

      const mdxMangas = ((mdxData && mdxData.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const ckMangas = ((ckData && ckData.rank) || [])
        .map(fmtComick)
        .filter(Boolean);

      const merged = dedup([...mdxMangas, ...ckMangas]);

      const totalPages = Math.ceil(((mdxData && mdxData.total) || 200) / 20);

      return res.json({
        mangas: merged,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
      });
    }

    /* =========================
       SEARCH
    ========================= */

    if (url.startsWith("/search")) {
      const q = params.query || "";
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      if (!q) {
        return res.json({
          mangas: [],
          currentPage: 1,
          totalPages: 1,
        });
      }

      const [mdxData, ckData] = await Promise.all([
        mdx(
          `/manga?limit=20&offset=${offset}&title=${encodeURIComponent(
            q
          )}&includes[]=cover_art`
        ),
        comick(`/v1.0/search?q=${encodeURIComponent(q)}&limit=20&page=${page}`),
      ]);

      const mdxMangas = ((mdxData && mdxData.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const ckMangas = (Array.isArray(ckData) ? ckData : [])
        .map(fmtComick)
        .filter(Boolean);

      const merged = dedup([...mdxMangas, ...ckMangas]);

      const totalPages = Math.ceil(((mdxData && mdxData.total) || 20) / 20);

      return res.json({
        mangas: merged,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
      });
    }

    /* =========================
       GENRE
    ========================= */

    if (url.startsWith("/genre")) {
      const genre = params.genre || "";
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      let mdxUrl = `/manga?limit=20&offset=${offset}&includes[]=cover_art`;

      if (genre) {
        mdxUrl += `&includedTags[]=${genre}`;
      }

      const mdxData = await mdx(mdxUrl);

      const mangas = ((mdxData && mdxData.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      return res.json({
        mangas,
        currentPage: page,
        totalPages: 10,
        hasNextPage: true,
      });
    }

    /* =========================
       MANGA DETAILS
    ========================= */

    if (url.startsWith("/manga/")) {
      const id = decodeURIComponent(url.replace("/manga/", ""));
      const lang = params.lang || "en";

      if (id.startsWith("mdx:")) {
        const mdxId = id.replace("mdx:", "");

        const mangaData = await mdx(`/manga/${mdxId}?includes[]=cover_art`);

        const base = fmtMdx(mangaData.data);

        const feed = await mdx(
          `/manga/${mdxId}/feed?limit=500&translatedLanguage[]=${lang}`
        );

        const chapters = ((feed && feed.data) || []).map((c) => ({
          id: "mdx:" + c.id,
          name: `Chapter ${c.attributes.chapter || "?"}`,
          date: c.attributes.publishAt
            ? c.attributes.publishAt.split("T")[0]
            : "",
        }));

        return res.json({
          ...base,
          chapters,
        });
      }

      if (id.startsWith("ck:")) {
        const hid = id.replace("ck:", "");

        const comicData = await comick(`/comic/${hid}`);

        const chapData = await comick(
          `/comic/${hid}/chapters?lang=${lang}&limit=9999&page=1`
        );

        const base = fmtComick(comicData.comic || comicData);

        const chapters = ((chapData && chapData.chapters) || []).map((c) => ({
          id: "ck:" + c.hid,
          name: `Chapter ${c.chap || "?"}`,
          date: c.created_at ? c.created_at.split("T")[0] : "",
        }));

        return res.json({
          ...base,
          chapters,
        });
      }
    }

    /* =========================
       CHAPTER PAGES
    ========================= */

    if (url.startsWith("/chapter/")) {
      const raw = decodeURIComponent(url.replace("/chapter/", ""));
      const id = raw.replace(/^(mdx:|ck:)/, "");
      const prefix = raw.startsWith("ck:") ? "ck" : "mdx";

      if (prefix === "mdx") {
        const data = await mdx(`/at-home/server/${id}`);

        const base = data.baseUrl;
        const hash = data.chapter.hash;

        const images = (data.chapter.data || []).map((f, i) => ({
          img: `${base}/data/${hash}/${f}`,
          page: i + 1,
        }));

        return res.json(images);
      }

      if (prefix === "ck") {
        const data = await comick(`/chapter/${id}`);

        const images = ((data.chapter && data.chapter.md_images) || []).map(
          (img, i) => ({
            img: `https://meo.comick.pictures/${img.b2key}`,
            page: i + 1,
          })
        );

        return res.json(images);
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({
      error: e.message,
    });
  }
};
