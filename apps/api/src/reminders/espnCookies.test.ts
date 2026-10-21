import { describe, expect, it } from 'vitest';
import { espnCookieAlert } from './send.js';

describe('espnCookieAlert', () => {
  const now = new Date('2026-10-21T14:00:00Z');

  it('says nothing while ESPN accepts the cookies', () => {
    expect(espnCookieAlert({ errors: [{ source: 'sleeper', message: 'down' }] }, now)).toBeNull();
  });

  it('says how to fix refused cookies, keyed so it goes out once a day', () => {
    const alert = espnCookieAlert({ errors: [{ source: 'espn:1', message: 'rejected', code: 'espn-cookies' }] }, now)!;
    expect(alert.key).toBe('espn-cookies:2026-10-21');
    expect(alert.message.body).toContain('update ESPN_S2 and ESPN_SWID');
    expect(espnCookieAlert({ errors: [{ source: 'espn:1', message: 'rejected', code: 'espn-cookies' }] }, new Date('2026-10-22T14:00:00Z'))!.key).toBe('espn-cookies:2026-10-22');
  });
});
