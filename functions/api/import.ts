import { decodeEntities } from '../../src/domain';
import { handleImport } from '../../src/server/importRecipe';
import { limitBytes } from '../../src/server/limitBytes';
import { createRateLimiter } from '../../src/server/rateLimit';

/** 10 imports per minute per client IP, per isolate (best effort; see spec section 7). */
const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

function limited(response: Response, maxBytes: number): Response {
  return new Response(response.body ? limitBytes(response.body, maxBytes) : null, { headers: response.headers });
}

/** Streams the page and keeps only JSON-LD script contents, joining text chunks per script. */
async function jsonLdBlocks(response: Response, maxBytes: number): Promise<string[]> {
  const blocks: string[] = [];
  let current = '';
  await new HTMLRewriter()
    .on('script[type*="ld+json"]', {
      text(chunk) {
        current += chunk.text;
        if (chunk.lastInTextNode) {
          blocks.push(current);
          current = '';
        }
      },
    })
    .transform(limited(response, maxBytes))
    .arrayBuffer();
  return blocks;
}

const HIDDEN = 'head, script, style, noscript, template, svg, iframe, nav, header, footer, aside, form';
const BLOCK = 'p, li, br, tr, h1, h2, h3, h4, h5, h6, div, section, article';

/** Streams the page and keeps visible text only, with line breaks at block elements. */
async function visibleText(response: Response, maxBytes: number, maxChars: number): Promise<string> {
  let hidden = 0;
  let length = 0;
  const parts: string[] = [];
  await new HTMLRewriter()
    .on(HIDDEN, {
      element(el) {
        hidden += 1;
        el.onEndTag(() => {
          hidden -= 1;
        });
      },
    })
    .on(BLOCK, {
      element() {
        parts.push('\n');
      },
    })
    .onDocument({
      text(chunk) {
        if (hidden === 0 && length < maxChars) {
          parts.push(chunk.text);
          length += chunk.text.length;
        }
      },
    })
    .transform(limited(response, maxBytes))
    .arrayBuffer();
  return decodeEntities(parts.join(''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxChars);
}

export const onRequest: PagesFunction = ({ request }) =>
  handleImport(request, {
    fetch: (url, init) => fetch(url, init),
    jsonLdBlocks,
    visibleText,
    allow,
    now: Date.now,
  });
