// OAuth provider selection (the spec). Apple is left off this list --
// designed for but not built (PROGRESS.md "To revisit") -- rather than
// shown as a button that 404s.
import { useSearchParams } from 'react-router-dom'
import { providerLoginUrl } from '../api/client'
import { storeReturnTo } from '../auth/returnTo'
import { ProviderLogo, type OAuthProviderSlug } from '../components/ProviderLogo'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

const PROVIDERS: { slug: OAuthProviderSlug; label: string }[] = [
  { slug: 'google', label: 'Google' },
  { slug: 'facebook', label: 'Facebook' },
  { slug: 'microsoft', label: 'Microsoft' },
  { slug: 'twitter', label: 'X' },
]

export function Login() {
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/'
  const sessionExpired = searchParams.get('reason') === 'session-expired'
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  return (
    <main data-theme={theme} className="login-page">
      <div className="login-panel" data-testid="login-panel">
        <h1>Log in</h1>
        {sessionExpired && <p role="alert">Please log in to continue</p>}
        <ul>
          {PROVIDERS.map((provider) => (
            <li key={provider.slug}>
              <a
                className={`login-provider-button login-provider-button--${provider.slug}`}
                href={providerLoginUrl(provider.slug)}
                data-testid={`login-provider-${provider.slug}`}
                onClick={() => storeReturnTo(returnTo)}
              >
                <ProviderLogo provider={provider.slug} />
                Sign in with {provider.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
