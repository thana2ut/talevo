import nextEnv from '@next/env';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const roots = process.argv.slice(2);
if (!roots.length) throw new Error('ระบุโฟลเดอร์ browser assets ที่ต้องการตรวจ');
const names = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'VAPID_PRIVATE_KEY', 'PUSH_DISPATCH_SECRET'];
const secrets = names.filter(name => process.env[name]?.trim().length >= 16).map(name => [name, process.env[name].trim()]);
let scanned = 0;
const failures = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(js|mjs|json|html|map)$/i.test(file)) continue;
    scanned++;
    const text = await readFile(file, 'utf8');
    for (const [name, secret] of secrets) if (text.includes(secret)) failures.push({ file, name });
    if (/\b(?:gsk_|sb_secret_)[A-Za-z0-9_-]{20,}\b/.test(text)) failures.push({ file, name: 'credential-pattern' });
    if (file.endsWith('.map')) failures.push({ file, name: 'public-source-map' });
  }
}
for (const directory of roots) await scan(directory);
// Print paths and variable names only, even on failure.
console.log(JSON.stringify({ scanned, configuredSecretNamesChecked: secrets.map(([name]) => name), failures }));
if (failures.length) process.exitCode = 1;
