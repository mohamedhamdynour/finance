# Apple Shortcuts integration (PWA)

The PWA now accepts a small allowlist of shortcut actions through a non-sensitive URL parameter. It does not accept account IDs, amounts, notes, credentials, or transaction payloads through the URL. The action parameter is removed from the address bar before execution.

## Setup

1. Install the PWA on the iPhone from Safari using **Share → Add to Home Screen**.
2. In the Shortcuts app, create a shortcut and add **URL** followed by **Open URLs**.
3. Replace `YOUR_APP_BASE_URL` below with the exact deployed app URL, including any repository subpath. Do not include a trailing query string.
4. Test each shortcut while signed in. Depending on iOS behavior, opening a URL may switch to Safari rather than the standalone Home Screen app.

## Supported actions

Use one URL per shortcut:

| Shortcut | URL suffix | Behavior |
|---|---|---|
| Open dashboard | `?shortcut=dashboard` | Opens the dashboard |
| Show net worth | `?shortcut=net-worth` | Opens the dashboard and scrolls to its KPIs |
| Upcoming liabilities | `?shortcut=upcoming-liabilities` | Opens installments |
| Open reports | `?shortcut=reports` | Opens reports |
| Add income | `?shortcut=add-income` | Opens the deposit form; the user reviews and submits it |
| Add expense | `?shortcut=add-expense` | Opens the withdrawal form; the user reviews and submits it |
| Transfer | `?shortcut=transfer` | Opens the transfer form; the user reviews and submits it |
| Encrypted backup | `?shortcut=backup` | Opens the encrypted backup passphrase dialog |
| Reminders | `?shortcut=reminders` | Opens dashboard alerts |

Example URL: `YOUR_APP_BASE_URL/?shortcut=add-income`

## Security boundaries

- Never put amounts, account IDs, transaction notes, passwords, tokens, or other financial data in the URL.
- Shortcut actions require the app's normal authenticated session.
- Write actions only open a form; they do not submit a transaction automatically.
- Backup export requires a passphrase and produces an encrypted JSON file.
- This bridge does not provide native background execution, guaranteed scheduled backups, or a secure iOS Keychain integration. These require additional native/platform-specific work and real-device testing.
