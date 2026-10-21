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
// right caching, sign-in guards the data, and API errors stay JSON.

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

let me;
await check('/api/auth/me says whether sign-in is on', async () => {
  const res = await fetch(url('/api/auth/me'));
  assert(res.status === 200, `HTTP ${res.status}`);
  me = await res.json();
  assert(typeof me.authEnabled === 'boolean', 'no authEnabled field');
  assert(me.user === null, 'a request without a cookie should not be signed in');
});

if (me?.authEnabled) {
  await check('signed out, the data routes refuse with a JSON 401', async () => {
    for (const path of ['/api/dashboard', '/api/manual-leagues', '/api/history']) {
      const res = await fetch(url(path));
      assert(res.status === 401, `${path}: HTTP ${res.status}`);
      assert(res.headers.get('content-type')?.includes('application/json'), `${path}: content-type ${res.headers.get('content-type')}`);
    }
  });

  await check('the GitHub sign-in starts with a redirect and a state cookie', async () => {
    const res = await fetch(url('/api/auth/github/login'), { redirect: 'manual' });
    assert(res.status === 302, `HTTP ${res.status}`);
    assert(res.headers.get('location')?.includes('/login/oauth/authorize?'), `location ${res.headers.get('location')}`);
    const cookie = res.headers.get('set-cookie') ?? '';
    assert(/HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie), `state cookie ${cookie.split(';')[0]}… lacks HttpOnly/SameSite`);
  });
} else if (me?.demo) {
  await check('the demo shows its made-up leagues without signing in', async () => {
    const res = await fetch(url('/api/dashboard'));
    const body = await res.json().catch(() => ({}));
    assert(res.status === 200, `HTTP ${res.status}`);
    assert((body.leagues?.length ?? 0) >= 3, `${body.leagues?.length ?? 0} leagues`);
  });

  await check('the demo refuses every change with a JSON 403', async () => {
    for (const [method, path] of [['POST', '/api/manual-leagues'], ['POST', '/api/live/poll'], ['DELETE', '/api/sources/1']]) {
      const res = await fetch(url(path), { method });
      assert(res.status === 403, `${method} ${path}: HTTP ${res.status}`);
      assert(res.headers.get('content-type')?.includes('application/json'), `${method} ${path}: content-type ${res.headers.get('content-type')}`);
    }
  });
} else {
  console.warn('! Sign-in is off on this deployment: anyone who can reach it can see the data.');
}

// Signed out, the guard answers before routing (401), so either is fine, as long as it's JSON.
await check('unknown API paths answer with JSON, never the HTML page', async () => {
  const res = await fetch(url('/api/this-route-does-not-exist'));
  assert(res.status === (me?.authEnabled ? 401 : 404), `HTTP ${res.status}`);
  assert(res.headers.get('content-type')?.includes('application/json'), `content-type ${res.headers.get('content-type')}`);
});

await check('the database is reachable and migrated', async () => {
  const res = await fetch(url('/api/health?deep=1'));
  const body = await res.json().catch(() => ({}));
  assert(res.status === 200 && body.database === 'ok', `HTTP ${res.status}, database ${body.database}`);
});

for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : `\n    ${r.why}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed against ${baseUrl}` : `\nAll ${results.length} checks passed against ${baseUrl}`);
// Set the code and let Node exit on its own once open connections close:
// process.exit() mid-connection can crash Node on Windows and lose the result.
process.exitCode = failed ? 1 : 0;
