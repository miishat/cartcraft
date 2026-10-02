import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, headersFile } from './headers';
import { providerOrigins } from '../services/providers';

describe('contentSecurityPolicy', () => {
  it('allows scripts, styles and fonts from this origin only and AI calls to the given origins', () => {
    expect(contentSecurityPolicy(['https://api.deepseek.com', 'https://openrouter.ai'])).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self' https://api.deepseek.com https://openrouter.ai; object-src 'none'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  it('rejects anything that is not a bare https origin', () => {
    expect(() => contentSecurityPolicy(['http://api.example.com'])).toThrow('https origin');
    expect(() => contentSecurityPolicy(['https://api.example.com/v1'])).toThrow('https origin');
    expect(() => contentSecurityPolicy(["https://x.com; script-src *"])).toThrow('https origin');
  });
});

describe('headersFile', () => {
  const file = headersFile(providerOrigins());

  /** Header lines under one exact path rule. */
  function rule(path: string): string[] {
    const lines = file.split('\n');
    const start = lines.indexOf(path);
    expect(start, `rule ${path}`).toBeGreaterThanOrEqual(0);
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith('  ')) break;
      body.push(line.trim());
    }
    return body;
  }

  it('sends the CSP and other security headers on every static file', () => {
    expect(rule('/*')).toEqual([
      `Content-Security-Policy: ${contentSecurityPolicy(providerOrigins())}`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    ]);
    expect(file).toContain('https://api.groq.com');
  });

  it('keeps the app shell and service worker uncached so updates are seen', () => {
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      expect(rule(path)).toEqual(['Cache-Control: no-cache']);
    }
  });

  it('caches hashed build assets for a year', () => {
    expect(rule('/assets/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable']);
  });

  it('stays within the Cloudflare limit of 2,000 characters per line', () => {
    for (const line of file.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });
});
