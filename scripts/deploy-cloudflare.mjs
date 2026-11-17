import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Read existing configuration without changing .env.local or logging its values.
nextEnv.loadEnvConfig(process.cwd());
const deployment = JSON.parse(await readFile(new URL("../config/cloudflare-deployment.json", import.meta.url), "utf8"));
const externalPush = deployment.pushDelivery === "external";
if (!externalPush) throw new Error("โปรเจกต์นี้ใช้ตัวส่งแจ้งเตือนเดิมร่วมกับ Vercel กรุณาตั้ง pushDelivery เป็น external");
const ciDeployment = process.argv.includes("--ci");
if (externalPush) {
  if (!/^[A-Za-z0-9_-]{87}=?$/.test(deployment.pushPublicKey)) throw new Error("ไม่พบกุญแจสาธารณะสำหรับการแจ้งเตือนชุดเดิม");
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = deployment.pushPublicKey;
  process.env.TALEVO_PUSH_DELIVERY = "external";
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  if (!process.env[name]?.trim()) throw new Error(`กรุณาตั้งค่า ${name} ก่อนเผยแพร่`);
}
const directory = new URL("../.cloudflare/deploy/", import.meta.url);
await mkdir(directory, { recursive: true });
process.env.TALEVO_CLOUDFLARE = "1";

const names = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TALEVO_AI_PROVIDER",
  "GROQ_API_KEY", "GEMINI_API_KEY", "TALEVO_AI_MODEL", "TALEVO_VISION_MODEL",
  "TALEVO_TIMETABLE_MODEL", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT", "PUSH_DISPATCH_SECRET", "TALEVO_CLOUDFLARE", "TALEVO_PUSH_DELIVERY",
];
const configured = names.filter(name => process.env[name]?.trim()
  && (!externalPush || !["VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "PUSH_DISPATCH_SECRET"].includes(name)));
const secrets = Object.fromEntries(configured.map(name => [name, process.env[name].trim()]));
function run(entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  let output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  for (const name of configured.filter(name => /KEY|SECRET/.test(name))) output = output.replaceAll(process.env[name].trim(), "[redacted]");
  console.log(output);
  if (result.error || result.status !== 0) throw new Error(`Cloudflare command failed (${result.status ?? "spawn"}).`);
}

if (process.argv.includes("--push-secrets-only")) {
  throw new Error("ใช้ตัวส่งแจ้งเตือนเดิมบน Vercel ไม่ต้องตั้งกุญแจให้ตัวเรียก Cloudflare");
} else if (process.argv.includes("--prepare-only")) {
  console.log("เตรียมการตั้งค่า Cloudflare แล้ว โดยใช้กุญแจสาธารณะและตัวส่งแจ้งเตือนเดิมร่วมกับ Vercel");
} else {
  if (!process.argv.includes("--skip-build")) run("node_modules/vite/bin/vite.js", ["build"]);
  if (process.argv.includes("--build-only")) process.exit(0);
  if (ciDeployment) {
    // Existing Worker secrets remain on Cloudflare; CI needs no database admin or AI keys.
    run("node_modules/cf/bin/cf", ["deploy", "--prebuilt", "--mode", "production"]);
    process.exit(0);
  }
  const path = new URL("runtime-secrets.json", directory);
  try {
    await writeFile(path, JSON.stringify(secrets), { mode: 0o600 });
    run("node_modules/cf/bin/cf", ["deploy", "--prebuilt", "--mode", "production", "--secrets-file", fileURLToPath(path)]);
  } finally { await rm(path, { force: true }); }
}
