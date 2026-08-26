import type { XCallbackParams } from '@synonymdev/pubky'
import { PASSPORT_ORIGIN } from './config'

export type PassportOutcome = 'success' | 'error' | 'cancel'

const OUTCOME_MESSAGE_TYPE = 'pubky-passport.authorization-outcome'
const ACKNOWLEDGEMENT_MESSAGE_TYPE = 'pubky-passport.authorization-outcome-ack'
const MESSAGE_VERSION = 1
const CALLBACK_PARAMETER = 'passport'
const passportOrigin = PASSPORT_ORIGIN ? new URL(PASSPORT_ORIGIN).origin : undefined

let popup: Window | null | undefined
let popupCloseTimer: number | undefined

export function hasPassportIntegration() {
  return Boolean(passportOrigin)
}

/** HTTPS callbacks improve popup UX; the SDK relay remains authoritative for authentication. */
export function createPassportCallbacks(): XCallbackParams | undefined {
  const url = new URL(window.location.href)
  if (!passportOrigin || url.protocol !== 'https:') return undefined

  return {
    xSuccess: callbackUrl(url, 'success'),
    xError: callbackUrl(url, 'error'),
    xCancel: callbackUrl(url, 'cancel'),
  }
}

export function createPassportAuthorizationUrl(pubkyAuthorizationUrl: string) {
  if (!passportOrigin) return undefined
  return `${passportOrigin}/authorize#d=${encodeURIComponent(pubkyAuthorizationUrl)}`
}

export function openPassportPopup(authorizationUrl: string, onClose: () => void) {
  const width = 520
  const height = 760
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  clearPopupCloseTimer()
  popup = window.open(
    authorizationUrl,
    'pubky-passport-authorization',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  )

  if (!popup) return false
  popup.focus()
  popupCloseTimer = window.setInterval(() => {
    if (!popup?.closed) return
    popup = undefined
    clearPopupCloseTimer()
    onClose()
  }, 500)
  return true
}

export function takePassportOutcome(event: MessageEvent): PassportOutcome | undefined {
  const message = parseOutcomeMessage(event)
  if (!message || !popup || !passportOrigin) return undefined

  popup.postMessage(
    {
      type: ACKNOWLEDGEMENT_MESSAGE_TYPE,
      version: MESSAGE_VERSION,
      messageId: message.messageId,
    },
    passportOrigin,
  )
  popup = undefined
  clearPopupCloseTimer()
  return message.outcome
}

export function closePassportPopup() {
  const activePopup = popup
  popup = undefined
  clearPopupCloseTimer()
  try {
    if (activePopup && !activePopup.closed) activePopup.close()
  } catch {
    // Popup cleanup is best effort when the cross-origin window is unavailable.
  }
}

function clearPopupCloseTimer() {
  if (popupCloseTimer === undefined) return
  window.clearInterval(popupCloseTimer)
  popupCloseTimer = undefined
}

/** Reads and removes a callback navigation hint; it never establishes authentication. */
export function readCallbackOutcome(): PassportOutcome | undefined {
  const url = new URL(window.location.href)
  const outcome = parseOutcome(url.searchParams.get(CALLBACK_PARAMETER))
  if (!outcome) return undefined

  url.searchParams.delete(CALLBACK_PARAMETER)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return outcome
}

function parseOutcomeMessage(event: MessageEvent) {
  if (event.origin !== passportOrigin || !popup || event.source !== popup) return undefined
  if (!isRecord(event.data)) return undefined

  const outcome = parseOutcome(event.data.outcome)
  if (
    event.data.type !== OUTCOME_MESSAGE_TYPE ||
    event.data.version !== MESSAGE_VERSION ||
    !outcome ||
    typeof event.data.messageId !== 'string' ||
    event.data.messageId.length === 0
  ) {
    return undefined
  }

  return { outcome, messageId: event.data.messageId }
}

function callbackUrl(baseUrl: URL, outcome: PassportOutcome) {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set(CALLBACK_PARAMETER, outcome)
  return url.href
}

function parseOutcome(value: unknown): PassportOutcome | undefined {
  return value === 'success' || value === 'error' || value === 'cancel' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
