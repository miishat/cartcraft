import { z } from 'zod';

// Zod 4 probes for eval support with new Function("") when a schema is created.
// Under our CSP (script-src 'self') that raises a violation on every page load.
// Disabling the JIT path avoids the probe; it must run before any schema is built.
z.config({ jitless: true });
