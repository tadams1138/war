// OAuth provider selection (war-spec.md §5.1). Apple is left off: it is not
// built, and a button that 404s would be worse than none.
import { useSearchParams } from 'react-router-dom'
import { providerLoginUrl } from '../api/client'
import { storeReturnTo } from '../auth/returnTo'
import { PROVIDER_LABELS, ProviderLogo, type OAuthProviderSlug } from '../components/ProviderLogo'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

const PROVIDERS = Object.keys(PROVIDER_LABELS) as OAuthProviderSlug[]

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
            <li key={provider}>
              <a
                className={`login-provider-button login-provider-button--${provider}`}
                href={providerLoginUrl(provider)}
                data-testid={`login-provider-${provider}`}
                onClick={() => storeReturnTo(returnTo)}
              >
                <ProviderLogo provider={provider} />
                Sign in with {PROVIDER_LABELS[provider]}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
