import Fastify from 'fastify';
import { config } from './config.js';
import { getDashboard } from './dashboard.js';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ ok: true }));
app.get('/api/dashboard', async () => getDashboard());

await app.listen({ port: config.port, host: '127.0.0.1' });
