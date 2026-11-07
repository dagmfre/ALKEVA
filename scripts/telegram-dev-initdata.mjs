#!/usr/bin/env node
/**
 * DEV ONLY — mint Telegram Mini App initData signed with the LOCAL bot token,
 * exactly as Telegram signs it (core.telegram.org/bots/webapps). Lets the
 * whole Mini App flow run in a normal browser at http://tg.localhost:3000
 * without a Telegram client:
 *
 *   node scripts/telegram-dev-initdata.mjs --id 1001 --first Abebe --username abebe_dev
 *   → prints the initData string and a launch URL with it in the fragment.
 *
 * Options: --id <n> --first <name> --last <name> --username <u> --lang <code>
 *          --start <start_param> --age <seconds old> --bot   (marks is_bot)
 *
 * Refuses to run with NODE_ENV=production or without TELEGRAM_BOT_TOKEN in
 * the repo .env. The token never leaves this machine; only the HMAC does.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") {
  console.error("refusing: NODE_ENV=production");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const user = {
  id: Number(opt("id", "1001")),
  first_name: opt("first", "Dev"),
  ...(opt("last") ? { last_name: opt("last") } : {}),
  ...(opt("username") ? { username: opt("username") } : {}),
  language_code: opt("lang", "en"),
  allows_write_to_pm: true,
  ...(flag("bot") ? { is_bot: true } : {}),
};
const fields = {
  auth_date: String(Math.floor(Date.now() / 1000) - Number(opt("age", "0"))),
  query_id: `AAE${Math.random().toString(36).slice(2, 12)}`,
  user: JSON.stringify(user),
  ...(opt("start") ? { start_param: opt("start") } : {}),
};

const checkString = Object.keys(fields)
  .sort()
  .map((k) => `${k}=${fields[k]}`)
  .join("\n");
const secret = createHmac("sha256", "WebAppData").update(token).digest();
const hash = createHmac("sha256", secret).update(checkString).digest("hex");
const initData = new URLSearchParams({ ...fields, hash }).toString();

const origin = env.TELEGRAM_WEBAPP_ORIGIN || "http://tg.localhost:3000";
console.log(initData);
console.error(`\nlaunch: ${origin}/#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=tdesktop`);
