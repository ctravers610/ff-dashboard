import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Forward /api calls to the Fastify server (overridable for end-to-end tests).
const apiProxy = { '/api': process.env.API_URL ?? 'http://127.0.0.1:3001' };

// The dev site is HTTPS because Yahoo only accepts https:// OAuth redirect URIs.
// With a certificate your machine trusts in certs/ (made with mkcert, see the
// README), browsers treat it as fully secure, which push notifications need.
// Otherwise basicSsl makes a self-signed one, which works but isn't trusted.
// DEV_HTTP=1 turns HTTPS off for tools that can't handle either.
const certDir = path.resolve(import.meta.dirname, '../../certs');
const trusted = fs.existsSync(path.join(certDir, 'localhost.pem'))
  ? { cert: fs.readFileSync(path.join(certDir, 'localhost.pem')), key: fs.readFileSync(path.join(certDir, 'localhost-key.pem')) }
  : null;
const https = !process.env.DEV_HTTP;

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(https && !trusted ? [basicSsl()] : [])],
  server: {
    port: 5173,
    strictPort: true, // the Yahoo redirect URI is registered for this exact port
    proxy: apiProxy,
    ...(https && trusted ? { https: trusted } : {}),
  },
  // `vite preview` serves the production build; end-to-end tests run against it.
  preview: { proxy: apiProxy },
});
