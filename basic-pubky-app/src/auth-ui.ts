import { toCanvas } from 'qrcode'
import { DEVELOPMENT_SIGNUP_HOMESERVER, SHOW_DEVELOPMENT_SIGNUP } from './config'
import { disabledAttr, escapeHtml } from './html'

export interface SigninState {
  authorizationUrl?: string
  passportAuthorizationUrl?: string
  copied?: boolean
  expired?: boolean
  loading?: boolean
  token?: symbol
}

const RING_QR_SIZE = 220
const AUTHORIZE_LINK_ID = 'authorize-ring'

export function authViewHtml(signin: SigninState, busy?: string) {
  return `
    <section class="auth-grid ${SHOW_DEVELOPMENT_SIGNUP ? '' : 'ring-only'}">
      ${signinPanelHtml(signin, busy)}
      ${SHOW_DEVELOPMENT_SIGNUP ? newIdentityPanel(busy) : ''}
    </section>
  `
}

export function updateSigninPanel(signin: SigninState, busy?: string) {
  const panel = document.querySelector('#signin-panel')
  if (!panel) return
  panel.innerHTML = signinPanelBody(signin, busy)
  void renderRingSigninQr(signin)
}

export function updateCopyButton(copied: boolean, copiesPassportUrl: boolean) {
  const button = document.querySelector('#copy-authorization-url')
  if (button) button.textContent = copyButtonLabel(copied, copiesPassportUrl)
}

export function updateAuthorizeLink(canUse: boolean, authorizationUrl?: string) {
  const link = document.querySelector<HTMLAnchorElement>(`#${AUTHORIZE_LINK_ID}`)
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
  return Boolean(element.closest(`#${AUTHORIZE_LINK_ID}`))
}

export async function renderRingSigninQr(signin: SigninState) {
  const canvas = document.querySelector<HTMLCanvasElement>('#ring-signin-qr')
  const authorizationUrl = signin.authorizationUrl
  if (!canvas || !authorizationUrl || signin.expired) return

  try {
    await toCanvas(canvas, authorizationUrl, {
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

function signinPanelHtml(signin: SigninState, busy?: string) {
  return `<section id="signin-panel" class="panel">${signinPanelBody(signin, busy)}</section>`
}

function signinPanelBody(signin: SigninState, busy?: string) {
  const { authorizationUrl, copied, expired, loading, passportAuthorizationUrl } = signin
  const isBusy = Boolean(busy)
  const canUseAuthorizationUrl = !isBusy && Boolean(authorizationUrl) && !loading && !expired
  const hasPassport = Boolean(passportAuthorizationUrl)

  return `
    <div class="section-header">
      <div>
        <h2>Sign in with Pubky</h2>
        <p class="muted">${hasPassport ? 'Use Passport in a popup, or approve the same request with Pubky Ring.' : 'Approve the request with Pubky Ring.'}</p>
      </div>
      <button id="refresh-ring-signin" type="button" ${disabledAttr(isBusy || Boolean(loading))}>
        ${expired ? 'New link' : 'Refresh'}
      </button>
    </div>
    <div class="ring-signin">
      <div class="qr-frame">
        ${ringQrSlot(signin)}
      </div>
      <div class="ring-actions ${hasPassport ? 'with-passport' : ''}">
        ${passportButtonHtml(hasPassport, canUseAuthorizationUrl)}
        ${authorizeLinkHtml(canUseAuthorizationUrl, authorizationUrl)}
        <button id="copy-authorization-url" type="button" ${disabledAttr(!canUseAuthorizationUrl)}>
          ${copyButtonLabel(Boolean(copied), hasPassport)}
        </button>
      </div>
    </div>
  `
}

function passportButtonHtml(hasPassport: boolean, canUse: boolean) {
  if (!hasPassport) return ''
  return `
    <button id="open-passport" class="primary" type="button" ${disabledAttr(!canUse)}>
      Open Passport popup
    </button>
  `
}

function copyButtonLabel(copied: boolean, copiesPassportUrl: boolean) {
  if (copied) return 'Copied'
  return copiesPassportUrl ? 'Copy Passport URL' : 'Copy link'
}

function authorizeLinkHtml(canUse: boolean, authorizationUrl: string | undefined) {
  if (canUse && authorizationUrl) {
    return `<a id="${AUTHORIZE_LINK_ID}" class="button-link" href="${escapeHtml(authorizationUrl)}">Open in Pubky Ring</a>`
  }

  return `<a id="${AUTHORIZE_LINK_ID}" class="button-link" aria-disabled="true">Open in Pubky Ring</a>`
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

function newIdentityPanel(busy?: string) {
  return `
    <section class="panel">
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
