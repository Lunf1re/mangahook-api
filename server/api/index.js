const axios = require("axios");

const MDX = "https://api.mangadex.org";

const http = axios.create({
  timeout: 12000,
});

/* ======================
   HELPERS
====================== */

async function mdx(path) {
  try {
    const r = await http.get(MDX + path);
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

/* ======================
   FORMAT
====================== */

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
    source: "MangaDex",
  };
}

/* ======================
   GENRE MAP
====================== */

const GENRES = {
  action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  fantasy: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  mystery: "ee968100-4191-4968-93d3-f82d72be7e46",
  "sci-fi": "256c8bd9-4904-4360-bf4f-508a76d67183",
  "slice-of-life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  sports: "69964a64-2f90-4d33-beeb-e3d1177d9f0b",
  supernatural: "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  thriller: "07251805-a27e-4d59-b488-f0bfbec15168",
  "martial-arts": "799c202e-7daa-44eb-9cf7-8a3c0441531e",
  historical: "33771934-028e-4cb3-8744-691e866a923e",
  "school-life": "caaa44eb-cd40-4177-b930-79d3ef2efa74",
  ecchi: "b29d6a3d-1569-4e7a-8caf-7557bc92cd5d",
  shounen: "27d5d93b-12bc-441e-86e8-3d8faf23e5c9",
  seinen: "a3c67850-4684-404e-9b7f-c69850ee5da6",
  shoujo: "a3c67850-4684-404e-9b7f-c69850ee5da7",
};

/* ======================
   API
====================== */

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = (req.url || "/").split("?")[0];
  const params = req.query || {};

  try {
    /* ======================
       ROOT
    ======================= */

    if (url === "/") {
      return res.json({
        status: "ok",
        source: "MangaDex",
      });
    }

    /* ======================
       LIST
    ======================= */

    if (url.startsWith("/list")) {
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      const data = await mdx(
        `/manga?limit=20&offset=${offset}&order[followedCount]=desc&includes[]=cover_art`
      );

      const mangas = ((data && data.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil(((data && data.total) || 200) / 20);

      return res.json({
        mangas,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
      });
    }

    /* ======================
       SEARCH
    ======================= */

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

      const data = await mdx(
        `/manga?limit=20&offset=${offset}&title=${encodeURIComponent(
          q
        )}&includes[]=cover_art`
      );

      const mangas = ((data && data.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil(((data && data.total) || 20) / 20);

      return res.json({
        mangas,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
      });
    }

    /* ======================
       GENRE
    ======================= */

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

      const data = await mdx(
        `/manga?limit=20&offset=${offset}&includedTags[]=${tag}&includes[]=cover_art`
      );

      const mangas = ((data && data.data) || [])
        .map(fmtMdx)
        .filter(Boolean);

      return res.json({
        mangas,
        currentPage: page,
        totalPages: 10,
        hasNextPage: true,
      });
    }

    /* ======================
       MANGA DETAILS
    ======================= */

    if (url.startsWith("/manga/")) {
      const id = decodeURIComponent(url.replace("/manga/", ""));
      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 100;
      const lang = params.lang || "en";

      const mdxId = id.replace("mdx:", "");

      const mangaData = await mdx(`/manga/${mdxId}?includes[]=cover_art`);

      const base = fmtMdx(mangaData?.data);

      const feed = await mdx(
        `/manga/${mdxId}/feed?limit=100&offset=${offset}&order[chapter]=desc&translatedLanguage[]=${lang}`
      );

      const chapters = ((feed && feed.data) || []).map((c) => ({
        id: "mdx:" + c.id,
        name: `Chapter ${c.attributes.chapter || "?"}`,
        date: c.attributes.publishAt
          ? c.attributes.publishAt.split("T")[0]
          : "",
      }));

      const total = feed?.total || 0;

      return res.json({
        ...base,
        chapters,
        chapterPages: Math.ceil(total / 100),
      });
    }

    /* ======================
       CHAPTER
       FIX: Try at-home server first, fall back to dataSaver.
       If at-home CDN node is unreliable, we return BOTH the
       full-quality URL and a dataSaver fallback URL so the
       client can retry on error.
    ======================= */

    if (url.startsWith("/chapter/")) {
      const raw = decodeURIComponent(url.replace("/chapter/", ""));
      const id = raw.replace(/^mdx:/, "");

      const data = await mdx(`/at-home/server/${id}`);

      if (!data || !data.chapter) {
        return res.status(500).json({ error: "Failed to load chapter" });
      }

      const base = data.baseUrl;
      const hash = data.chapter.hash;
      const hashSaver = data.chapter.hash; // same hash, different folder
      const fullFiles = data.chapter.data || [];
      const saverFiles = data.chapter.dataSaver || [];

      // Build image list with primary URL + dataSaver fallback
      const images = fullFiles.map((f, i) => ({
        img: `${base}/data/${hash}/${f}`,
        fallback: saverFiles[i]
          ? `${base}/data-saver/${hashSaver}/${saverFiles[i]}`
          : null,
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
