/** An error whose message is written for the user and safe to show as-is. */
export class UserFacingError extends Error {}

/** The message to show for any thrown value: user-facing messages as-is, everything else as `fallback`. */
export function messageFor(err: unknown, fallback: string): string {
  return err instanceof UserFacingError && err.message ? err.message : fallback;
}
