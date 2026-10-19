#!/usr/bin/env node
// Smoke test for a running deployment: the local container, the image CI just
// built, or the live site after a deploy.
//
//   node scripts/smoke-test.mjs <base-url> [expected-commit]
//   node scripts/smoke-test.mjs http://localhost:8080 $(git rev-parse HEAD)
//
// Waits for the app to come up (free hosts can take a minute to wake), then
// checks the things that only break in a production build: the bundle starts,
// the database is reachable, the web app and its assets are served with the
// right caching, and API errors stay JSON.

const [baseUrl, expectedCommit] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: node scripts/smoke-test.mjs <base-url> [expected-commit]');
  process.exit(2);
}
const url = (path) => new URL(path, baseUrl).toString();

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: e instanceof Error ? e.message : String(e) });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url('/api/health'), { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return res.json();
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`/api/health never answered OK within ${timeoutMs / 1000}s (last: ${last})`);
}

let health;
await check('the app comes up and /api/health answers', async () => {
  health = await waitForHealth();
  assert(health.ok === true, `ok was ${health.ok}`);
});

if (expectedCommit) {
  await check('the expected commit is the one running', async () => {
    assert(health?.commit === expectedCommit, `running ${health?.commit}, expected ${expectedCommit}`);
  });
}

let indexHtml = '';
await check('the web app is served at /, re-checked on every visit', async () => {
  const res = await fetch(url('/'));
  indexHtml = await res.text();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(res.headers.get('content-type')?.includes('text/html'), `content-type ${res.headers.get('content-type')}`);
  assert(indexHtml.includes('<div id="root">'), 'no React root element in the page');
  assert(res.headers.get('cache-control') === 'no-cache', `cache-control ${res.headers.get('cache-control')}`);
});

await check('the JavaScript bundle loads, cached for a year', async () => {
  const src = /<script[^>]+src="([^"]+\.js)"/.exec(indexHtml)?.[1];
  assert(src, 'no script tag in the page');
  const res = await fetch(url(src));
  assert(res.status === 200, `${src}: HTTP ${res.status}`);
  assert(res.headers.get('cache-control')?.includes('immutable'), `${src}: cache-control ${res.headers.get('cache-control')}`);
});

await check('a bookmarked page address still loads the app', async () => {
  const res = await fetch(url('/history'));
  assert(res.status === 200 && (await res.text()).includes('<div id="root">'), `HTTP ${res.status}`);
});

await check('unknown API paths answer with a JSON 404', async () => {
  const res = await fetch(url('/api/this-route-does-not-exist'));
  assert(res.status === 404, `HTTP ${res.status}`);
  assert(res.headers.get('content-type')?.includes('application/json'), `content-type ${res.headers.get('content-type')}`);
});

await check('the database is reachable and migrated', async () => {
  const res = await fetch(url('/api/manual-leagues'));
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(Array.isArray(await res.json()), 'expected a JSON array of leagues');
});

for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : `\n    ${r.why}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed against ${baseUrl}` : `\nAll ${results.length} checks passed against ${baseUrl}`);
// Set the code and let Node exit on its own once open connections close:
// process.exit() mid-connection can crash Node on Windows and lose the result.
process.exitCode = failed ? 1 : 0;
