import {
  convertFfpcLivePage,
  looksLikeFfpcFaabReport,
  looksLikeFfpcLiveScoring,
  looksLikeFfpcWaivers,
  parseFfpcFaabReport,
  parseFfpcHeader,
  parseFfpcWaivers,
  type FfpcFaabPasted,
  type FfpcFaabWeeks,
  type FfpcWeekPasted,
  type FfpcWeeksPasted,
  type ManualLeague,
  type ManualLeagueInput,
} from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import { rescorePastedWeek } from '../adapters/manual/history.js';
import { manualLeagueRepo, matchupSeason, type manualLeagueStore } from '../adapters/manual/store.js';
import { weekOnDate } from '../history.js';

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

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

const pastedPage = { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', maxLength: 200000 } } } as const;

const seasonNow = () => matchupSeason({ capturedAt: new Date().toISOString() });

// Catches pasting one league's page into another: FFPC puts the league number in the page header.
function wrongLeague(text: string, league: ManualLeague): string | null {
  const page = /#\d+/.exec(parseFfpcHeader(text)?.leagueName ?? '')?.[0];
  const expected = /#\d+/.exec(league.name)?.[0];
  return page && expected && page !== expected ? `That page is for league ${page}, not ${league.name}.` : null;
}

// A factory so tests can hand in a store bound to a throwaway database.
export const manualLeagueRoutes = (store: ReturnType<typeof manualLeagueStore> = manualLeagueRepo, rescore = rescorePastedWeek) =>
  async function (app: FastifyInstance) {
    app.get('/api/manual-leagues', async () => store.list());

    app.post<{ Body: ManualLeagueInput }>('/api/manual-leagues', { schema: { body: inputSchema } }, async (req, reply) =>
      reply.code(201).send(await store.create(req.body)),
    );

    app.put<{ Params: IdParams; Body: ManualLeagueInput }>(
      '/api/manual-leagues/:id',
      { schema: { params: idParams, body: inputSchema } },
      async (req, reply) => {
        const league = await store.update(req.params.id, req.body);
        return league ?? reply.code(404).send({ error: 'League not found' });
      },
    );

    // FFPC's add/drop page, pasted for the Waivers tab.
    app.put<{ Params: IdParams; Body: { text: string } }>(
      '/api/manual-leagues/:id/waivers',
      {
        schema: {
          params: idParams,
          body: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', maxLength: 200000 } } },
        },
      },
      async (req, reply) => {
        const league = (await store.list()).find((l) => l.id === req.params.id);
        if (!league) return reply.code(404).send({ error: 'League not found' });
        if (!looksLikeFfpcWaivers(req.body.text)) {
          return reply.code(400).send({ message: "That doesn't look like FFPC's add/drop page. Open the league's free agents page, then Ctrl+A, Ctrl+C." });
        }
        // Catch pasting one league's page into another: FFPC puts the league number in the page header.
        const { leagueNumber } = parseFfpcWaivers(req.body.text);
        const expected = /#\d+/.exec(league.name)?.[0];
        if (leagueNumber && expected && leagueNumber !== expected) {
          return reply.code(400).send({ message: `That page is for league ${leagueNumber}, not ${league.name}.` });
        }
        return store.setWaivers(req.params.id, req.body.text);
      },
    );

    // Which of this season's weeks have a pasted page, for the History tab.
    app.get<{ Params: IdParams; Reply: FfpcWeeksPasted }>('/api/manual-leagues/:id/history', { schema: { params: idParams } }, async (req) => {
      const weeks = await store.matchupWeeks(req.params.id, seasonNow());
      return { weeks: weeks.map((w) => w.week) };
    });

    // A finished week's Live Scoring page, pasted for the History tab. Unlike the
    // league dialog's weekly paste, it leaves the roster and current matchup alone.
    app.put<{ Params: IdParams; Body: { text: string } }>(
      '/api/manual-leagues/:id/history',
      { schema: { params: idParams, body: pastedPage } },
      async (req, reply): Promise<FfpcWeekPasted | void> => {
        const league = (await store.list()).find((l) => l.id === req.params.id);
        if (!league) return reply.code(404).send({ error: 'League not found' });
        const { text } = req.body;
        if (!looksLikeFfpcLiveScoring(text)) {
          const message = looksLikeFfpcFaabReport(text) ? "That's a FAAB Report: paste it in the Waivers tab." : "That doesn't look like FFPC's Live Scoring page. Open the week's page, then Ctrl+A, Ctrl+C.";
          return reply.code(400).send({ message });
        }
        const wrong = wrongLeague(text, league);
        if (wrong) return reply.code(400).send({ message: wrong });

        const myTeam = parseFfpcHeader(text)?.teamName || league.teamName;
        const matchup = convertFfpcLivePage(text, myTeam)?.matchup;
        if (!matchup?.week) return reply.code(400).send({ message: "Couldn't find which week that page is for." });
        if (matchup.me.teamName.toLowerCase() !== myTeam.toLowerCase()) {
          return reply.code(400).send({ message: `That page shows ${matchup.me.teamName} vs ${matchup.opponent.teamName}, not your matchup.` });
        }
        await store.archiveWeek(league.id, matchup);
        // The paste is safe either way: if the stat feeds are down, a later backfill scores it.
        const row = await rescore(league, matchup).catch((e: unknown) => {
          console.error(`Could not score FFPC week ${matchup.week} yet:`, e);
          return null;
        });
        return {
          week: matchup.week,
          teamName: matchup.me.teamName,
          opponentName: matchup.opponent.teamName,
          points: row?.points ?? null,
          opponentPoints: row?.opponentPoints ?? null,
        };
      },
    );

    // Which of this season's weeks have claims from a FAAB Report, for the Waivers tab.
    app.get<{ Params: IdParams; Reply: FfpcFaabWeeks }>('/api/manual-leagues/:id/faab', { schema: { params: idParams } }, async (req) => {
      const counts = new Map<number, number>();
      for (const c of await store.faabClaims(seasonNow())) if (c.leagueId === req.params.id) counts.set(c.week, (counts.get(c.week) ?? 0) + 1);
      return { weeks: [...counts].sort((a, b) => a[0] - b[0]).map(([week, claims]) => ({ week, claims })) };
    });

    // FFPC's FAAB Report, pasted for the Waivers tab: its claims go to the bid model.
    app.put<{ Params: IdParams; Body: { text: string } }>(
      '/api/manual-leagues/:id/faab',
      { schema: { params: idParams, body: pastedPage } },
      async (req, reply): Promise<FfpcFaabPasted | void> => {
        const league = (await store.list()).find((l) => l.id === req.params.id);
        if (!league) return reply.code(404).send({ error: 'League not found' });
        const { text } = req.body;
        if (!looksLikeFfpcFaabReport(text)) {
          const message = looksLikeFfpcLiveScoring(text) ? "That's a Live Scoring page: paste it in the History tab." : "That doesn't look like FFPC's FAAB Report. Open the report, then Ctrl+A, Ctrl+C.";
          return reply.code(400).send({ message });
        }
        const wrong = wrongLeague(text, league);
        if (wrong) return reply.code(400).send({ message: wrong });

        const season = seasonNow();
        const claims = parseFfpcFaabReport(text, season).map((c) => ({ ...c, week: weekOnDate(season, c.runOn) }));
        if (claims.length === 0) return reply.code(400).send({ message: 'That FAAB Report has no processed bids in it.' });
        const added = await store.saveFaabClaims(league.id, season, claims);
        return { claims: claims.length, added, weeks: [...new Set(claims.map((c) => c.week))].sort((a, b) => a - b) };
      },
    );

    app.delete<{ Params: IdParams }>('/api/manual-leagues/:id', { schema: { params: idParams } }, async (req, reply) =>
      (await store.remove(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: 'League not found' }),
    );
  };
