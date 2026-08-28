import { AuthFlowKind, Keypair, Pubky, PublicKey } from '@synonymdev/pubky'
import type { GrantAuthFlow, Session } from '@synonymdev/pubky'
import {
  APP_CAPABILITIES,
  APP_CLIENT_ID,
  HTTP_RELAY,
  IS_TESTNET,
  STORAGE_NAMESPACE,
  TESTNET_HOST,
} from './config'
import { createPassportAuthorizationUrl, createPassportCallbacks } from './passport'

const SESSION_KEY = STORAGE_NAMESPACE
  ? `${STORAGE_NAMESPACE}:${APP_CLIENT_ID}:session`
  : `${APP_CLIENT_ID}:session`
const AUTH_CANCELED_ERROR_NAME = 'AuthCanceled'
const AUTH_EXPIRED_ERROR_NAME = 'AuthExpired'
const CLOSED_SIGNUP_MESSAGE =
  'This homeserver does not allow open signup. Start it with \'signup_mode = "open"\' for creating new identities.'

export const pubky = IS_TESTNET ? Pubky.testnet(TESTNET_HOST) : new Pubky()

export interface AppAuthFlow {
  attemptId: string
  authorizationUrl: string
  passportAuthorizationUrl?: string
  awaitApproval: Promise<Session>
  cancel: () => void
}

export async function signupDevelopmentUser(homeserver: string) {
  const signer = pubky.signer(Keypair.random())
  const homeserverKey = PublicKey.from(homeserver.trim())

  try {
    await signer.signup(homeserverKey, null)
  } catch (error) {
    throw closedSignupError(error)
  }

  return signer.signin(APP_CLIENT_ID)
}

export async function startAuthFlow(): Promise<AppAuthFlow> {
  const attemptId = crypto.randomUUID()
  const xCallback = createPassportCallbacks(attemptId)
  const flow = await pubky.startGrantAuthFlow(APP_CAPABILITIES, AuthFlowKind.signin(), {
    clientId: APP_CLIENT_ID,
    relay: HTTP_RELAY,
    ...(xCallback ? { xCallback } : {}),
  })
  const approval = awaitAuthApproval(flow)

  return {
    attemptId,
    authorizationUrl: flow.authorizationUrl,
    passportAuthorizationUrl: createPassportAuthorizationUrl(flow.authorizationUrl),
    awaitApproval: approval.awaitApproval,
    cancel: approval.cancel,
  }
}

export async function saveSession(session: Session) {
  const stored = await pubky.browserSessionStore.save(session)
  localStorage.setItem(SESSION_KEY, stored.id)
}

export async function restoreSavedSession() {
  const savedId = localStorage.getItem(SESSION_KEY)
  if (!savedId) return undefined

  try {
    return await pubky.browserSessionStore.restore(savedId)
  } catch (error) {
    if (isInvalidSavedSessionError(error)) {
      await forgetSavedSession(savedId)
      return undefined
    }

    throw error
  }
}

export async function signOut(session: Session) {
  const savedId = localStorage.getItem(SESSION_KEY)
  await session.signout()
  await forgetSavedSession(savedId)
}

export function isAuthCanceled(error: unknown) {
  return isErrorNamed(error, AUTH_CANCELED_ERROR_NAME)
}

export function isAuthExpired(error: unknown) {
  return isErrorNamed(error, AUTH_EXPIRED_ERROR_NAME)
}

function awaitAuthApproval(flow: GrantAuthFlow) {
  let canceled = false
  let freed = false

  const cancel = () => {
    canceled = true
    if (freed) return
    freed = true

    try {
      flow.free()
    } catch {
      // The WASM handle can already be consumed or freed by the time cleanup runs.
    }
  }

  const awaitApproval = (async () => {
    try {
      const session = await flow.awaitApproval()
      if (canceled) throw authCanceledError()
      return session
    } catch (error) {
      if (canceled) throw authCanceledError()
      if (isExpiredAuthError(error)) throw authExpiredError()
      throw error
    }
  })()

  return {
    awaitApproval: awaitApproval.finally(cancel),
    cancel,
  }
}

async function forgetSavedSession(savedId: string | null) {
  localStorage.removeItem(SESSION_KEY)
  if (!savedId) return

  try {
    await pubky.browserSessionStore.remove(savedId)
  } catch {
    // Local IndexedDB state may already be gone after a failed restore.
  }
}

function closedSignupError(error: unknown) {
  if (!isClosedSignupError(error)) {
    return error instanceof Error ? error : new Error(String(error))
  }

  const wrapped = new Error(CLOSED_SIGNUP_MESSAGE)
  wrapped.cause = error
  return wrapped
}

function isClosedSignupError(error: unknown) {
  const statusCode = errorStatusCode(error)
  const text = errorText(error).toLowerCase()

  if (statusCode === 400) return true
  if ((statusCode === 401 || statusCode === 403) && /signup|token|invite/.test(text)) {
    return true
  }

  return (
    isErrorNamed(error, 'AuthenticationError') ||
    text.includes('signup token required') ||
    text.includes('signup_mode') ||
    text.includes('token required')
  )
}

function isExpiredAuthError(error: unknown) {
  const text = errorText(error).toLowerCase()
  return text.includes('expired') || text.includes('timed out') || text.includes('timeout')
}

function isInvalidSavedSessionError(error: unknown) {
  return (
    isErrorNamed(error, 'AuthenticationError') ||
    isErrorNamed(error, 'InvalidInput') ||
    isErrorNamed(error, 'ClientStateError')
  )
}

function isErrorNamed(error: unknown, name: string) {
  return error instanceof Error && error.name === name
}

function errorStatusCode(error: unknown) {
  if (!isRecord(error) || !isRecord(error.data)) return undefined
  const statusCode = error.data.statusCode
  return typeof statusCode === 'number' ? statusCode : undefined
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause === undefined ? '' : ` ${errorText(error.cause)}`
    return `${error.name} ${error.message}${cause}`
  }

  return String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function authCanceledError() {
  const error = new Error('Pubky sign-in canceled')
  error.name = AUTH_CANCELED_ERROR_NAME
  return error
}

function authExpiredError() {
  const error = new Error('Pubky sign-in link expired. Generate a fresh link and try again.')
  error.name = AUTH_EXPIRED_ERROR_NAME
  return error
}
