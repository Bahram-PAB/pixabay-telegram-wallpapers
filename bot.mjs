// Pixabay -> Telegram wallpaper bot (stdlib only, Node 18+)
// ponytail: sent IDs live in sent.json committed to the repo; switch to a DB only if >10k images.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const QUERIES = ["mountain climbing", "rock climbing", "mountaineering", "mountain peak", "alpine climbing"];
const MIN_HEIGHT = 1600; // px — full-image height, filters out tiny previews
const PER_RUN = 2;       // photos per run
const SENT_FILE = "sent.json";
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

const search = async () => {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const { hits } = await get("https://pixabay.com/api/", {
    key: process.env.PIXABAY_KEY, q, image_type: "photo", orientation: "vertical",
    per_page: 50, safesearch: "true", order: "latest",
  });
  return hits.filter(h => !sent.includes(h.id) && h.imageHeight >= MIN_HEIGHT);
};

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const send = h => get(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendPhoto`, {
  chat_id: process.env.TG_CHAT,
  photo: h.largeImageURL, // Telegram fetches the image itself — no download needed
  caption: `⛰️ ${h.tags}\n📷 ${h.user} — تمام‌صفحه: ${h.pageURL}`.slice(0, 1024),
});

let fresh = [];
try {
  fresh = shuffle(await search());
} catch (e) {
  console.error(`pixabay: ${e.message}`);
  process.exit(1);
}

let n = 0;
for (const h of fresh) {
  if (n >= PER_RUN) break;
  try {
    await send(h);
    n++;
    console.log(`sent #${h.id}`);
  } catch (e) {
    console.log(`skip #${h.id}: ${e.message}`); // Telegram couldn't fetch it; don't retry forever
  }
  sent.push(h.id); // record regardless, so a broken URL never loops
}

if (n) writeFileSync(SENT_FILE, JSON.stringify(sent.slice(-MAX_SENT)));
console.log(n ? `done: ${n} photo(s)` : "nothing new, retry next run");
