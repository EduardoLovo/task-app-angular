import { formatDuration, isRunningLow, parseRateLimit, parseRetryAfter } from './rate-limit';

const NOW = new Date('2026-10-09T12:00:00Z');

describe('parseRateLimit', () => {
  it('junta RateLimit e RateLimit-Policy por política (como nas rotas /auth)', () => {
    const quotas = parseRateLimit(
      '"100-in-900sec"; r=97; t=894, "10-in-900sec"; r=9; t=894',
      '"100-in-900sec"; q=100; w=900; pk=:NzZiZWQzNjJjYTMz:, "10-in-900sec"; q=10; w=900; pk=:NzZiZWQzNjJjYTMz:',
      NOW,
    );

    expect(quotas).toEqual([
      {
        name: '100-in-900sec',
        limit: 100,
        windowSeconds: 900,
        remaining: 97,
        resetAt: new Date('2026-10-09T12:14:54Z'),
      },
      { name: '10-in-900sec', limit: 10, windowSeconds: 900, remaining: 9, resetAt: new Date('2026-10-09T12:14:54Z') },
    ]);
  });

  it('sem RateLimit-Policy, ainda mostra quantas restam', () => {
    const [quota] = parseRateLimit('"100-in-900sec"; r=5; t=10', null, NOW);
    expect(quota).toMatchObject({ remaining: 5, limit: null, windowSeconds: null });
  });

  it('ignora cabeçalho ausente ou item sem r/t válidos', () => {
    expect(parseRateLimit(null, null)).toEqual([]);
    expect(parseRateLimit('"x"; r=abc; t=1, "y"; t=1', null)).toEqual([]);
  });
});

describe('parseRetryAfter', () => {
  it('aceita segundos e data HTTP', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('Fri, 09 Oct 2026 12:01:00 GMT', NOW)).toBe(60);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('logo')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('usa a maior unidade exata', () => {
    expect(formatDuration(900)).toBe('15 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 min 30 s');
    expect(formatDuration(45)).toBe('45 s');
  });
});

describe('isRunningLow', () => {
  it('avisa quando restam 20% ou menos', () => {
    const quota = { name: 'x', limit: 10, windowSeconds: 900, resetAt: NOW };
    expect(isRunningLow({ ...quota, remaining: 3 })).toBe(false);
    expect(isRunningLow({ ...quota, remaining: 2 })).toBe(true);
    expect(isRunningLow({ ...quota, limit: null, remaining: 0 })).toBe(false);
  });
});
