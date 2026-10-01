import { useCallback, useRef, useState } from 'react';
import { messageFor } from '../app/errors';

export interface AsyncAction<A extends unknown[], R> {
  /** Runs the action. Resolves to its result, or undefined if it threw (the error is captured, never rethrown). */
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  /** A message safe to show the user, or null. */
  error: string | null;
  clearError: () => void;
}

/**
 * Wraps an async UI action so failures become an inline message instead of an unhandled
 * rejection. `fallback` is shown for errors that are not UserFacingError.
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  fallback: string,
): AsyncAction<A, R> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fnRef.current(...args);
      } catch (err) {
        setError(messageFor(err, fallback));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fallback],
  );

  const clearError = useCallback(() => setError(null), []);
  return { run, pending, error, clearError };
}
