/**
 * Build-time only: the Cloudflare `_headers` file for the static app. vite.config.ts writes it
 * into dist/ from the provider list, so the CSP connect-src always matches the AI providers.
 * `_headers` does not apply to Worker responses; worker/ and src/server/ set their own headers.
 */

/** A bare https origin such as https://api.deepseek.com (no path, port or other characters). */
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+$/;

export function contentSecurityPolicy(connectOrigins: readonly string[]): string {
  for (const origin of connectOrigins) {
    if (!HTTPS_ORIGIN.test(origin)) throw new Error(`CSP connect-src entry must be a bare https origin: ${origin}`);
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    ['connect-src', "'self'", ...connectOrigins].join(' '),
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Rules are kept separate: Cloudflare joins a header set by two matching rules with a comma. */
export function headersFile(connectOrigins: readonly string[]): string {
  const rules: [path: string, headers: string[]][] = [
    ['/*', [
      `Content-Security-Policy: ${contentSecurityPolicy(connectOrigins)}`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    ]],
    // A cached index.html or sw.js leaves users stuck on an old version.
    ['/', ['Cache-Control: no-cache']],
    ['/index.html', ['Cache-Control: no-cache']],
    ['/sw.js', ['Cache-Control: no-cache']],
    ['/manifest.webmanifest', ['Cache-Control: no-cache']],
    ['/assets/*', ['Cache-Control: public, max-age=31536000, immutable']],
  ];
  return rules.map(([path, headers]) => [path, ...headers.map((h) => `  ${h}`)].join('\n')).join('\n') + '\n';
}
