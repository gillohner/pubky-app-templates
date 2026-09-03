[![Pubky](https://img.shields.io/badge/Pubky-0.11.0-blue)](https://www.npmjs.com/package/@synonymdev/pubky/v/0.11.0)

# Basic Pubky App

A minimal Vite + TypeScript starter for standalone Pubky apps that use Homeservers directly as their data layer—without indexers, aggregators, or integration with pubky.app’s social data.

This template focuses on Pubky’s core building blocks. The included vanilla HTML, TypeScript, and CSS are deliberately kept simple and exist only to demonstrate those features; the template does not prescribe a UI framework, frontend architecture, or styling system.

## What's Included

- Pubky Ring sign-in with a QR code, authorization link, and copy-to-clipboard action.
- Browser-based Passport sign-in with selectable grant or cookie authentication and configurable
  Passport origins.
- A development-only authentication shortcut that removes sign-in friction on a local testnet. It requires `signup_mode = "open"` and is not intended as a pattern for production apps.
- Session persistence across page reloads for grant and cookie authentication, plus sign out.
- File storage helpers under a configured path on the user’s Homeserver.
- A live event stream subscription scoped to the configured path.
- Preconfigured weekly Dependabot updates for all npm dependencies, with Pubky stack packages grouped together.

## What's Not Included

- Identity key and recovery phrase management. Pubky apps should delegate these responsibilities to a dedicated identity manager such as Pubky Ring, keeping keypairs outside the app.
- Homeserver admin tools.
- An aggregator or indexer. This template talks directly to the user’s Homeserver and does not provide cross-Homeserver aggregation or data indexing.

## Quick Start

Requires Node.js 20.19+ or 22.12+.

```bash
npx tiged pubky/pubky-app-templates/basic-pubky-app my-pubky-app
cd my-pubky-app
npm install
npm run dev
```

Use **Open in [Pubky Ring](https://pubkyring.app/)** to authorize an app session. For local testnet
development, the [Pubky Ring Simulator](https://simulator.pubkyring.app) can
approve sign-in requests. With `vite dev` and `VITE_PUBKY_TESTNET=true`, **New identity** provides a
development auth shortcut; the homeserver must run with `signup_mode = "open"`.

For complete local Homeserver, testnet, and authentication setup, follow the [Pubky Developer Guide](https://pubky.org/explore/pubkycore/getting-started/).

The hosted GitHub Pages builds are available for
[mainnet](https://pubky.github.io/pubky-app-templates/mainnet/basic-pubky-app/) and a
[local testnet](https://pubky.github.io/pubky-app-templates/testnet/basic-pubky-app/). Both are
production builds. Passport defaults to the staging deployment in both builds.

## Passport Integration

The Passport card follows the
[Passport integration guide](https://github.com/pubky/pubky-passport/blob/186773807be2db1d5ce9f70b79b4815dfe326c4f/docs/integration.md): the Pubky SDK creates the
authorization request, the app wraps it in Passport's `/authorize#d=...` URL, and only the
`Session` returned through the SDK relay authenticates the user.

Choose a Passport URL from the card:

- `https://passport.staging.pubky.app` (default)
- `https://localhost:3000`
- A custom HTTPS origin

Custom values are normalized to their origin before the app adds `/authorize`. The generated Pubky
request is then encoded exactly once:

```ts
const passportUrl = `${passportOrigin}/authorize#d=${encodeURIComponent(flow.authorizationUrl)}`
```

Grant authentication is selected by default. Switching to cookie authentication creates a fresh
SDK request with `pubky.startCookieAuthFlow()`; switching back creates one with
`pubky.startGrantAuthFlow()`. Both flow types receive the complete `xCallback` contract:
`xSource`, plus correlated `xSuccess`, `xError`, and `xCancel` return URLs when the app is served
over HTTPS. The Ring QR and Passport link both use the current request.

The card has two actions:

- **Open Passport** opens the generated URL in a popup.
- **Copy link** copies the same generated URL.

The popup keeps its opener channel so Passport can report an outcome directly. The app validates
the exact selected Passport origin, popup window, message type, version, outcome, and message ID
before acknowledging the message. If direct messaging fails, Passport navigates to the matching
callback; the callback page relays a same-origin message correlated to the flow's unpredictable
attempt ID. Popup messaging requires an opener relationship, which means the selected Passport
page can navigate the app window while it is open. Treat the default deployment and every custom
Passport origin as trusted; a compromised origin could replace the app with a phishing page. On an
HTTP development origin, the SDK request contains `xSource` only, since Passport callbacks must be
HTTPS.

Success, error, and cancel messages are UI signals only. A success message keeps the flow polling;
only the `Session` returned by the SDK relay authenticates the user. Error, cancellation, manual
popup closure, or timeout discards that flow and creates a fresh authorization link.

Treat copied Passport links as secrets because the embedded Pubky request contains relay and
authentication material. The template polls the SDK for up to five minutes and discards the flow
after approval, cancellation by the app, failure, or expiry.

Grant sessions are persisted with `browserSessionStore`. Cookie sessions persist only non-secret
metadata in local storage; the browser keeps the actual HTTP-only session cookie.

## App Settings

App-specific configuration lives in `src/config.ts`:

```ts
export const APP_CLIENT_ID = 'template'
export const APP_PATH = `/pub/${APP_CLIENT_ID}/`
export const APP_CAPABILITIES = `${APP_PATH}:rw`
```

Change `APP_CLIENT_ID` first when starting a real app; the path and capabilities are derived from
the client ID. The file also centralizes testnet and relay settings.

Set `VITE_PUBKY_STORAGE_NAMESPACE` when multiple builds share an origin and should keep their saved
sessions separate.
