import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\))\s*<\/script>/)?.[1];

function destination(url: string): string | null {
  if (!script) throw new Error('redirect script missing from index.html');
  const current = new URL(url);
  let next: string | null = null;
  const location = {
    hostname: current.hostname,
    pathname: current.pathname,
    search: current.search,
    hash: current.hash,
    replace(value: string) {
      next = value;
    },
  };
  new Function('location', script)(location);
  return next;
}

describe('public Cat Balls address', () => {
  it('sends hafiy.my/cat-pinball-game/ to polah.app/balls/ and keeps path, query, and hash', () => {
    expect(destination('https://hafiy.my/cat-pinball-game/')).toBe('https://polah.app/balls/');
    expect(destination('https://hafiy.my/cat-pinball-game/assets/game.js?v=2#table')).toBe(
      'https://polah.app/balls/assets/game.js?v=2#table',
    );
    expect(destination('https://nazirulhafiy.github.io/cat-pinball-game/extra?x=1#house')).toBe(
      'https://polah.app/balls/extra?x=1#house',
    );
  });

  it('does not redirect polah.app, localhost, or the hackathon Vercel host', () => {
    expect(destination('https://polah.app/balls/?x=1#house')).toBeNull();
    expect(destination('https://polah.app/balls/assets/game.js?v=2')).toBeNull();
    expect(destination('http://localhost:5173/')).toBeNull();
    expect(destination('https://cat-balls-paws-of-chaos.vercel.app/')).toBeNull();
    expect(destination('https://cat-balls-paws-of-chaos.vercel.app/cat-pinball-game/?x=1')).toBeNull();
  });

  it('does not loop once the browser host is polah.app', () => {
    const landed = destination('https://hafiy.my/cat-pinball-game/?x=1#house');
    expect(landed).toBe('https://polah.app/balls/?x=1#house');
    expect(destination(landed!)).toBeNull();
  });

  it('declares the public URL and stays a 200 document', () => {
    expect(html).toContain('<link rel="canonical" href="https://polah.app/balls/" />');
    expect(html).toContain('<meta property="og:url" content="https://polah.app/balls/" />');
    expect(html).not.toMatch(/http-equiv=["']refresh["']/i);
    expect(script).not.toMatch(/\/assets\//);
    expect(script).not.toMatch(/\/favicon\.svg/);
  });
});
