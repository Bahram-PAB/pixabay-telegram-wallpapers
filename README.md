# ربات والپور تلگرام از Pixabay 🏔️

هر روز عکس‌های عمودی رایگانِ کوه و سنگنوردی را از Pixabay می‌گیرد و به تلگرام می‌فرستد — بدون سرور، فقط با GitHub Actions.

## راه‌اندازی (حدود ۵ دقیقه)

1. **کلید Pixabay** (رایگان): در [pixabay.com](https://pixabay.com) ثبت‌نام کن؛ کلیدت همین‌جاست: <https://pixabay.com/api/docs/>
2. **ربات تلگرام**: در [@BotFather](https://t.me/BotFather) دستور `/newbot` بزن و توکن را کپی کن.
3. **chat id**: به رباتت یک پیام بده، بعد این آدرس را در مرورگر باز کن:
   `https://api.telegram.org/bot<توکن>/getUpdates`
   و عدد `chat.id` را بردار. (برای کانال: ربات را ادمین کانال کن و به جای عدد `@نام‌کانال` بگذار.)
4. یک ریپوی جدید بساز، این فایل‌ها را آپلود کن، و در **Settings → Secrets and variables → Actions** سه secret اضافه کن:
   - `PIXABAY_KEY`
   - `TG_TOKEN`
   - `TG_CHAT`
5. تست: تب **Actions → wallpapers → Run workflow**

## تنظیمات

| چی | کجا |
|---|---|
| ساعات ارسال | `cron` در `.github/workflows/send.yml` (به وقت UTC) |
| تعداد عکس در هر اجرا | `PER_RUN` در `bot.mjs` |
| کمترین ارتفاع قابل قبول | `MIN_HEIGHT` در `bot.mjs` |
| موضوع‌ها | آرایه `QUERIES` در `bot.mjs` |

## نکته‌ها

- همه عکس‌های Pixabay طبق [Pixabay Content License](https://pixabay.com/service/license-summary/) رایگان‌اند — حتی استفاده تجاری، بدون نیاز به ذکر منبع.
- توکن‌ها فقط در Secrets باشند، هرگز داخل کد.
- ریپوی **عمومی** = اکشنز رایگان و نامحدود؛ خصوصی هم ماهی ۲۰۰۰ دقیقه رایگان دارد (این ربات کمتر از ۱ دقیقه در هر اجرا مصرف می‌کند).
- فایل `sent.json` جلوی ارسال تکراری را می‌گیرد و خودکار commit می‌شود.
