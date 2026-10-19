import { describe, expect, it } from 'vitest';
import { convertFfpcPage, looksLikeFfpcPage } from './ffpc';

// Trimmed copy of an FFPC team page (Ctrl+A, Ctrl+C), with made-up league/owner names.
const PAGE = [
  'someowner',
  'My Teams',
  'Test Tourney (Aug 5 9:00 PM) #12345 - Sample Squad (2-3)',
  'Owner: someowner  Record: 2-3-0',
  'Starters',
  'SLOT\tPLAYER\tPOS\tOPP\tBYE\tPRK \tOPRK \tSTART %\tAVG\tLAST\tPROJ\tStart/Sit',
  'QB\tMaye, Drake NE   Submit\tQB\tNYJ',
  'SUN 1:00ET\t11\t8\t4\t91.3\t21.70\t43.20\t23.64\tLOCKED',
  'RB\tTuten, Bhayshul JAC   Submit\tRB\tHOU',
  'SUN 9:30ET\t7\t17\t11\t97.7\t12.74\t11.60\t12.62\t',
  '[Select Action]',
  'WR\tBrown, A.J. NE   Submit\tWR\tNYJ',
  'FLEX\tCorum, Blake LAR   Submit\tRB\tARI',
  'PK\tPineiro, Eddy SF  \tPK\tWAS',
  'DST\tSEA DST  \tDST\t@DEN',
  'Bench',
  'SLOT\tPLAYER\tPOS\tOPP\tBYE\tPRK \tOPRK \tSTART %\tAVG\tLAST\tPROJ\tStart/Sit',
  'RB\tCroskey-Merritt, Jacory WAS O   Submit\tRB\t@SF',
  'RB\tPerine, Samaje CIN  \tRB\tBYE',
  'WR\tEvans, Mike SF Q   Submit\tWR\tWAS',
  'WR\tConcepcion, KC CLE   Submit\tWR\tBAL',
  "WR\tLane, Ja'Kobi BAL   Submit\tWR\t@CLE",
  '©2026 For Players, By Players LLC.',
  'Terms and Conditions',
].join('\n');

describe('FFPC page import', () => {
  it('recognises a copied FFPC roster page', () => {
    expect(looksLikeFfpcPage(PAGE)).toBe(true);
    expect(looksLikeFfpcPage('QB Josh Allen\nBN Najee Harris')).toBe(false);
  });

  it('reads the league and team name from the header', () => {
    const result = convertFfpcPage(PAGE);
    expect(result.leagueName).toBe('Test Tourney #12345');
    expect(result.teamName).toBe('Sample Squad');
  });

  it('converts starters and bench into the simple roster format', () => {
    const result = convertFfpcPage(PAGE);
    expect(result.rosterText.split('\n')).toEqual([
      'QB Drake Maye',
      'RB Bhayshul Tuten',
      'WR A.J. Brown',
      'FLEX Blake Corum',
      'K Eddy Pineiro',
      'DEF SEA DST',
      'BN Jacory Croskey-Merritt',
      'BN Samaje Perine',
      'BN Mike Evans',
      'BN KC Concepcion',
      "BN Ja'Kobi Lane",
    ]);
    expect(result.players).toBe(11);
  });

  it('still works when the browser copies tabs inside the player cell as spaces', () => {
    const result = convertFfpcPage('Starters\nQB Maye, Drake NE   Submit\tQB\tNYJ');
    expect(result.rosterText).toBe('QB Drake Maye');
  });

  it('puts players listed under an IR heading on IR', () => {
    const result = convertFfpcPage('IR\nRB\tBrooks, Jonathon CAR IR\tRB\tBYE');
    expect(result.rosterText).toBe('IR Jonathon Brooks');
  });
});
