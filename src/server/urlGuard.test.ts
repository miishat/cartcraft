import { describe, expect, it } from 'vitest';
import { checkTargetUrl } from './urlGuard';

describe('checkTargetUrl', () => {
  it.each([
    'https://www.example.com/recipes/tacos',
    'http://cooking.example.co.uk/r?id=1',
    'https://example.com:443/default-port-normalized',
  ])('accepts %s', (raw) => {
    expect(checkTargetUrl(raw).ok).toBe(true);
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.10/',
    'http://169.254.169.254/latest/meta-data',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://[::1]/',
    'http://intranet/',
    'http://printer.local/',
    'http://api.internal/',
    'http://router.home.arpa/',
    'http://example.com:8080/',
    'https://user:pass@example.com/',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    `https://example.com/${'a'.repeat(3000)}`,
  ])('rejects %s', (raw) => {
    expect(checkTargetUrl(raw).ok).toBe(false);
  });
});
