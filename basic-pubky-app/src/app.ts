import type { Session } from '@synonymdev/pubky'
import { version as pubkySdkVersion } from '@synonymdev/pubky/package.json'
import {
  isAuthorizeRingLink,
  authViewHtml,
  renderRingSigninQr,
  updateAuthorizeLink,
  updateCopyButton,
  updateSigninView,
  type AuthorizationUrlKind,
  type SigninState,
} from './auth-ui'
import { startAppEventStream, type AppEvent, type AppEventStream } from './events'
import { eventStreamPanelHtml, updateEventList, updateEventStreamToggle } from './events-ui'
import { editorPanelHtml, filesPanelHtml, updateEditor, updateFilesList } from './files-ui'
import {
  copyTextToClipboard,
  disabledAttr,
  escapeHtml,
  formValue,
  formatError,
  statusMessage,
} from './html'
import {
  closePassportPopup,
  hasPassportIntegration,
  openPassportPopup,
  readCallbackOutcome,
  takePassportOutcome,
  type PassportOutcome,
} from './passport'
import {
  isAuthCanceled,
  isAuthExpired,
  restoreSavedSession,
  saveSession,
  signOut,
  signupDevelopmentUser,
  startAuthFlow,
  type AppAuthFlow,
} from './pubky'
import { deleteFile, filePath, listFiles, saveFile, type AppFile } from './storage'

interface State {
  busy?: string
  editingId?: string
  error?: string
  notice?: string
  noticePath?: string
  files: AppFile[]
  authFlow?: AppAuthFlow
  signin: SigninState
  session?: Session
  stopEventStream?: () => Promise<void>
  eventStreamEvents: AppEvent[]
}

const state: State = {
  eventStreamEvents: [],
  files: [],
  signin: {},
}

let app: HTMLElement
const passportEnabled = hasPassportIntegration()

export function start(root: HTMLElement) {
  app = root
  app.addEventListener('click', handleClick)
  app.addEventListener('submit', handleSubmit)
  if (passportEnabled) window.addEventListener('message', handlePassportMessage)

  const callbackOutcome = passportEnabled ? readCallbackOutcome() : undefined
  if (callbackOutcome) setPassportOutcome(callbackOutcome)
  mount()
  void init()
}

async function init() {
  await run('Restoring session...', async () => {
    const session = await restoreSavedSession()
    if (session) {
      await activateSession(session, 'Session restored.')
    }
  })

  if (!state.session) await refreshSignin(Boolean(state.error))
}

function mount() {
  const session = state.session

  app.innerHTML = `
    <main class="app-shell">
      <header class="app-header">
        <h1>Pubky App Template</h1>
        ${session ? signedInHeader(session) : ''}
      </header>
      <div id="status">${statusHtml()}</div>
      <div id="view">${session ? signedInViewHtml() : authViewHtml(state.signin, state.busy, passportEnabled)}</div>
      <footer class="app-footer">Built with <a href="https://www.npmjs.com/package/@synonymdev/pubky">Pubky SDK</a> v${pubkySdkVersion}</footer>
    </main>
  `

  void renderRingSigninQr(state.signin)
}

function signedInHeader(session: Session) {
  return `
    <div class="user-block">
      <button id="sign-out" type="button" ${disabledAttr(Boolean(state.busy))}>Sign out</button>
      <p class="pubky-id">${escapeHtml(session.info.publicKey.toString())}</p>
    </div>
  `
}

function signedInViewHtml() {
  return `
    <section class="grid">
      ${editorPanelHtml(state.files, state.editingId, state.busy)}
      ${filesPanelHtml(state.files, state.busy)}
      ${eventStreamPanelHtml(state.eventStreamEvents, Boolean(state.stopEventStream), state.busy)}
    </section>
  `
}

function statusHtml() {
  if (state.busy) return `<p class="status">${escapeHtml(state.busy)}</p>`
  if (state.error) return `<p class="status error">${escapeHtml(state.error)}</p>`
  if (state.notice) return `<p class="status">${statusMessage(state.notice, state.noticePath)}</p>`
  return ''
}

function updateStatus() {
  const status = app.querySelector('#status')
  if (!status) return
  status.innerHTML = statusHtml()
}

function canUseAuthorizationUrl() {
  const { authorizationUrl, expired, loading } = state.signin
  return !state.busy && Boolean(authorizationUrl) && !loading && !expired
}

function syncControls() {
  const busy = Boolean(state.busy)
  const loading = Boolean(state.signin.loading)
  const canUse = canUseAuthorizationUrl()

  for (const button of app.querySelectorAll('button')) {
    switch (button.id) {
      case 'refresh-ring-signin':
        button.disabled = busy || loading
        break
      case 'copy-ring-authorization-url':
        button.disabled = !canUse
        break
      case 'copy-passport-authorization-url':
      case 'open-passport':
        button.disabled = !canUse || !state.signin.passportAuthorizationUrl
        break
      default:
        button.disabled = busy
        break
    }
  }

  updateAuthorizeLink(canUse, state.signin.authorizationUrl)
}

function handleClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  if (isAuthorizeRingLink(target)) {
    if (!canUseAuthorizationUrl()) event.preventDefault()
    return
  }

  const button = target.closest<HTMLButtonElement>('button')
  if (!button || state.busy) return

  if (button.dataset.editId) {
    state.editingId = button.dataset.editId
    updateEditor(state.files, state.editingId, state.busy)
    return
  }

  if (button.dataset.deleteId) {
    void handleDeleteFile(button.dataset.deleteId)
    return
  }

  switch (button.id) {
    case 'refresh-ring-signin':
      void refreshSignin()
      break
    case 'copy-ring-authorization-url':
      void handleCopyAuthorizationUrl('ring')
      break
    case 'copy-passport-authorization-url':
      void handleCopyAuthorizationUrl('passport')
      break
    case 'open-passport':
      handleOpenPassport()
      break
    case 'sign-out':
      void handleSignOut()
      break
    case 'new-file':
      state.editingId = undefined
      updateEditor(state.files, state.editingId, state.busy)
      break
    case 'toggle-event-stream':
      void toggleEventStream()
      break
    default:
      break
  }
}

function handleSubmit(event: SubmitEvent) {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return

  event.preventDefault()
  if (state.busy) return
  if (form.id === 'development-signup-form') void handleDevelopmentSignup(form)
  if (form.id === 'file-form') void handleSaveFile(form)
}

async function refreshSignin(preserveError = false) {
  const token = Symbol('signin')
  cancelSignin()

  state.signin = {
    loading: true,
    token,
  }
  if (!preserveError) state.error = undefined
  updateStatus()
  updateSigninView(state.signin, state.busy, passportEnabled)
  syncControls()

  try {
    const flow = await startAuthFlow()
    state.authFlow = flow

    if (!isActiveSignin(token)) {
      flow.cancel()
      return
    }

    state.signin = {
      authorizationUrl: flow.authorizationUrl,
      passportAuthorizationUrl: flow.passportAuthorizationUrl,
      token,
    }
    updateSigninView(state.signin, state.busy, passportEnabled)
    syncControls()

    void handleApproval(flow, token)
  } catch (error) {
    if (!isActiveSignin(token)) return

    state.authFlow = undefined
    state.signin = {}
    setError(error)
    updateStatus()
    updateSigninView(state.signin, state.busy, passportEnabled)
    syncControls()
  }
}

async function handleApproval(flow: AppAuthFlow, token: symbol) {
  try {
    const session = await flow.awaitApproval
    if (!isActiveSignin(token)) return

    state.authFlow = undefined
    await run('Completing Pubky sign-in...', async () => {
      await saveSession(session)
      await activateSession(session, 'Signed in with Pubky.')
    })
  } catch (error) {
    if (isAuthCanceled(error) || !isActiveSignin(token)) return

    state.authFlow = undefined
    closePassportPopup()
    state.signin = isAuthExpired(error) ? { expired: true, token } : {}
    setError(error)
    updateStatus()
    updateSigninView(state.signin, state.busy, passportEnabled)
    syncControls()
  }
}

async function handleCopyAuthorizationUrl(kind: AuthorizationUrlKind) {
  const authorizationUrl = authorizationUrlFor(kind)
  if (!authorizationUrl || state.signin.expired) return

  try {
    await copyTextToClipboard(authorizationUrl)
    setCopied(kind, true)
    setNotice(kind === 'ring' ? 'Authorization URL copied.' : 'Passport URL copied.')
    updateStatus()
    updateCopyButton(kind, true)

    window.setTimeout(() => {
      if (authorizationUrlFor(kind) !== authorizationUrl) return
      setCopied(kind, false)
      updateCopyButton(kind, false)
    }, 2200)
  } catch (error) {
    setError(error)
    updateStatus()
  }
}

function handleOpenPassport() {
  const authorizationUrl = state.signin.passportAuthorizationUrl
  if (!authorizationUrl || state.signin.expired) return

  if (!openPassportPopup(authorizationUrl, handlePassportPopupClosed)) {
    setError(new Error('Passport popup was blocked. Allow popups for this site and try again.'))
    updateStatus()
    return
  }

  setNotice('Passport opened. Complete the authorization in the popup.')
  updateStatus()
}

function handlePassportPopupClosed() {
  setError(new Error('Passport popup was closed before authorization completed.'))
  updateStatus()
}

function handlePassportMessage(event: MessageEvent) {
  let outcome: PassportOutcome | undefined
  try {
    outcome = takePassportOutcome(event, state.authFlow?.attemptId)
  } catch (error) {
    setError(error)
    updateStatus()
    return
  }
  if (!outcome) return

  setPassportOutcome(outcome)
  updateStatus()

  if (outcome !== 'success') {
    void refreshSignin(true)
  }
}

function setPassportOutcome(outcome: PassportOutcome) {
  switch (outcome) {
    case 'success':
      setNotice('Passport reported success. Waiting for verified Pubky relay approval...')
      break
    case 'error':
      setError(new Error('Passport reported that it could not approve the request.'))
      break
    case 'cancel':
      setNotice('Passport authorization was cancelled.')
      break
  }
}

async function handleDevelopmentSignup(form: HTMLFormElement) {
  const formData = new FormData(form)
  const homeserver = formValue(formData, 'homeserver')

  await run('Creating identity...', async () => {
    const session = await signupDevelopmentUser(homeserver)
    await saveSession(session)
    await activateSession(session, 'Identity created and signed in.')
  })
}

async function handleSaveFile(form: HTMLFormElement) {
  const session = requireSession()
  const formData = new FormData(form)
  const title = formValue(formData, 'title')
  const body = formValue(formData, 'body')

  await run('Saving file...', async () => {
    const file = await saveFile(session, {
      id: state.editingId,
      title,
      body,
    })
    state.editingId = state.editingId ? file.id : undefined
    setNotice('File saved:', filePath(file.id))
    await refreshFiles()
    updateFilesList(state.files, state.busy)
    updateEditor(state.files, state.editingId, state.busy)
  })
}

async function handleDeleteFile(id: string) {
  const session = requireSession()

  await run('Deleting file...', async () => {
    await deleteFile(session, id)
    if (state.editingId === id) state.editingId = undefined
    setNotice('File deleted:', filePath(id))
    await refreshFiles()
    updateFilesList(state.files, state.busy)
    updateEditor(state.files, state.editingId, state.busy)
  })
}

async function handleSignOut() {
  const session = requireSession()

  await run('Signing out...', async () => {
    await stopEventStream()
    await signOut(session)
    state.session = undefined
    state.files = []
    state.editingId = undefined
    state.eventStreamEvents = []
    setNotice('Signed out.')
  })

  if (!state.session) await refreshSignin()
}

async function toggleEventStream() {
  if (state.stopEventStream) {
    await run('Stopping event stream...', async () => {
      await stopEventStream()
      setNotice('Event stream stopped.')
    })
    updateEventStreamToggle(false)
    return
  }

  const session = requireSession()
  await run('Starting event stream...', async () => {
    const eventStream = await startAppEventStream(session, (event) => {
      if (state.stopEventStream !== eventStream.stop) return
      state.eventStreamEvents = [event, ...state.eventStreamEvents].slice(0, 12)
      updateEventList(state.eventStreamEvents)
    })
    state.stopEventStream = eventStream.stop
    watchEventStream(eventStream)
    setNotice('Event stream started.')
  })
  updateEventStreamToggle(Boolean(state.stopEventStream))
}

function watchEventStream(eventStream: AppEventStream) {
  void eventStream.done.then(
    () => finishEventStream(eventStream),
    (error: unknown) => finishEventStream(eventStream, error),
  )
}

function finishEventStream(eventStream: AppEventStream, error?: unknown) {
  if (state.stopEventStream !== eventStream.stop) return

  state.stopEventStream = undefined
  if (error) setError(error)
  else setNotice('Event stream ended.')
  updateStatus()
  updateEventStreamToggle(false)
  syncControls()
}

async function stopEventStream() {
  const stop = state.stopEventStream
  state.stopEventStream = undefined
  if (stop) await stop()
}

async function refreshFiles() {
  const session = state.session
  if (!session) return

  state.files = await listFiles(session)
}

async function activateSession(session: Session, notice: string) {
  cancelSignin()
  state.signin = {}
  state.session = session
  setNotice(notice)
  await refreshFiles()
}

function cancelSignin() {
  const flow = state.authFlow
  state.authFlow = undefined
  closePassportPopup()
  flow?.cancel()
}

function authorizationUrlFor(kind: AuthorizationUrlKind) {
  return kind === 'ring' ? state.signin.authorizationUrl : state.signin.passportAuthorizationUrl
}

function setCopied(kind: AuthorizationUrlKind, copied: boolean) {
  if (kind === 'ring') state.signin.ringCopied = copied
  else state.signin.passportCopied = copied
}

function isActiveSignin(token: symbol) {
  return state.signin.token === token
}

function setNotice(notice: string, path?: string) {
  state.error = undefined
  state.notice = notice
  state.noticePath = path
}

function setError(error: unknown) {
  state.error = formatError(error)
  state.notice = undefined
  state.noticePath = undefined
}

async function run(label: string, task: () => Promise<void>) {
  const hadSession = Boolean(state.session)
  state.busy = label
  state.error = undefined
  updateStatus()
  syncControls()

  try {
    await task()
  } catch (error) {
    setError(error)
  } finally {
    state.busy = undefined
  }

  if (Boolean(state.session) !== hadSession) {
    mount()
    return
  }

  updateStatus()
  syncControls()
}

function requireSession() {
  if (!state.session) throw new Error('No active Pubky session')
  return state.session
}
