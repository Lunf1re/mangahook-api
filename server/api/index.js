const axios = require("axios");

const MDX = "https://api.mangadex.org";
const COMICK = "https://api.comick.fun";

const http = axios.create({ timeout: 15000 });

async function mdx(path) {
  try {
    const r = await http.get(MDX + path);
    return r.data;
  } catch {
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
  } catch {
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
    .filter((t) => t.attributes?.group === "genre")
    .map((t) => t.attributes?.name?.en)
    .filter(Boolean);

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
    .map((g) => g.md_genres?.name)
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
   REMOVE DUPLICATES
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
   GENRE MAP (MangaDex)
========================= */

const GENRES = {
  action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  fantasy: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  mystery: "ee968100-4191-4968-93d3-f82d72be7e46",
  scifi: "256c8bd9-4904-4360-bf4f-508a76d67183",
  sliceoflife: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  sports: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
};

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
       ROOT
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

      const mdxData = await mdx(
        `/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art`
      );

      const mangas = ((mdxData && mdxData.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil(((mdxData && mdxData.total) || 200) / 20);

      return res.json({
        mangas,
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

      const mdxData = await mdx(
        `/manga?limit=20&offset=${offset}&title=${encodeURIComponent(
          q
        )}&includes[]=cover_art`
      );

      const mangas = ((mdxData && mdxData.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil(((mdxData && mdxData.total) || 20) / 20);

      return res.json({
        mangas,
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

      const tag = GENRES[genre.toLowerCase()];

      if (!tag) {
        return res.json({
          mangas: [],
          currentPage: 1,
          totalPages: 1,
        });
      }

      const mdxData = await mdx(
        `/manga?limit=20&offset=${offset}&includedTags[]=${tag}&includes[]=cover_art`
      );

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

      if (!id.startsWith("mdx:")) {
        return res.status(404).json({ error: "Unsupported source" });
      }

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

    /* =========================
       CHAPTER
    ========================= */

    if (url.startsWith("/chapter/")) {
      const raw = decodeURIComponent(url.replace("/chapter/", ""));
      const id = raw.replace(/^mdx:/, "");

      const data = await mdx(`/at-home/server/${id}`);

      if (!data || !data.chapter) {
        return res.status(500).json({ error: "Failed to load chapter" });
      }

      const base = data.baseUrl;
      const hash = data.chapter.hash;

      const images = (data.chapter.data || []).map((f, i) => ({
        img: `${base}/data/${hash}/${f}`,
        page: i + 1,
      }));

      return res.json(images);
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({
      error: e.message,
    });
  }
};
