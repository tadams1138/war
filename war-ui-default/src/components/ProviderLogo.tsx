// Official marks for each OAuth provider's sign-in button, built to each
// provider's own brand guidelines (see the google-oauth/facebook-oauth/
// microsoft-oauth/twitter-x-oauth skills' "Sign-in button branding"
// sections for the sourcing and the rules behind each choice below) —
// not a generic icon set. Each mark is a fixed, unaltered shape; only the
// wrapping <svg> is sized by the caller.
export type OAuthProviderSlug = 'google' | 'facebook' | 'microsoft' | 'twitter'

const PROVIDER_LABELS: Record<OAuthProviderSlug, string> = {
  google: 'Google',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
  twitter: 'X',
}

export function ProviderLogo({ provider }: { provider: OAuthProviderSlug }) {
  const label = `${PROVIDER_LABELS[provider]} logo`
  switch (provider) {
    case 'google':
      return <GoogleMark label={label} />
    case 'facebook':
      return <FacebookMark label={label} />
    case 'microsoft':
      return <MicrosoftMark label={label} />
    case 'twitter':
      return <XMark label={label} />
  }
}

// The standard 4-color "G" — must keep its fixed color gradient and never
// be recolored or used monochrome (Google's branding guidelines).
function GoogleMark({ label }: { label: string }) {
  return (
    <svg className="provider-logo" viewBox="0 0 18 18" width="18" height="18" role="img" aria-label={label}>
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1805l-2.9087-2.2581c-.8064.54-1.8368.8591-3.0477.8591-2.3436 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5818-2.5818C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"
      />
    </svg>
  )
}

// The circular "f" mark — never the bare glyph without its circle, never
// recolored off Facebook Blue (Meta's Facebook brand-resources logo page).
function FacebookMark({ label }: { label: string }) {
  return (
    <svg className="provider-logo" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label={label}>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M16.671 15.469l.532-3.469h-3.328v-2.25c0-.949.465-1.875 1.956-1.875h1.513V4.922S15.978 4.688 14.65 4.688c-2.775 0-4.589 1.682-4.589 4.729v2.583H7.078v3.469h2.983v8.385a11.86 11.86 0 003.673 0v-8.385h2.937z"
      />
    </svg>
  )
}

// The 2x2 four-square mark — its four colors are fixed by Microsoft's
// "Sign in with Microsoft" branding guidelines; never altered or reordered.
function MicrosoftMark({ label }: { label: string }) {
  return (
    <svg className="provider-logo" viewBox="0 0 21 21" width="18" height="18" role="img" aria-label={label}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

// X's current identity: the black/white X mark, not the retired bird
// (X's brand toolkit). Rendered in currentColor so the button's own
// black-on-white/white-on-black chrome decides which.
function XMark({ label }: { label: string }) {
  return (
    <svg className="provider-logo" viewBox="0 0 1200 1227" width="18" height="18" role="img" aria-label={label}>
      <path
        fill="currentColor"
        d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
      />
    </svg>
  )
}
