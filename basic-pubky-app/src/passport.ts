export const STAGING_PASSPORT_ORIGIN = 'https://staging.passport.pubky.app'
export const LOCAL_PASSPORT_ORIGIN = 'https://localhost:3000'

export type PassportLocation = 'staging' | 'local' | 'custom'

export interface PassportSettings {
  location: PassportLocation
  customOrigin: string
}

export const DEFAULT_PASSPORT_SETTINGS: PassportSettings = {
  location: 'staging',
  customOrigin: '',
}

let popup: Window | null | undefined

export function passportOrigin(settings: PassportSettings): string | undefined {
  switch (settings.location) {
    case 'staging':
      return STAGING_PASSPORT_ORIGIN
    case 'local':
      return LOCAL_PASSPORT_ORIGIN
    case 'custom':
      return normalizeCustomOrigin(settings.customOrigin)
  }
}

export function createPassportAuthorizationUrl(
  pubkyAuthorizationUrl: string,
  settings: PassportSettings,
): string | undefined {
  const origin = passportOrigin(settings)
  if (!origin) return undefined
  return `${origin}/authorize#d=${encodeURIComponent(pubkyAuthorizationUrl)}`
}

export function openPassportPopup(authorizationUrl: string): boolean {
  const width = 520
  const height = 760
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)

  closePassportPopup()
  popup = window.open(
    'about:blank',
    `pubky-passport-${crypto.randomUUID()}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  )
  if (!popup) return false

  try {
    popup.opener = null
    popup.location.replace(authorizationUrl)
    popup.focus()
    return true
  } catch {
    closePassportPopup()
    return false
  }
}

export function closePassportPopup() {
  const activePopup = popup
  popup = undefined

  try {
    if (activePopup && !activePopup.closed) activePopup.close()
  } catch {
    // Popup cleanup is best effort when the cross-origin window is unavailable.
  }
}

function normalizeCustomOrigin(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return undefined
    return url.origin
  } catch {
    return undefined
  }
}
