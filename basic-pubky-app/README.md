[![Pubky](https://img.shields.io/badge/Pubky-0.11.0-blue)](https://www.npmjs.com/package/@synonymdev/pubky/v/0.11.0)

# Basic Pubky App

A minimal Vite + TypeScript starter for standalone Pubky apps that use Homeservers directly as their data layer—without indexers, aggregators, or integration with pubky.app’s social data.

This template focuses on Pubky’s core building blocks. The included vanilla HTML, TypeScript, and CSS are deliberately kept simple and exist only to demonstrate those features; the template does not prescribe a UI framework, frontend architecture, or styling system.

## What's Included

- Grant-based Pubky Ring sign-in with a QR code, authorization link, and copy-to-clipboard action.
- Optional browser-based Passport sign-in using a popup and the Passport `#d` authorization fragment.
- A development-only authentication shortcut that removes sign-in friction on a local testnet. It requires `signup_mode = "open"` and is not intended as a pattern for production apps.
- Session persistence across page reloads via the SDK browser session store, plus sign out.
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
production builds. The mainnet build enables the optional staging Passport integration.

## Optional Passport Integration

Set `VITE_PASSPORT_ORIGIN` to add **Open Passport popup** and **Copy Passport URL** without changing
the standard Pubky grant flow:

```dotenv
VITE_PASSPORT_ORIGIN=https://passport.staging.pubky.app
```

For local testing, place the setting in an ignored `.env.local` file before starting Vite.

The adapter wraps the SDK-generated request for Passport like this:

```ts
const passportUrl = `https://passport.staging.pubky.app/authorize#d=${encodeURIComponent(flow.authorizationUrl)}`
```

On HTTPS deployments, the SDK request includes same-origin success, error, and cancellation
callbacks plus `xSource: 'Basic Pubky App'`. The optional popup adapter validates Passport's origin,
message version, and exact popup source before acknowledging an outcome. Callback navigation is
correlated to the active attempt before it is accepted. These messages improve popup UX only: the
app establishes a session exclusively from the SDK's encrypted relay approval.

On an HTTP development origin, Passport still opens and successful authentication still completes
through the relay, but the three return callback URLs are omitted because Passport accepts only
HTTPS callbacks. The friendly `xSource` remains present. This makes LAN testing possible with
`npm run dev -- --host 0.0.0.0`; use a deployed HTTPS build to exercise callback outcomes.

**Copy Passport URL** exposes the exact generated `#d` URL for focused parser testing. Treat it as a
secret because the embedded Pubky authorization request contains auth material.

The QR code and **Open in Pubky Ring** link always use the unwrapped `flow.authorizationUrl`.
Passport's `/authorize#d=...` URL is only used by the Passport popup and copy action, so Ring can
scan the QR as a normal Pubky auth request.

## App Settings

App-specific configuration lives in `src/config.ts`:

```ts
export const APP_CLIENT_ID = 'template'
export const APP_NAME = 'Basic Pubky App'
export const APP_PATH = `/pub/${APP_CLIENT_ID}/`
export const APP_CAPABILITIES = `${APP_PATH}:rw`
```

Change `APP_CLIENT_ID` and `APP_NAME` first when starting a real app. The path and capabilities are
derived from the client ID; `APP_NAME` becomes the human-readable `xSource` shown by Passport and
other compatible signers. The file also centralizes testnet, relay, and optional Passport settings.

Set `VITE_PUBKY_STORAGE_NAMESPACE` when multiple builds share an origin and should keep their saved
sessions separate.
