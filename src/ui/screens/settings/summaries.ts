/** "salt, black pepper, olive oil +2", or "None yet". */
export function pantrySummary(keys: readonly string[]): string {
  if (keys.length === 0) return 'None yet';
  const shown = keys.slice(0, 3).join(', ');
  return keys.length > 3 ? `${shown} +${keys.length - 3}` : shown;
}

export function aisleSummary(count: number): string {
  return `${count} ${count === 1 ? 'aisle' : 'aisles'}, your store order`;
}

/** "Off" with no key at all; otherwise whether the selected provider has a usable key. */
export function aiSummary(status: { savedFor: string | null; usableKey: string | null } | undefined, providerName: string): string {
  if (!status?.savedFor) return 'Off';
  return status.usableKey ? `${providerName}, key saved` : `${providerName}, no key`;
}
