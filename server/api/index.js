const axios = require("axios");

const MDX = "https://api.mangadex.org";

const http = axios.create({
  timeout: 15000
});

/* ======================
   HELPERS
====================== */

async function mdx(path) {
  try {
    const r = await http.get(MDX + path);
    return r.data;
  } catch (e) {
    return null;
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  /* caching for speed */
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
}

/* ======================
   FORMAT MANGA
====================== */

function fmtMdx(m) {
  if (!m) return null;

  const attr = m.attributes || {};

  const title =
    attr.title?.en ||
    Object.values(attr.title || {})[0] ||
    "Unknown";

  const desc =
    attr.description?.en ||
    Object.values(attr.description || {})[0] ||
    "";

  const coverRel = (m.relationships || []).find(r => r.type === "cover_art");

  const coverFile = coverRel?.attributes?.fileName;

  const image = coverFile
    ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.512.jpg`
    : "";

  const genres = (attr.tags || [])
    .filter(t => t.attributes?.group === "genre")
    .map(t => t.attributes?.name?.en)
    .filter(Boolean);

  return {
    id: "mdx:" + m.id,
    title,
    image,
    description: desc.substring(0, 200),
    status: attr.status || "",
    genres,
    latestChapter: attr.lastChapter || "",
    source: "MangaDex"
  };
}

/* ======================
   GENRES (FULL LIST)
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
  scifi: "256c8bd9-4904-4360-bf4f-508a76d67183",
  sliceoflife: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  sports: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  supernatural: "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  thriller: "07251805-a27e-4d59-b488-f0bfbec15168",
  psychological: "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  historical: "33771934-028e-4cb3-8744-691e866a923e",
  martialarts: "799c202e-7daa-44eb-9cf7-8a3c0441531e",
  mecha: "50880a9d-5440-4732-9afb-8f457127e836",
  isekai: "ace04997-f6bd-436e-b261-779182193d3d",
  tragedy: "f8f62932-27da-4fe4-8ee1-6779a8c5edba",
  vampires: "9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8"
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
        api: "MangaHook",
        source: "MangaDex"
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

      const mangas = (data?.data || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil((data?.total || 200) / 20);

      return res.json({
        mangas,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages
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
          totalPages: 1
        });
      }

      const data = await mdx(
        `/manga?title=${encodeURIComponent(q)}&limit=20&offset=${offset}&includes[]=cover_art`
      );

      const mangas = (data?.data || [])
        .map(fmtMdx)
        .filter(Boolean);

      const totalPages = Math.ceil((data?.total || 20) / 20);

      return res.json({
        mangas,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages
      });
    }

    /* ======================
       GENRE
    ======================= */

    if (url.startsWith("/genre")) {

      const genre = params.genre?.toLowerCase();
      const tag = GENRES[genre];

      const page = Math.max(1, parseInt(params.page) || 1);
      const offset = (page - 1) * 20;

      if (!tag) {
        return res.json({
          mangas: [],
          currentPage: 1,
          totalPages: 1
        });
      }

      const data = await mdx(
        `/manga?includedTags[]=${tag}&limit=20&offset=${offset}&includes[]=cover_art`
      );

      const mangas = (data?.data || [])
        .map(fmtMdx)
        .filter(Boolean);

      return res.json({
        mangas,
        currentPage: page,
        totalPages: 10,
        hasNextPage: true
      });
    }

    /* ======================
       MANGA DETAILS
    ======================= */

    if (url.startsWith("/manga/")) {

      const id = decodeURIComponent(url.replace("/manga/", ""));
      const page = Math.max(1, parseInt(params.page) || 1);

      const mdxId = id.replace("mdx:", "");

      const mangaData = await mdx(`/manga/${mdxId}?includes[]=cover_art`);

      const base = fmtMdx(mangaData?.data);

      const feed = await mdx(
        `/manga/${mdxId}/feed?limit=100&offset=${(page - 1) * 100}&order[chapter]=desc`
      );

      const chapters = (feed?.data || []).map(c => ({
        id: "mdx:" + c.id,
        name: `Chapter ${c.attributes.chapter || "?"}`,
        date: c.attributes.publishAt?.split("T")[0] || ""
      }));

      const total = feed?.total || 0;

      return res.json({
        ...base,
        chapters,
        chapterPages: Math.ceil(total / 100)
      });
    }

    /* ======================
       CHAPTER
    ======================= */

    if (url.startsWith("/chapter/")) {

      const raw = decodeURIComponent(url.replace("/chapter/", ""));
      const id = raw.replace(/^mdx:/, "");

      const data = await mdx(`/at-home/server/${id}`);

      if (!data?.chapter) {
        return res.status(500).json({ error: "Chapter not available" });
      }

      const base = data.baseUrl;
      const hash = data.chapter.hash;

      const saver = data.chapter.dataSaver || [];
      const full = data.chapter.data || [];

      const files = saver.length ? saver : full;

      const images = files.map((f, i) => ({
        img: saver.length
          ? `${base}/data-saver/${hash}/${f}`
          : `${base}/data/${hash}/${f}`,
        page: i + 1
      }));

      return res.json(images);
    }

    return res.status(404).json({ error: "Not found" });

  } catch (e) {

    return res.status(500).json({
      error: "Server error",
      message: e.message
    });

  }
};
