/* eslint-disable @typescript-eslint/no-require-imports */
// Controlled requests and mocks only: no real accounts, network, or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const state = { user: null, quota: { allowed: true }, quotaError: null };
async function getUser() { if (state.authThrows) throw new Error('private upstream failure'); return { data: { user: state.user }, error: null }; }
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args);
};
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'server-only') return {};
  if (name === '@supabase/ssr') return { createServerClient: () => ({ auth: { getUser } }) };
  if (name === '@/lib/supabase/config') return { getSupabaseConfiguration: () => ({ url: 'https://database.test', publishableKey: 'test-public-key' }) };
  if (name === '@/lib/supabase/server') return { createClient: async () => ({
    auth: { getUser },
    rpc: async () => ({ data: state.quota, error: state.quotaError }),
  }) };
  return load.call(this, name, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file,
}).outputText, file);
const { NextRequest } = require('next/server');
const { secureApi, readBoundedBody } = require('../src/lib/security/api-guard.ts');
const { parseVisionSession } = require('../src/lib/security/local-data.ts');
const { takeLocalLimit } = require('../src/lib/security/rate-limit.ts');
const { isTrustedPushEndpoint } = require('../src/lib/push/endpoint.ts');
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function req(body, origin = 'https://talevo.test', method = 'POST', signal) {
  return new NextRequest('https://talevo.test/api/push/queue', { method, signal,
    headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
(async () => {
  let called = 0;
  const handler = secureApi(async request => { called++; return Response.json(await request.json()); }, '/api/push/queue', 'POST');
  await check('anonymous requests stop before handler', async () => { assert.equal((await handler(req({ rows: [] }))).status, 401); assert.equal(called, 0); });
  state.user = { id: 'test-a' };
  await check('cross-origin mutation is rejected', async () => assert.equal((await handler(req({ rows: [] }, 'https://evil.test'))).status, 403));
  await check('unknown fields and prototype pollution are rejected', async () => {
    for (const body of [{ rows: [], role: 'admin' }, JSON.parse('{"rows":[],"__proto__":{"admin":true}}')]) assert.equal((await handler(req(body))).status, 400);
  });
  await check('valid payload reaches handler without mutation', async () => { const response = await handler(req({ rows: [] })); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { rows: [] }); assert.match(response.headers.get('cache-control'), /no-store/); });
  await check('method mismatch cannot reach handler', async () => assert.equal((await handler(req(undefined, undefined, 'GET'))).status, 405));
  await check('database quota denial returns Retry-After', async () => { state.quota = { allowed: false, retry_after: 17 }; const response = await handler(req({ rows: [] })); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '17'); state.quota = { allowed: true }; });
  await check('quota outage fails closed', async () => { state.quotaError = { message: 'private error' }; const response = await handler(req({ rows: [] })); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private error')); state.quotaError = null; });
  await check('streamed body over limit is rejected without Content-Length', async () => { await assert.rejects(readBoundedBody(new Request('https://talevo.test', { method: 'POST', body: '12345' }), 4), error => error.status === 413); });
  await check('abort signal survives request reconstruction', async () => {
    const controller = new AbortController();
    const abortHandler = secureApi(async request => { controller.abort(); assert.equal(request.signal.aborted, true); return Response.json({}); }, '/api/push/queue', 'POST');
    assert.equal((await abortHandler(req({ rows: [] }, undefined, 'POST', controller.signal))).status, 200);
  });
  await check('legacy Vision session migrates without changing original', async () => { const old = { owner: 'a', expires: Date.now() + 10000, images: [], items: [], savedIds: ['kept'] }; assert.equal(parseVisionSession(old, 'a').schemaVersion, 1); assert.equal(old.schemaVersion, undefined); assert.deepEqual(parseVisionSession(old, 'a').savedIds, ['kept']); assert.equal(parseVisionSession(old, 'b'), null); assert.equal(parseVisionSession({ ...old, items: 'corrupt' }, 'a'), null); });
  await check('burst counter expires and isolates callers', async () => { const key = crypto.randomUUID(); assert.ok(takeLocalLimit(key, 1, 1000).allowed); assert.ok(!takeLocalLimit(key, 1, 1001).allowed); assert.ok(takeLocalLimit(key + '-b', 1, 1001).allowed); assert.ok(takeLocalLimit(key, 1, 61001).allowed); });
  const { checkRequestBoundary } = await import('../workers/request-boundary.mjs');
  const { updateSession } = require('../src/lib/supabase/proxy.ts');
  await check('forged session cookie never grants protected page access', async () => {
    state.user = null;
    const response = await updateSession(new NextRequest('https://talevo.test/admin', { headers: { cookie: 'sb-fake-auth-token=forged' } }));
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  });
  await check('auth outage withholds protected page and preserves cookie', async () => {
    state.authThrows = true;
    const response = await updateSession(new NextRequest('https://talevo.test/today', { headers: { cookie: 'sb-fake-auth-token=existing' } }));
    assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null); assert.ok(!(await response.text()).includes('private upstream'));
    state.authThrows = false;
  });
  await check('push destination allowlist rejects SSRF and credentials', async () => {
    for (const url of ['http://127.0.0.1/', 'https://169.254.169.254/', 'https://fcm.googleapis.com.evil.test/fcm/send/a', 'https://user:password@fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com:444/fcm/send/a']) assert.equal(isTrustedPushEndpoint(url), false);
    assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/test-endpoint'), true);
  });
  await check('Cloudflare boundary blocks excess before application', async () => {
    let key;
    const request = new Request('https://talevo.test/api/time', { headers: { 'cf-connecting-ip': '192.0.2.1' } });
    const response = await checkRequestBoundary(request, { API_BURST_LIMITER: { limit: async input => { key = input.key; return { success: false }; } } });
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); assert.equal(key.length, 64); assert.ok(!key.includes('192.0.2.1'));
    assert.equal(await checkRequestBoundary(new Request('https://talevo.test/login'), {}), null);
    assert.equal((await checkRequestBoundary(request, {})).status, 503);
    assert.equal(await checkRequestBoundary(request, { API_BURST_LIMITER: { limit: async () => ({ success: true }) } }), null);
    assert.equal((await checkRequestBoundary(new Request('https://talevo.test/api/time', { headers: { 'content-length': '999999999' } }), {})).status, 413);
  });
  console.log(`Security runtime: ${passed} controlled checks passed. No live data changed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
