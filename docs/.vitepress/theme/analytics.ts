/**
 * Docs analytics.
 * - Umami: cookieless, so it runs for every visitor without a consent banner (page views, sources, events).
 * - Amplitude: keeps a device id, so it loads only after the visitor accepts the consent banner.
 * Leave an id empty to turn that service off.
 */

// Public ids, safe to commit
const UMAMI_WEBSITE_ID = '105f58da-2a36-4ecb-91b2-8d174c5f9ac3' // from cloud.umami.is → Websites → Edit
const AMPLITUDE_API_KEY = '24957eb89073bb0e37ed48720a5371ce' // browser API key from Amplitude project settings

const PRODUCTION_HOST = 'dadashi44.github.io'
const CONSENT_KEY = 'vue-llm:analytics-consent'

export type Consent = 'granted' | 'denied'
type Props = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Props) => void }
  }
}

/** Only Amplitude needs consent, so the banner shows only when it is configured */
export const consentRequired = Boolean(AMPLITUDE_API_KEY)

let amplitude: typeof import('@amplitude/analytics-browser') | undefined
let amplitudeLoading: Promise<void> | undefined
// Events fired while Amplitude is still loading
const amplitudeQueue: [string, Props][] = []

// Local dev and previews would only pollute the numbers
const isProduction = (): boolean => typeof window !== 'undefined' && location.hostname === PRODUCTION_HOST

export function getConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export function setConsent(consent: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent)
  } catch {
    // Private mode: the choice lasts for this page view
  }
  if (consent === 'granted') void loadAmplitude()
  else amplitude?.setOptOut(true)
}

export function initAnalytics(): void {
  if (!isProduction()) return

  if (UMAMI_WEBSITE_ID && !document.querySelector('script[data-website-id]')) {
    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://cloud.umami.is/script.js'
    script.dataset.websiteId = UMAMI_WEBSITE_ID
    script.dataset.domains = PRODUCTION_HOST
    // Umami tracks client-side navigation itself
    document.head.appendChild(script)
  }

  if (getConsent() === 'granted') void loadAmplitude()
}

function loadAmplitude(): Promise<void> {
  if (!AMPLITUDE_API_KEY || !isProduction()) return Promise.resolve()
  amplitudeLoading ??= import('@amplitude/analytics-browser').then((sdk) => {
    amplitude = sdk
    sdk.init(AMPLITUDE_API_KEY, { autocapture: false })
    trackPageView()
    for (const [name, props] of amplitudeQueue.splice(0)) sdk.track(name, props)
  })
  return amplitudeLoading
}

/** Records a product event in Umami, and in Amplitude when the visitor consented */
export function track(name: string, props: Props = {}): void {
  if (!isProduction()) return
  const data = { ...props, page: location.pathname, language: document.documentElement.lang }

  window.umami?.track(name, data)

  if (getConsent() !== 'granted' || !AMPLITUDE_API_KEY) return
  if (amplitude) amplitude.track(name, data)
  else amplitudeQueue.push([name, data])
}

/** Amplitude page views; Umami counts them on its own */
export function trackPageView(): void {
  amplitude?.track('page_view', {
    page_path: location.pathname,
    page_title: document.title,
    language: document.documentElement.lang,
  })
}
