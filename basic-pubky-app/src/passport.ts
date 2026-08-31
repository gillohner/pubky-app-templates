import type { XCallbackParams } from '@synonymdev/pubky'
import { PASSPORT_ORIGIN } from './config'

export type PassportOutcome = 'success' | 'error' | 'cancel'

const OUTCOME_MESSAGE_TYPE = 'pubky-passport.authorization-outcome'
const ACKNOWLEDGEMENT_MESSAGE_TYPE = 'pubky-passport.authorization-outcome-ack'
const CALLBACK_MESSAGE_TYPE = 'basic-pubky-app.passport-return'
const MESSAGE_VERSION = 1
const CALLBACK_ATTEMPT_PARAMETER = 'attempt'
const CALLBACK_OUTCOME_PARAMETER = 'outcome'
const LOCAL_PASSPORT_ORIGIN = 'https://localhost:3000'
const passportOrigin = PASSPORT_ORIGIN ? new URL(PASSPORT_ORIGIN).origin : undefined

let popup: Window | null | undefined
let popupOrigin: string | undefined
let popupCloseTimer: number | undefined

export function hasPassportIntegration() {
  return Boolean(passportOrigin)
}

/** HTTPS callbacks improve popup UX; the SDK relay remains authoritative for authentication. */
export function createPassportCallbacks(attemptId: string): XCallbackParams | undefined {
  const url = new URL(window.location.href)
  if (!passportOrigin || url.protocol !== 'https:') return undefined

  return {
    xSuccess: callbackUrl(url, attemptId, 'success'),
    xError: callbackUrl(url, attemptId, 'error'),
    xCancel: callbackUrl(url, attemptId, 'cancel'),
  }
}

export function createPassportAuthorizationUrl(pubkyAuthorizationUrl: string) {
  if (!passportOrigin) return undefined
  return `${passportOrigin}/authorize#d=${encodeURIComponent(pubkyAuthorizationUrl)}`
}

export function createLocalPassportAuthorizationUrl(authorizationUrl: string) {
  const url = new URL(authorizationUrl)
  return new URL(`${url.pathname}${url.search}${url.hash}`, LOCAL_PASSPORT_ORIGIN).href
}

export function openPassportPopup(authorizationUrl: string, onClose: () => void) {
  const width = 520
  const height = 760
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  clearPopupCloseTimer()
  popupOrigin = new URL(authorizationUrl).origin
  popup = window.open(
    authorizationUrl,
    'pubky-passport-authorization',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  )

  if (!popup) {
    popupOrigin = undefined
    return false
  }
  popup.focus()
  popupCloseTimer = window.setInterval(() => {
    if (!popup?.closed) return
    popup = undefined
    popupOrigin = undefined
    clearPopupCloseTimer()
    onClose()
  }, 500)
  return true
}

export function takePassportOutcome(
  event: MessageEvent,
  expectedAttemptId: string | undefined,
): PassportOutcome | undefined {
  const message = parseOutcomeMessage(event)
  if (message && popup && popupOrigin) {
    popup.postMessage(
      {
        type: ACKNOWLEDGEMENT_MESSAGE_TYPE,
        version: MESSAGE_VERSION,
        messageId: message.messageId,
      },
      popupOrigin,
    )
    popup = undefined
    popupOrigin = undefined
    clearPopupCloseTimer()
    return message.outcome
  }

  const callbackOutcome = parseCallbackOutcomeMessage(event, expectedAttemptId)
  if (!callbackOutcome) return undefined
  closePassportPopup()
  return callbackOutcome
}

export function closePassportPopup() {
  const activePopup = popup
  popup = undefined
  popupOrigin = undefined
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
  const attemptId = url.searchParams.get(CALLBACK_ATTEMPT_PARAMETER)
  const outcome = parseOutcome(url.searchParams.get(CALLBACK_OUTCOME_PARAMETER))
  if (!attemptId || !outcome) return undefined

  url.searchParams.delete(CALLBACK_ATTEMPT_PARAMETER)
  url.searchParams.delete(CALLBACK_OUTCOME_PARAMETER)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)

  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      { type: CALLBACK_MESSAGE_TYPE, attemptId, outcome },
      window.location.origin,
    )
    window.close()
  }

  return outcome
}

function parseOutcomeMessage(event: MessageEvent) {
  if (event.origin !== popupOrigin || !popup || event.source !== popup) return undefined
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

function parseCallbackOutcomeMessage(
  event: MessageEvent,
  expectedAttemptId: string | undefined,
): PassportOutcome | undefined {
  if (
    !popup ||
    event.source !== popup ||
    event.origin !== window.location.origin ||
    !expectedAttemptId ||
    !isRecord(event.data) ||
    event.data.type !== CALLBACK_MESSAGE_TYPE ||
    event.data.attemptId !== expectedAttemptId
  ) {
    return undefined
  }

  return parseOutcome(event.data.outcome)
}

function callbackUrl(baseUrl: URL, attemptId: string, outcome: PassportOutcome) {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set(CALLBACK_ATTEMPT_PARAMETER, attemptId)
  url.searchParams.set(CALLBACK_OUTCOME_PARAMETER, outcome)
  return url.href
}

function parseOutcome(value: unknown): PassportOutcome | undefined {
  return value === 'success' || value === 'error' || value === 'cancel' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
