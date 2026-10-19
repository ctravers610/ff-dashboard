// Add or remove Sleeper accounts and ESPN leagues from the app. Each is
// checked against the platform before it's saved, so a typo is caught here
// rather than showing up later as a failing league.

import type { LeagueSource, SourcesResponse } from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import { espnClient } from '../adapters/espn/client.js';
import { findMyTeamId } from '../adapters/espn/mapper.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { config } from '../config.js';
import { allSources, sameValue, sourceRepo, type SourceStore } from './store.js';

/** "https://fantasy.espn.com/football/league?leagueId=13396297" or just "13396297". */
export function espnLeagueId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{3,12}$/.test(trimmed)) return trimmed;
  return /[?&]leagueId=(\d{3,12})\b/.exec(trimmed)?.[1] ?? null;
}

class Invalid extends Error {}

async function checkSleeper(input: string): Promise<{ value: string; label: string }> {
  const username = input.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{2,40}$/.test(username)) throw new Invalid('Enter a Sleeper username (letters, numbers and underscores).');
  const user = await sleeperClient.user(username);
  if (!user?.user_id) throw new Invalid(`There's no Sleeper user named "${username}".`);
  const { season } = await sleeperClient.state();
  const leagues = await sleeperClient.leagues(user.user_id, season);
  return { value: username, label: `${user.display_name || username} · ${leagues.length} league${leagues.length === 1 ? '' : 's'} in ${season}` };
}

async function checkEspn(input: string): Promise<{ value: string; label: string }> {
  const leagueId = espnLeagueId(input);
  if (!leagueId) throw new Invalid('Paste the league’s address from ESPN (it contains leagueId=…), or just the number.');
  const auth = config.espnAuth;
  if (!auth) throw new Invalid('ESPN leagues need your ESPN cookies: set ESPN_S2 and ESPN_SWID in .env first (see the README).');
  const { season } = await sleeperClient.state();
  let league;
  try {
    league = await espnClient.league(leagueId, season, auth);
  } catch (e) {
    throw new Invalid(e instanceof Error ? e.message : String(e)); // e.g. "ESPN rejected the cookies…"
  }
  if (findMyTeamId(league, auth.swid) == null) throw new Invalid('You don’t have a team in that ESPN league (with the account your cookies are from).');
  return { value: leagueId, label: league.settings?.name ?? `ESPN league ${leagueId}` };
}

export const sourceRoutes = (store: SourceStore = sourceRepo) =>
  async function (app: FastifyInstance) {
    app.get('/api/sources', async (): Promise<SourcesResponse> => {
      // .env entries are bare usernames and ids; look up what they're called (cached), keeping the raw value if that fails.
      const sources = await Promise.all(
        (await allSources(store)).map(async (s) => {
          if (s.label) return s;
          const check = s.platform === 'sleeper' ? checkSleeper : checkEspn;
          return { ...s, label: await check(s.value).then((c) => c.label, () => null) };
        }),
      );
      return { sources, espnCookies: config.espnAuth != null };
    });

    app.post<{ Body: { platform: LeagueSource['platform']; value: string } }>(
      '/api/sources',
      {
        schema: {
          body: {
            type: 'object',
            required: ['platform', 'value'],
            additionalProperties: false,
            properties: { platform: { type: 'string', enum: ['sleeper', 'espn'] }, value: { type: 'string', minLength: 1, maxLength: 300 } },
          },
        },
      },
      async (req, reply) => {
        const { platform, value } = req.body;
        try {
          const checked = platform === 'sleeper' ? await checkSleeper(value) : await checkEspn(value);
          const existing = (await allSources(store)).find((s) => s.platform === platform && sameValue(platform, s.value, checked.value));
          if (existing) return reply.code(409).send({ message: `${checked.label} is already on your dashboard.` });
          return reply.code(201).send(await store.add(platform, checked.value, checked.label));
        } catch (e) {
          if (e instanceof Invalid) return reply.code(400).send({ message: e.message });
          throw e;
        }
      },
    );

    app.delete<{ Params: { id: number } }>(
      '/api/sources/:id',
      { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } },
      async (req, reply) => ((await store.remove(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ message: 'Not found' })),
    );
  };
