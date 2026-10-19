// Hand-entered leagues, stored as a JSON file under apps/api/data (git-ignored).
// This moves into Postgres in the next phase.

import type { ManualLeague, ManualLeagueInput } from '@ffd/shared';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';

const file = () => path.join(config.dataDir, 'manual-leagues.json');

export async function listManualLeagues(): Promise<ManualLeague[]> {
  try {
    return JSON.parse(await fs.readFile(file(), 'utf8')) as ManualLeague[];
  } catch {
    return [];
  }
}

async function saveAll(leagues: ManualLeague[]) {
  await fs.mkdir(config.dataDir, { recursive: true });
  // Write to a temp file then rename, so a crash mid-write can't corrupt the data.
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(leagues, null, 2));
  await fs.rename(tmp, file());
}

export async function createManualLeague(input: ManualLeagueInput): Promise<ManualLeague> {
  const league: ManualLeague = {
    ...input,
    id: crypto.randomUUID(),
    platform: 'ffpc',
    updatedAt: new Date().toISOString(),
  };
  await saveAll([...(await listManualLeagues()), league]);
  return league;
}

export async function updateManualLeague(id: string, input: ManualLeagueInput): Promise<ManualLeague | null> {
  const leagues = await listManualLeagues();
  const existing = leagues.find((l) => l.id === id);
  if (!existing) return null;
  const updated: ManualLeague = { ...existing, ...input, updatedAt: new Date().toISOString() };
  await saveAll(leagues.map((l) => (l.id === id ? updated : l)));
  return updated;
}

export async function deleteManualLeague(id: string): Promise<boolean> {
  const leagues = await listManualLeagues();
  const remaining = leagues.filter((l) => l.id !== id);
  if (remaining.length === leagues.length) return false;
  await saveAll(remaining);
  return true;
}
