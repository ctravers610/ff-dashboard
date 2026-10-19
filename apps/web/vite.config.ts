import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Forward /api calls to the Fastify server (overridable for end-to-end tests).
const apiProxy = { '/api': process.env.API_URL ?? 'http://127.0.0.1:3001' };

export default defineConfig({
  // basicSsl serves the dev site over HTTPS with a self-signed certificate,
  // because Yahoo only accepts https:// OAuth redirect URIs. DEV_HTTP=1 opts
  // out for tools that can't accept a self-signed certificate.
  plugins: [react(), tailwindcss(), ...(process.env.DEV_HTTP ? [] : [basicSsl()])],
  server: {
    port: 5173,
    strictPort: true, // the Yahoo redirect URI is registered for this exact port
    proxy: apiProxy,
  },
  // `vite preview` serves the production build; end-to-end tests run against it.
  preview: { proxy: apiProxy },
});
