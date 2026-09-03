import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closePassportPopup,
  createPassportAuthorizationUrl,
  DEFAULT_PASSPORT_SETTINGS,
  LOCAL_PASSPORT_ORIGIN,
  openPassportPopup,
  passportOrigin,
  STAGING_PASSPORT_ORIGIN,
  type PassportSettings,
} from './passport'

afterEach(() => {
  closePassportPopup()
  vi.unstubAllGlobals()
})

describe('Passport URL settings', () => {
  it('defaults to the staging Passport origin', () => {
    expect(passportOrigin(DEFAULT_PASSPORT_SETTINGS)).toBe(STAGING_PASSPORT_ORIGIN)
  })

  it('selects the local Passport origin', () => {
    expect(passportOrigin(settings('local'))).toBe(LOCAL_PASSPORT_ORIGIN)
  })

  it('normalizes a custom Passport URL to its HTTPS origin', () => {
    expect(passportOrigin(settings('custom', ' https://passport.example.com/path?q=1 '))).toBe(
      'https://passport.example.com',
    )
  })

  it.each([
    '',
    'not a url',
    'http://passport.example.com',
    'https://user:password@passport.example.com',
  ])('rejects an unsafe custom Passport URL: %s', (value) => {
    expect(passportOrigin(settings('custom', value))).toBeUndefined()
  })

  it('encodes the Pubky authorization URL exactly once', () => {
    const authorizationUrl =
      'pubkyauth://signin_grant?caps=%2Fpub%2Ftemplate%2F%3Arw&secret=relay-secret'

    expect(createPassportAuthorizationUrl(authorizationUrl, DEFAULT_PASSPORT_SETTINGS)).toBe(
      `${STAGING_PASSPORT_ORIGIN}/authorize#d=${encodeURIComponent(authorizationUrl)}`,
    )
  })
})

describe('Passport popup', () => {
  it('detaches the opener before navigating to Passport', () => {
    const replace = vi.fn()
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      location: { replace },
      opener: {},
    }
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', {
      open,
      outerHeight: 900,
      outerWidth: 1200,
      screenX: 0,
      screenY: 0,
    })

    const authorizationUrl = `${STAGING_PASSPORT_ORIGIN}/authorize#d=request`
    expect(openPassportPopup(authorizationUrl)).toBe(true)
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      expect.stringMatching(/^pubky-passport-/u),
      expect.stringContaining('popup=yes'),
    )
    expect(popup.opener).toBeNull()
    expect(replace).toHaveBeenCalledWith(authorizationUrl)
    expect(popup.focus).toHaveBeenCalledOnce()
  })
})

function settings(location: PassportSettings['location'], customOrigin = ''): PassportSettings {
  return { location, customOrigin }
}
