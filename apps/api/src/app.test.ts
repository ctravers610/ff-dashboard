import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

// A stand-in for the built web app: an index.html plus one fingerprinted asset.
let webDist: string;
beforeAll(async () => {
  webDist = await fs.mkdtemp(path.join(os.tmpdir(), 'ffd-web-'));
  await fs.mkdir(path.join(webDist, 'assets'));
  await fs.writeFile(path.join(webDist, 'index.html'), '<!doctype html><title>Fantasy Dashboard</title>');
  await fs.writeFile(path.join(webDist, 'assets', 'index-abc123.js'), 'console.log("app")');
});
afterAll(async () => {
  await fs.rm(webDist, { recursive: true, force: true });
});

describe('health', () => {
  it('reports that the API is up and which commit is running', async () => {
    const app = await buildApp({ logger: false, webDist: null });
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, commit: 'dev' });
    expect(new Date(res.json().startedAt).getTime()).not.toBeNaN();
  });
});

describe('serving the web app', () => {
  it('serves index.html at the root, re-checked on every visit', async () => {
    const app = await buildApp({ logger: false, webDist });
    const res = await app.inject({ url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Fantasy Dashboard');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('lets browsers cache fingerprinted assets for a year', async () => {
    const app = await buildApp({ logger: false, webDist });
    const res = await app.inject({ url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('answers a bookmarked page address with the app', async () => {
    const app = await buildApp({ logger: false, webDist });
    const res = await app.inject({ url: '/history' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Fantasy Dashboard');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('keeps unknown API paths a JSON 404, never the HTML page', async () => {
    const app = await buildApp({ logger: false, webDist });
    for (const req of [{ url: '/api/nope' }, { url: '/whatever', method: 'POST' as const }]) {
      const res = await app.inject(req);
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
    }
  });

  it('serves only the API when there is no web build', async () => {
    const app = await buildApp({ logger: false, webDist: path.join(webDist, 'missing') });
    expect((await app.inject({ url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });
});
