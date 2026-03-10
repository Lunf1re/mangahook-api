const axios = require("axios");

const MDX = "https://api.mangadex.org";

const http = axios.create({ timeout: 15000 });

/* ─── CORS ──────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
}

/* ─── MDX FETCH ─────────────────────────────────────────────── */
async function mdx(path) {
  try {
    const r = await http.get(MDX + path, {
      headers: { "User-Agent": "MangaProxy/2.0" },
    });
    return r.data;
  } catch {
    return null;
  }
}

/* ─── FORMAT MANGA ──────────────────────────────────────────── */
function fmtMdx(m) {
  if (!m) return null;
  const a = m.attributes || {};

  const title = a.title
    ? (a.title.en || a.title["ja-ro"] || a.title.ja || Object.values(a.title)[0] || "Unknown")
    : "Unknown";

  const desc = a.description
    ? (a.description.en || Object.values(a.description)[0] || "")
    : "";

  const coverRel = (m.relationships || []).find((r) => r.type === "cover_art");
  const coverFile = coverRel && coverRel.attributes && coverRel.attributes.fileName;
  const image = coverFile
    ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`
    : "";

  const genres = (a.tags || [])
    .filter((t) => t.attributes && (t.attributes.group === "genre" || t.attributes.group === "theme"))
    .map((t) => t.attributes && t.attributes.name && t.attributes.name.en)
    .filter(Boolean)
    .slice(0, 6);

  return {
    id: "mdx:" + m.id,
    title,
    image,
    description: desc.substring(0, 300),
    status: a.status || "",
    genres,
    latestChapter: a.lastChapter || "",
    source: "MangaDex",
    demographic: a.publicationDemographic || "",
    year: a.year || "",
  };
}

/* ─── GENRE / DEMOGRAPHIC MAP ───────────────────────────────── */
// Tag genres: use includedTags[] with UUID
const TAG_MAP = {
  action:          "391b0423-d847-456f-aff0-8b0cfc03066b",
  adventure:       "87cc87cd-a395-47af-b27a-93258283bbc6",
  comedy:          "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  drama:           "b9af3a63-f058-46de-a9a0-e0c13906197a",
  fantasy:         "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  romance:         "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  horror:          "cdad7e68-1419-41dd-bdce-27753074a640",
  mystery:         "ee968100-4191-4968-93d3-f82d72be7e46",
  "sci-fi":        "256c8bd9-4904-4360-bf4f-508a76d67183",
  "slice-of-life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  sports:          "69964a64-2f90-4d33-beeb-e3d1177d9f0b",
  supernatural:    "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  thriller:        "07251805-a27e-4d59-b488-f0bfbec15168",
  "martial-arts":  "799c202e-7daa-44eb-9cf7-8a3c0441531e",
  historical:      "33771934-028e-4cb3-8744-691e866a923e",
  "school-life":   "caaa44eb-cd40-4177-b930-79d3ef2efa74",
  ecchi:           "b29d6a3d-1569-4e7a-8caf-7557bc92cd5d",
  mecha:           "50880a9d-5440-4732-9afb-8f457127e836",
  psychological:   "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  isekai:          "ace04997-f6bd-436e-b261-779182193d3d",
  magic:           "a1f53773-c69a-4ce5-8cab-fffcd90b1565",
};

// Demographics: use publicationDemographic[] — NOT tag UUIDs
const DEMOGRAPHIC_MAP = {
  shounen: "shounen",
  shoujo:  "shoujo",
  seinen:  "seinen",
  josei:   "josei",
};

/* ─── SHARED LIST QUERY BUILDER ─────────────────────────────── */
function buildQuery(offset, extra) {
  return `/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive${extra || ""}`;
}

/* ─── MAIN HANDLER ──────────────────────────────────────────── */
module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = (req.url || "/").split("?")[0];
  const p   = req.query || {};

  try {

    /* ── ROOT ───────────────────────────────────────────────── */
    if (url === "/") {
      return res.json({ status: "ok", source: "MangaDex" });
    }

    /* ── LIST ───────────────────────────────────────────────── */
    if (url === "/list" || url.startsWith("/list")) {
      const page   = Math.max(1, parseInt(p.page) || 1);
      const offset = (page - 1) * 20;
      const data   = await mdx(buildQuery(offset));
      const mangas = ((data && data.data) || []).map(fmtMdx).filter(Boolean);
      const totalPages = Math.min(Math.ceil(((data && data.total) || 200) / 20), 50);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    /* ── SEARCH ─────────────────────────────────────────────── */
    if (url.startsWith("/search")) {
      const q      = p.query || "";
      const page   = Math.max(1, parseInt(p.page) || 1);
      const offset = (page - 1) * 20;
      if (!q) return res.json({ mangas: [], currentPage: 1, totalPages: 1 });
      const data = await mdx(
        `/manga?limit=20&offset=${offset}&title=${encodeURIComponent(q)}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`
      );
      const mangas = ((data && data.data) || []).map(fmtMdx).filter(Boolean);
      const totalPages = Math.min(Math.ceil(((data && data.total) || 20) / 20), 20);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    /* ── GENRE ──────────────────────────────────────────────── */
    if (url.startsWith("/genre")) {
      const genre  = (p.genre || "").toLowerCase();
      const page   = Math.max(1, parseInt(p.page) || 1);
      const offset = (page - 1) * 20;
      let extra    = "";

      if (DEMOGRAPHIC_MAP[genre]) {
        extra = `&publicationDemographic[]=${DEMOGRAPHIC_MAP[genre]}`;
      } else if (TAG_MAP[genre]) {
        extra = `&includedTags[]=${TAG_MAP[genre]}`;
      } else {
        return res.json({ mangas: [], currentPage: 1, totalPages: 1 });
      }

      const data   = await mdx(buildQuery(offset, extra));
      const mangas = ((data && data.data) || []).map(fmtMdx).filter(Boolean);
      const total  = (data && data.total) || 0;
      const totalPages = Math.min(Math.ceil(total / 20) || 10, 25);
      return res.json({ mangas, currentPage: page, totalPages, hasNextPage: page < totalPages });
    }

    /* ── MANGA DETAIL ───────────────────────────────────────── */
    if (url.startsWith("/manga/")) {
      const id    = decodeURIComponent(url.replace("/manga/", ""));
      const page  = Math.max(1, parseInt(p.page) || 1);
      const offset = (page - 1) * 100;
      const lang  = p.lang || "en";
      const mdxId = id.replace(/^mdx:/, "");

      const [mangaData, feed] = await Promise.all([
        mdx(`/manga/${mdxId}?includes[]=cover_art`),
        mdx(`/manga/${mdxId}/feed?limit=100&offset=${offset}&order[chapter]=desc&translatedLanguage[]=${lang}`),
      ]);

      const base = fmtMdx(mangaData && mangaData.data);
      if (!base) return res.status(404).json({ error: "Manga not found" });

      let chapters = ((feed && feed.data) || []).map((c) => ({
        id:   "mdx:" + c.id,
        name: "Chapter " + (c.attributes.chapter || "?"),
        date: c.attributes.publishAt ? c.attributes.publishAt.split("T")[0] : "",
        lang: c.attributes.translatedLanguage || "",
      }));

      // Fallback: if no chapters for requested lang, fetch without lang filter
      if (chapters.length === 0) {
        const fallbackFeed = await mdx(
          `/manga/${mdxId}/feed?limit=100&offset=${offset}&order[chapter]=desc`
        );
        chapters = ((fallbackFeed && fallbackFeed.data) || []).map((c) => ({
          id:   "mdx:" + c.id,
          name: "Chapter " + (c.attributes.chapter || "?"),
          date: c.attributes.publishAt ? c.attributes.publishAt.split("T")[0] : "",
          lang: c.attributes.translatedLanguage || "",
        }));
      }

      const total = (feed && feed.total) || chapters.length;
      return res.json({ ...base, chapters, chapterPages: Math.ceil(total / 100) || 1 });
    }

    /* ── CHAPTER ────────────────────────────────────────────── */
    if (url.startsWith("/chapter/")) {
      const raw  = decodeURIComponent(url.replace("/chapter/", ""));
      const id   = raw.replace(/^mdx:/, "");
      const data = await mdx(`/at-home/server/${id}`);

      if (!data || !data.chapter) {
        return res.status(500).json({ error: "Failed to load chapter" });
      }

      const base       = data.baseUrl;
      const hash       = data.chapter.hash;
      const fullFiles  = data.chapter.data || [];
      const saverFiles = data.chapter.dataSaver || [];
      const host       = "https://" + req.headers.host;

      const images = fullFiles.map((f, i) => {
        const primaryUrl = base + "/data/" + hash + "/" + f;
        const saverUrl   = saverFiles[i]
          ? base + "/data-saver/" + hash + "/" + saverFiles[i]
          : primaryUrl;
        return {
          img:  host + "/img?u=" + encodeURIComponent(primaryUrl) + "&fb=" + encodeURIComponent(saverUrl),
          page: i + 1,
        };
      });

      return res.json(images);
    }

    /* ── IMAGE PROXY ────────────────────────────────────────── */
    if (url.startsWith("/img")) {
      const imgUrl = p.u  ? decodeURIComponent(p.u)  : "";
      const fbUrl  = p.fb ? decodeURIComponent(p.fb) : "";
      if (!imgUrl) return res.status(400).json({ error: "Missing url" });

      const fetchImg = (target) =>
        http.get(target, {
          responseType: "arraybuffer",
          timeout: 20000,
          headers: {
            "Referer":    "https://mangadex.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept":     "image/webp,image/apng,image/*,*/*;q=0.8",
          },
        });

      let imgRes;
      try {
        imgRes = await fetchImg(imgUrl);
      } catch {
        if (!fbUrl) return res.status(502).json({ error: "Image fetch failed" });
        try {
          imgRes = await fetchImg(fbUrl);
        } catch {
          return res.status(502).json({ error: "Both image URLs failed" });
        }
      }

      const ct = imgRes.headers["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).send(Buffer.from(imgRes.data));
    }

    return res.status(404).json({ error: "Not found" });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
