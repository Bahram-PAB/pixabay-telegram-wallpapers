// Pixabay -> Telegram: صبح آلبوم ۴ عکس، عصر یک ویدئو (stdlib only, Node 18+)
// usage: node bot.mjs photos|video
// ponytail: sent ids live in JSON files committed to the repo; switch to a DB only if >10k items.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const QUERIES = ["mountain view", "mountains", "mountain climbing"]; // فیلتر انتخاب کاربر
const MIN_HEIGHT = 1600; // px — full-image height, filters out tiny previews
const ALBUM_SIZE = 4;    // photos per morning album
const MODE = process.argv[2] === "video" ? "video" : "photos"; // photos=آلبوم صبح، video=ویدئو عصر
const SENT_FILE = MODE === "video" ? "sent-videos.json" : "sent.json";
const MAX_SENT = 5000;   // cap state growth

for (const name of ["PIXABAY_KEY", "TG_TOKEN", "TG_CHAT"]) {
  if (!process.env[name]) { console.error(`missing env: ${name}`); process.exit(1); }
}

const get = async (url, params) => {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

const sent = existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, "utf8")) : [];

// Gemini حذف شد — فیلتر فقط با کوئری‌های Pixabay. تگ حشره/حیوان هم رد می‌شود.
const ANIMAL_TAGS = /\b(animal|insect|bug|beetle|butterfly|bird|cat|dog|horse|sheep|goat|wildlife|mammal|reptile|frog|bee|spider)\b/i;

const search = async () => {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const base = {
    key: process.env.PIXABAY_KEY, q, per_page: 50,
    safesearch: "true", order: "latest",
  };
  const path = MODE === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/";
  if (MODE !== "video") base.image_type = "photo", base.orientation = "vertical";
  const { hits } = await get(path, base);
  return hits.filter(h => !sent.includes(h.id)
    && (MODE === "video" || h.imageHeight >= MIN_HEIGHT)
    && !ANIMAL_TAGS.test(h.tags || ""));
};

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ارسال: صبح = آلبوم ۴ عکسی با یک کپشن؛ عصر = یک ویدئو با کپشن ثابت. بدون متن دیگر.
const CAPTION = MODE === "video" ? "ویدئو کوتاه امروز" : "تصاویر دیدنی امروز";

let fresh = [];
try {
  fresh = shuffle(await search());
} catch (e) {
  console.error(`pixabay: ${e.message}`);
  process.exit(1);
}

try {
  if (MODE === "video") {
    const v = fresh[0];
    if (!v) throw new Error("no fresh video");
    const size = v.videos?.hd || v.videos?.sd || v.videos?.["4k"]; // کلیدهای واقعی API ویدئو: sd/hd/4k
    if (!size?.url) throw new Error(`no playable size: ${Object.keys(v.videos || {}).join(",")}`);
    await get(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendVideo`, {
      chat_id: process.env.TG_CHAT, video: size.url, caption: CAPTION,
      supports_streaming: "true", width: size.width || 0, height: size.height || 0, duration: v.duration || 0,
    });
    sent.push(v.id);
    writeFileSync(SENT_FILE, JSON.stringify(sent.slice(-MAX_SENT)));
    console.log(`done: video #${v.id}`);
  } else {
    const picks = fresh.slice(0, ALBUM_SIZE);
    if (picks.length) {
      await get(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMediaGroup`, {
        chat_id: process.env.TG_CHAT, caption: CAPTION,
        media: JSON.stringify(picks.map(h => ({ type: "photo", media: h.largeImageURL }))),
      });
      sent.push(...picks.map(h => h.id));
      writeFileSync(SENT_FILE, JSON.stringify(sent.slice(-MAX_SENT)));
    }
    console.log(picks.length ? `done: album of ${picks.length}` : "nothing new, retry next run");
  }
} catch (e) {
  console.error(`send: ${e.message}`);
  process.exit(1);
}
