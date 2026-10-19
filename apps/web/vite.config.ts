import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // basicSsl serves the dev site over HTTPS with a self-signed certificate,
  // because Yahoo only accepts https:// OAuth redirect URIs.
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    port: 5173,
    strictPort: true, // the Yahoo redirect URI is registered for this exact port
    // During development, forward /api calls to the Fastify server.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
