// Pixabay -> Telegram wallpaper bot (stdlib only, Node 18+)
// ponytail: sent IDs live in sent.json committed to the repo; switch to a DB only if >10k images.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";

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

const GEMINI_KEY = process.env.GEMINI_KEY; // optional — falls back to Pixabay tags
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

// چند نمونه برای اینکه لحن دست مدل عادی شود
const EXAMPLES = `نمونه‌ها:
برف می‌بارد —
پای کوه تنها
سنگ تمام می‌خوابد

سنگِ بلند
سایه‌اش در رود
خم می‌شود و می‌ایستد

باد از قله
کوله‌ای سبک می‌کند
راه هنوز جاست`;

const post = async (url, body) => {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

// مدل بینایی: هم دروازهٔ موضوع است هم کپشن‌ساز — یک صدا زدن برای هر دو
// خروجی: «NO» = غیرمرتبط (ارسال نشود)، otherwise = هایکوی فارسی
const describe = async h => {
  if (!GEMINI_KEY) return null;
  try {
    const img = await fetch(h.largeImageURL, { signal: AbortSignal.timeout(30000) });
    if (!img.ok) return null;
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const out = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [
        { inline_data: { mime_type: img.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: b64 } },
        { text: `این تصویر را ببین. اگر موضوع اصلی آن کوه، سنگنوردی، کوه‌نوردی یا مناظر کوهستانی نیست، فقط بنویس: NO
اگر هست، برایش یک کپشن شاعرانهٔ کوتاه فارسی بنویس — حالت هایکو: سه خط کوتاه (۱ تا ۳ کلمه در هر خط)، خطوط با خطِ جدید جدا شوند، تصویرِ صحنه را در ذهن می‌آورد نه توصیف خشک آن، لحنی آرام و تأمل‌برانگیز.
${EXAMPLES}
فقط خود کپشن را بنویس — بدون ایموجی، بدون نقل‌قول، بدون توضیح اضافه.` },
      ] }] },
    );
    const text = out.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      // پاسخ ۲۰۰ اما بدون متن — بلاک ایمنی؟ promptFeedback را لاگ کن
      const fb = JSON.stringify(out.promptFeedback || out.candidates?.[0] || {}).slice(0, 300);
      try { appendFileSync("gemini-debug.log", `${new Date().toISOString()} #${h.id} EMPTY-RESPONSE ${fb}\n`); } catch {}
    }
    return text === "NO" ? "NO" : text || null;
  } catch (e) {
    console.log(`gemini skip #${h.id}: ${e.message}`);
    try { appendFileSync("gemini-debug.log", `${new Date().toISOString()} #${h.id} ${GEMINI_KEY ? "key=present" : "key=MISSING"} ${GEMINI_MODEL}: ${e.message}\n`); } catch {}
    return null;
  }
};

const send = async h => {
  const desc = await describe(h);
  if (desc === "NO") return "off-topic"; // Gemini گفت این عکس کوه نیست — نفرست
  const caption = `⛰️ ${desc || h.tags}\n📷 ${h.user} — تمام‌صفحه: ${h.pageURL}`.slice(0, 1024);
  return get(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendPhoto`, {
    chat_id: process.env.TG_CHAT,
    photo: h.largeImageURL, // Telegram fetches the image itself — no download needed
    caption,
  });
};

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
    const r = await send(h);
    if (r === "off-topic") {
      console.log(`off-topic #${h.id}, skipped`); // Gemini veto — still recorded so it never returns
    } else {
      n++;
      console.log(`sent #${h.id}`);
    }
  } catch (e) {
    console.log(`skip #${h.id}: ${e.message}`); // Telegram couldn't fetch it; don't retry forever
  }
  sent.push(h.id); // record regardless, so a broken URL never loops
}

if (n) writeFileSync(SENT_FILE, JSON.stringify(sent.slice(-MAX_SENT)));
if (existsSync("gemini-debug.log")) {
  // لاگ دیباگ را در ریپو commit کن تا از UI گیت‌هاب قابل خواندن باشد
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("git", ["add", "gemini-debug.log"]);
    execFileSync("git", ["-c", "user.name=bot", "-c", "user.email=bot@users.noreply.github.com", "commit", "-m", "gemini debug [skip ci]"]);
    execFileSync("git", ["push"]);
  } catch {}
}
console.log(n ? `done: ${n} photo(s)` : "nothing new, retry next run");
