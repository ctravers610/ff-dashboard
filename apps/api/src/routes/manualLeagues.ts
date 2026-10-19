import type { ManualLeagueInput } from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import {
  createManualLeague,
  deleteManualLeague,
  listManualLeagues,
  updateManualLeague,
} from '../adapters/manual/store.js';

const sideSchema = {
  type: 'object',
  required: ['teamName', 'points', 'starters'],
  additionalProperties: false,
  properties: {
    teamName: { type: 'string', maxLength: 80 },
    points: { type: 'number' },
    projected: { type: ['number', 'null'] },
    starters: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        required: ['slot', 'name', 'points'],
        additionalProperties: false,
        properties: {
          slot: { type: 'string', maxLength: 12 },
          name: { type: 'string', maxLength: 80 },
          points: { type: 'number' },
        },
      },
    },
  },
} as const;

// Fastify validates request bodies against this JSON schema before our handler
// runs, and responds 400 automatically when they don't match.
const inputSchema = {
  type: 'object',
  required: ['name', 'teamName', 'rosterText'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    teamName: { type: 'string', maxLength: 80 },
    rosterText: { type: 'string', maxLength: 50000 }, // room for a whole pasted FFPC page
    matchup: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['week', 'capturedAt', 'me', 'opponent'],
          additionalProperties: false,
          properties: {
            week: { type: 'integer', minimum: 0, maximum: 25 },
            capturedAt: { type: 'string', format: 'date-time' },
            me: sideSchema,
            opponent: sideSchema,
            scoreboard: {
              type: 'array',
              maxItems: 40,
              items: {
                type: 'object',
                required: ['teamName', 'points', 'projected'],
                additionalProperties: false,
                properties: {
                  teamName: { type: 'string', maxLength: 80 },
                  points: { type: 'number' },
                  projected: { type: ['number', 'null'] },
                },
              },
            },
          },
        },
      ],
    },
  },
} as const;

interface IdParams {
  id: string;
}

export async function manualLeagueRoutes(app: FastifyInstance) {
  app.get('/api/manual-leagues', async () => listManualLeagues());

  app.post<{ Body: ManualLeagueInput }>('/api/manual-leagues', { schema: { body: inputSchema } }, async (req, reply) =>
    reply.code(201).send(await createManualLeague(req.body)),
  );

  app.put<{ Params: IdParams; Body: ManualLeagueInput }>(
    '/api/manual-leagues/:id',
    { schema: { body: inputSchema } },
    async (req, reply) => {
      const league = await updateManualLeague(req.params.id, req.body);
      return league ?? reply.code(404).send({ error: 'League not found' });
    },
  );

  app.delete<{ Params: IdParams }>('/api/manual-leagues/:id', async (req, reply) =>
    (await deleteManualLeague(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: 'League not found' }),
  );
}
