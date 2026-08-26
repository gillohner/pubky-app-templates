[![Pubky](https://img.shields.io/badge/Pubky-0.11.0-blue)](https://www.npmjs.com/package/@synonymdev/pubky/v/0.11.0)

# Basic Pubky App

A minimal Vite + TypeScript starter for standalone Pubky apps that use Homeservers directly as their data layer—without indexers, aggregators, or integration with pubky.app’s social data.

This template focuses on Pubky’s core building blocks. The included vanilla HTML, TypeScript, and CSS are deliberately kept simple and exist only to demonstrate those features; the template does not prescribe a UI framework, frontend architecture, or styling system.

## What's Included

- Grant-based sign-in through a popup at `https://passport.staging.pubky.app`, including HTTPS outcome callbacks and the Passport `#d` authorization fragment.
- Pubky Ring sign-in with the same generated request through a QR code or authorization link.
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

Use **Open Passport popup** to authorize an app session with the staging Pubky Passport instance,
or use **Open in [Pubky Ring](https://pubkyring.app/)** to send the same request to Ring. For local
testnet development, the [Pubky Ring Simulator](https://simulator.pubkyring.app) can
approve sign-in requests. With `vite dev` and `VITE_PUBKY_TESTNET=true`, **New identity** provides a
development auth shortcut; the homeserver must run with `signup_mode = "open"`.

For complete local Homeserver, testnet, and authentication setup, follow the [Pubky Developer Guide](https://pubky.org/explore/pubkycore/getting-started/).

The hosted GitHub Pages builds are available for
[mainnet](https://pubky.github.io/pubky-app-templates/mainnet/basic-pubky-app/) and a
[local testnet](https://pubky.github.io/pubky-app-templates/testnet/basic-pubky-app/). Both are
production builds; use the mainnet build for staging Passport integration testing.

## Staging Passport integration

The template starts a grant auth flow with same-origin HTTPS callbacks for success, error, and
cancellation. It then wraps the SDK-generated request for Passport like this:

```ts
const passportUrl = `https://passport.staging.pubky.app/authorize#d=${encodeURIComponent(flow.authorizationUrl)}`
```

**Open Passport popup** opens that URL with an opener. On completion, the app validates Passport's
origin and message shape, acknowledges the outcome message, and lets Passport close the popup. If
the opener handoff is unavailable, each callback also works as a normal HTTPS navigation back to
the app. **Copy Passport URL** exposes the exact generated `#d` URL for focused parser testing;
treat it as a secret because the embedded Pubky authorization request contains auth material.

Local callback testing requires HTTPS. `npm run dev` uses Vite's basic SSL plugin and may require
accepting the local development certificate once in the browser. The GitHub Pages builds are
already served over HTTPS.

## App Settings

App-specific configuration lives in `src/config.ts`:

```ts
export const APP_CLIENT_ID = 'template'
export const APP_PATH = `/pub/${APP_CLIENT_ID}/`
export const APP_CAPABILITIES = `${APP_PATH}:rw`
```

Change `APP_CLIENT_ID` first when starting a real app; the path and capabilities are derived from it. The file also centralizes testnet and relay settings.

Set `VITE_PUBKY_STORAGE_NAMESPACE` when multiple builds share an origin and should keep their saved
sessions separate.
