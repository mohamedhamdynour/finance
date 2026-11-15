const ALLOWED_SHORTCUTS = new Set([
  'dashboard',
  'net-worth',
  'upcoming-liabilities',
  'reports',
  'add-income',
  'add-expense',
  'transfer',
  'backup',
  'reminders'
]);

/**
 * Read a non-sensitive shortcut action from the app URL and return a clean URL.
 * Never accepts amounts, account IDs, notes, tokens, or other financial payloads.
 */
export function consumeShortcutParam(href) {
  const url = new URL(href);
  if (!url.searchParams.has('shortcut')) {
    return { found: false, action: null, cleanUrl: url.pathname + url.search + url.hash };
  }
  const requested = url.searchParams.get('shortcut');
  url.searchParams.delete('shortcut');
  return {
    found: true,
    action: ALLOWED_SHORTCUTS.has(requested) ? requested : null,
    cleanUrl: url.pathname + url.search + url.hash
  };
}

export const supportedShortcutActions = Object.freeze([...ALLOWED_SHORTCUTS]);
