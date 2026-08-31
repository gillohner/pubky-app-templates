import { toCanvas } from 'qrcode'
import { DEVELOPMENT_SIGNUP_HOMESERVER, SHOW_DEVELOPMENT_SIGNUP } from './config'
import { disabledAttr, escapeHtml } from './html'

export interface SigninState {
  authorizationUrl?: string
  passportAuthorizationUrl?: string
  ringCopied?: boolean
  passportCopied?: boolean
  expired?: boolean
  loading?: boolean
  token?: symbol
}

export type AuthorizationUrlKind = 'ring' | 'passport'

const RING_QR_SIZE = 220
const AUTHORIZE_RING_LINK_ID = 'authorize-ring'
const COPY_RING_URL_ID = 'copy-ring-authorization-url'
const COPY_PASSPORT_URL_ID = 'copy-passport-authorization-url'

export function authViewHtml(
  signin: SigninState,
  busy: string | undefined,
  passportEnabled: boolean,
) {
  const cardCount = 1 + Number(passportEnabled) + Number(SHOW_DEVELOPMENT_SIGNUP)
  return `
    <section id="signin-view" class="auth-grid ${cardCount === 1 ? 'single-card' : ''}">
      ${authCardsHtml(signin, busy, passportEnabled)}
    </section>
  `
}

export function updateSigninView(
  signin: SigninState,
  busy: string | undefined,
  passportEnabled: boolean,
) {
  const view = document.querySelector('#signin-view')
  if (!view) return
  view.innerHTML = authCardsHtml(signin, busy, passportEnabled)
  void renderRingSigninQr(signin)
}

export function updateCopyButton(kind: AuthorizationUrlKind, copied: boolean) {
  const id = kind === 'ring' ? COPY_RING_URL_ID : COPY_PASSPORT_URL_ID
  const button = document.querySelector(`#${id}`)
  if (button) button.textContent = copied ? 'Copied' : copyButtonLabel(kind)
}

export function updateAuthorizeLink(canUse: boolean, authorizationUrl?: string) {
  const link = document.querySelector<HTMLAnchorElement>(`#${AUTHORIZE_RING_LINK_ID}`)
  if (!link) return

  if (canUse && authorizationUrl) {
    link.href = authorizationUrl
    link.removeAttribute('aria-disabled')
    return
  }

  link.removeAttribute('href')
  link.setAttribute('aria-disabled', 'true')
}

export function isAuthorizeRingLink(element: Element) {
  return Boolean(element.closest(`#${AUTHORIZE_RING_LINK_ID}`))
}

export async function renderRingSigninQr(signin: SigninState) {
  const canvas = document.querySelector<HTMLCanvasElement>('#ring-signin-qr')
  // Ring scans the raw Pubky auth request, never Passport's /authorize#d wrapper.
  const ringAuthorizationUrl = signin.authorizationUrl
  if (!canvas || !ringAuthorizationUrl || signin.expired) return

  try {
    await toCanvas(canvas, ringAuthorizationUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: RING_QR_SIZE,
      color: {
        dark: '#101828',
        light: '#ffffff',
      },
    })
  } catch (error) {
    console.error('Failed to render Pubky Ring QR code', error)
  }
}

function authCardsHtml(signin: SigninState, busy: string | undefined, passportEnabled: boolean) {
  return `
    ${ringCardHtml(signin, busy)}
    ${passportEnabled ? passportCardHtml(signin, busy) : ''}
    ${SHOW_DEVELOPMENT_SIGNUP ? newIdentityCardHtml(busy) : ''}
  `
}

function ringCardHtml(signin: SigninState, busy?: string) {
  const { authorizationUrl, expired, loading, ringCopied } = signin
  const canUse = !busy && Boolean(authorizationUrl) && !loading && !expired

  return `
    <section id="ring-signin-card" class="panel auth-card">
      <div class="section-header">
        <h2>Sign in with Pubky Ring</h2>
        <button id="refresh-ring-signin" type="button" ${disabledAttr(Boolean(busy) || Boolean(loading))}>
          ${expired ? 'New link' : 'Refresh'}
        </button>
      </div>
      <div class="ring-signin">
        <div class="qr-frame">
          ${ringQrSlot(signin)}
        </div>
        <div class="ring-actions">
          ${authorizeRingLinkHtml(canUse, authorizationUrl)}
          <button id="${COPY_RING_URL_ID}" type="button" ${disabledAttr(!canUse)}>
            ${ringCopied ? 'Copied' : copyButtonLabel('ring')}
          </button>
        </div>
      </div>
    </section>
  `
}

function passportCardHtml(signin: SigninState, busy?: string) {
  const { expired, loading, passportAuthorizationUrl, passportCopied } = signin
  const canUse = !busy && Boolean(passportAuthorizationUrl) && !loading && !expired

  return `
    <section id="passport-signin-card" class="panel auth-card">
      <div class="section-header">
        <h2>Sign in with Pubky Passport</h2>
      </div>
      <div class="passport-signin">
        <div class="passport-summary">
          <strong>Continue in your browser</strong>
          <p class="muted">
            Open Passport to review the requested access and choose your Pubky identity.
          </p>
        </div>
        <div class="passport-actions">
          <button id="open-passport" class="primary" type="button" ${disabledAttr(!canUse)}>
            Open Passport
          </button>
          <button id="open-local-passport" type="button" ${disabledAttr(!canUse)}>
            Open local Passport
          </button>
          <button id="${COPY_PASSPORT_URL_ID}" type="button" ${disabledAttr(!canUse)}>
            ${passportCopied ? 'Copied' : copyButtonLabel('passport')}
          </button>
        </div>
      </div>
    </section>
  `
}

function copyButtonLabel(kind: AuthorizationUrlKind) {
  return kind === 'ring' ? 'Copy link' : 'Copy Passport URL'
}

function authorizeRingLinkHtml(canUse: boolean, authorizationUrl: string | undefined) {
  if (canUse && authorizationUrl) {
    return `<a id="${AUTHORIZE_RING_LINK_ID}" class="button-link primary" href="${escapeHtml(authorizationUrl)}">Authorize with Pubky Ring</a>`
  }

  return `<a id="${AUTHORIZE_RING_LINK_ID}" class="button-link primary" aria-disabled="true">Authorize with Pubky Ring</a>`
}

function ringQrSlot(signin: SigninState) {
  const { authorizationUrl, expired, loading } = signin

  if (loading) {
    return ringQrPlaceholder(`
      <span class="spinner" aria-hidden="true"></span>
      <span>Generating link...</span>
    `)
  }

  if (expired) {
    return ringQrPlaceholder(`
      <strong>Link expired</strong>
      <span>Generate a fresh one.</span>
    `)
  }

  if (!authorizationUrl) return ringQrPlaceholder('<span>Waiting for Ring link...</span>')

  return `
    <canvas
      id="ring-signin-qr"
      class="ring-qr"
      width="${RING_QR_SIZE}"
      height="${RING_QR_SIZE}"
      aria-label="Pubky Ring sign-in QR code"
    ></canvas>
  `
}

function ringQrPlaceholder(content: string) {
  return `<div class="qr-placeholder" aria-live="polite">${content}</div>`
}

function newIdentityCardHtml(busy?: string) {
  return `
    <section class="panel auth-card">
      <h2>New identity</h2>
      <p class="muted">
        Create a new keypair, sign up and sign in on the homeserver, in one go.
        Primarily for development, to move through auth quickly.
      </p>
      <p class="muted">
        Requires the homeserver to run with signup_mode = "open". If signup is closed or
        token-required, this shortcut will fail; use Pubky Ring instead.
      </p>
      <form id="development-signup-form" class="form-grid">
        <label>
          Homeserver public key
          <input
            name="homeserver"
            autocomplete="off"
            value="${escapeHtml(DEVELOPMENT_SIGNUP_HOMESERVER)}"
            required
          />
        </label>
        <button type="submit" ${disabledAttr(Boolean(busy))}>Create identity and sign in</button>
      </form>
    </section>
  `
}
