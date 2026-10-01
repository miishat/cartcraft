export type UrlCheck = { ok: true; url: URL } | { ok: false };

const MAX_URL_LENGTH = 2048;
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.intranet', '.corp'];

/**
 * Accepts only public http(s) URLs on default ports. Rejects credentials, IP-literal hosts
 * (the URL parser normalizes forms like "2130706433" to dotted IPv4), single-label and
 * internal hostnames. Run it on the first URL and on every redirect target.
 */
export function checkTargetUrl(raw: string): UrlCheck {
  if (raw.length > MAX_URL_LENGTH) return { ok: false };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false };
  if (url.username || url.password) return { ok: false };
  if (url.port !== '') return { ok: false };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return { ok: false };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false };
  if (host.startsWith('[') || host.includes(':')) return { ok: false };
  if (/^[\d.]+$/.test(host)) return { ok: false };
  return { ok: true, url };
}
