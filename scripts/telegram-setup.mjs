#!/usr/bin/env node
/**
 * One-time / idempotent bot setup (Phase 11). Run on the VPS (or anywhere
 * holding the production values) after the bot exists in @BotFather:
 *
 *   node scripts/telegram-setup.mjs            # apply
 *   node scripts/telegram-setup.mjs --check    # only print getWebhookInfo + getMe
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBAPP_ORIGIN and
 * WEB_ORIGIN from the environment (or ./.env). Sets:
 *   - the webhook  → ${WEB_ORIGIN}/api/webhooks/telegram, with the secret
 *     token, allowed_updates ["message"], drop_pending_updates
 *   - the commands (start / price / help / unlink) in all five languages
 *   - the short + long description in all five languages
 *   - the default menu button → a web_app button opening the Mini App
 * The bot token is never printed; request URLs are never logged.
 */
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, TELEGRAM_WEBAPP_ORIGIN: appOrigin, WEB_ORIGIN: web } = env;
const testEnv = env.TELEGRAM_TEST_ENV === "true";
if (!token || !secret || !appOrigin || !web) {
  console.error("need TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBAPP_ORIGIN, WEB_ORIGIN");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET must be 32-256 chars of A-Z a-z 0-9 _ -");
  process.exit(1);
}
if (!appOrigin.startsWith("https://") || !web.startsWith("https://")) {
  console.error("Telegram requires https origins for the webhook and the Mini App");
  process.exit(1);
}

async function call(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${testEnv ? "test/" : ""}${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(`${method}: ${body.description ?? res.status}`);
  return body.result;
}

const COPY = {
  en: {
    cmd: { start: "Open ALKEVA", price: "Live gold and platinum price", help: "What this bot can do", unlink: "Disconnect Telegram from ALKEVA" },
    short: "Buy and hold real gold and platinum, priced live in birr.",
    long: "ALKEVA is a gold and platinum dealer for Ethiopia. Open the app to buy, sell and hold metal stored in the vault, with every price live in birr and every trade on a receipt. The bot sends notices about your account. It never asks for passwords or codes.",
    menu: "Open ALKEVA",
  },
  am: {
    cmd: { start: "ALKEVAን ክፈት", price: "የወርቅ እና የፕላቲነም ቀጥታ ዋጋ", help: "ይህ ቦት ምን ይሰራል", unlink: "ቴሌግራምን ከALKEVA ያላቅቁ" },
    short: "እውነተኛ ወርቅ እና ፕላቲነም በቀጥታ የብር ዋጋ ይግዙ እና ይያዙ።",
    long: "ALKEVA ለኢትዮጵያ የወርቅ እና የፕላቲነም አከፋፋይ ነው። በካዝና የተቀመጠ ብረት ለመግዛት፣ ለመሸጥ እና ለመያዝ መተግበሪያውን ይክፈቱ — እያንዳንዱ ዋጋ በብር በቀጥታ፣ እያንዳንዱ ግብይት በደረሰኝ። ቦቱ ስለ መለያዎ መልእክቶችን ይልካል፤ የይለፍ ቃል ወይም ኮድ በጭራሽ አይጠይቅም።",
  },
  ti: {
    cmd: { start: "ALKEVA ክፈት", price: "ቀጥታ ዋጋ ወርቅን ፕላቲነምን", help: "እዚ ቦት እንታይ ይገብር", unlink: "ቴሌግራም ካብ ALKEVA ፍለዩ" },
    short: "ሓቀኛ ወርቅን ፕላቲነምን ብቐጥታ ናይ ብር ዋጋ ግዝኡን ሓዙን።",
    long: "ALKEVA ንኢትዮጵያ ናይ ወርቅን ፕላቲነምን ኣከፋፋሊ እዩ። ኣብ ካዝና ዝተቐመጠ ብረት ንምግዛእ፣ ንምሻጥን ንምሓዝን ነቲ መተግበሪ ክፈቱ — ነፍሲ ወከፍ ዋጋ ብብር ብቐጥታ፣ ነፍሲ ወከፍ ግብይት ብደረሰኝ። እቲ ቦት ብዛዕባ ሕሳብኩም መልእኽትታት ይሰድድ፤ ቃል-ምሕላፍ ወይ ኮድ ፈጺሙ ኣይሓትትን።",
  },
  om: {
    cmd: { start: "ALKEVA banuu", price: "Gatii warqee fi pilaatinamii kallattii", help: "Boottiin kun maal hojjeta", unlink: "Telegram ALKEVA irraa adda baasi" },
    short: "Warqee fi pilaatinamii dhugaa gatii qarshii kallattiin bitadhaa qabadhaa.",
    long: "ALKEVA Itoophiyaaf daldalaa warqee fi pilaatinamiiti. Sibiila kuusaa keessa jiru bituu, gurguruu fi qabachuuf appii banaa — gatiin hundi qarshiin kallattii, daldalli hundi nagahee waliin. Boottiin waa'ee herrega keessanii beeksisa erga; jecha darbii ykn koodii gonkumaa hin gaafatu.",
  },
  so: {
    cmd: { start: "Fur ALKEVA", price: "Qiimaha tooska ah ee dahabka iyo platinum-ka", help: "Waxa bot-kani qabto", unlink: "Ka jar Telegram ALKEVA" },
    short: "Iibso oo hayso dahab iyo platinum dhab ah, qiimo birr toos ah.",
    long: "ALKEVA waa ganacsade dahab iyo platinum oo Itoobiya u adeega. Fur app-ka si aad u iibsato, u iibiso oo u haysato bir ku kaydsan khasnadda — qiime kasta waa birr toos ah, ganacsi kastana wuxuu leeyahay rasiid. Bot-ku wuxuu soo diraa ogeysiisyo ku saabsan xisaabtaada; weligiis ma weydiiyo furayaal sir ah ama koodh.",
  },
};

const me = await call("getMe");
console.log(`bot: @${me.username} (id ${me.id})`);

if (!process.argv.includes("--check")) {
  await call("setWebhook", {
    url: `${web}/api/webhooks/telegram`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
    max_connections: 20,
  });
  console.log("webhook set");

  for (const [lang, c] of Object.entries(COPY)) {
    const language_code = lang === "en" ? undefined : lang;
    const commands = Object.entries(c.cmd).map(([command, description]) => ({ command, description }));
    await call("setMyCommands", { commands, ...(language_code ? { language_code } : {}) });
    await call("setMyShortDescription", { short_description: c.short.slice(0, 120), ...(language_code ? { language_code } : {}) });
    await call("setMyDescription", { description: c.long.slice(0, 512), ...(language_code ? { language_code } : {}) });
    console.log(`commands + descriptions: ${lang}`);
  }

  await call("setChatMenuButton", {
    menu_button: { type: "web_app", text: COPY.en.menu, web_app: { url: `${appOrigin}/` } },
  });
  console.log("menu button set");
}

const info = await call("getWebhookInfo");
console.log(
  JSON.stringify(
    {
      url: info.url,
      pending_update_count: info.pending_update_count,
      last_error_date: info.last_error_date ?? null,
      last_error_message: info.last_error_message ?? null,
      allowed_updates: info.allowed_updates,
      ip_address: info.ip_address,
    },
    null,
    2,
  ),
);
