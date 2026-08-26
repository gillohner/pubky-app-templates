import type { XCallbackParams } from '@synonymdev/pubky'
import { PASSPORT_ORIGIN } from './config'

export type PassportOutcome = 'success' | 'error' | 'cancel'

interface PassportOutcomeMessage {
  type: 'pubky-passport.authorization-outcome'
  version: 1
  outcome: PassportOutcome
  messageId: string
}

const OUTCOME_MESSAGE_TYPE = 'pubky-passport.authorization-outcome'
const ACKNOWLEDGEMENT_MESSAGE_TYPE = 'pubky-passport.authorization-outcome-ack'
const MESSAGE_VERSION = 1

export function createPassportCallbacks(): XCallbackParams {
  return {
    xSource: 'Basic Pubky App',
    xSuccess: callbackUrl('success'),
    xError: callbackUrl('error'),
    xCancel: callbackUrl('cancel'),
  }
}

export function createPassportAuthorizationUrl(pubkyAuthorizationUrl: string) {
  return `${PASSPORT_ORIGIN}/authorize#d=${encodeURIComponent(pubkyAuthorizationUrl)}`
}

export function readCallbackOutcome(): PassportOutcome | undefined {
  const url = new URL(window.location.href)
  const outcome = parseOutcome(url.searchParams.get('passport'))
  if (!outcome) return undefined

  url.searchParams.delete('passport')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return outcome
}

export function readPassportOutcomeMessage(
  event: MessageEvent,
  expectedPopup: Window | null | undefined,
): PassportOutcomeMessage | undefined {
  if (event.origin !== PASSPORT_ORIGIN || !expectedPopup || event.source !== expectedPopup) {
    return undefined
  }

  const value: unknown = event.data
  if (!isRecord(value)) return undefined

  const outcome = parseOutcome(value.outcome)
  if (
    value.type !== OUTCOME_MESSAGE_TYPE ||
    value.version !== MESSAGE_VERSION ||
    !outcome ||
    typeof value.messageId !== 'string' ||
    value.messageId.length === 0
  ) {
    return undefined
  }

  return {
    type: OUTCOME_MESSAGE_TYPE,
    version: MESSAGE_VERSION,
    outcome,
    messageId: value.messageId,
  }
}

export function acknowledgePassportOutcome(source: Window, messageId: string) {
  source.postMessage(
    {
      type: ACKNOWLEDGEMENT_MESSAGE_TYPE,
      version: MESSAGE_VERSION,
      messageId,
    },
    PASSPORT_ORIGIN,
  )
}

function callbackUrl(outcome: PassportOutcome) {
  const url = new URL(window.location.href)
  if (url.protocol !== 'https:') {
    throw new Error('Passport callbacks require HTTPS. Start this template with `npm run dev`.')
  }

  url.search = ''
  url.hash = ''
  url.searchParams.set('passport', outcome)
  return url.href
}

function parseOutcome(value: unknown): PassportOutcome | undefined {
  return value === 'success' || value === 'error' || value === 'cancel' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
