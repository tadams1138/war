// OAuth provider selection (the spec). Apple is left off this list --
// designed for but not built (PROGRESS.md "To revisit") -- rather than
// shown as a button that 404s.
import { useSearchParams } from 'react-router-dom'
import { providerLoginUrl } from '../api/client'
import { storeReturnTo } from '../auth/returnTo'

const PROVIDERS = [
  { slug: 'google', label: 'Google' },
  { slug: 'facebook', label: 'Facebook' },
  { slug: 'microsoft', label: 'Microsoft' },
  { slug: 'twitter', label: 'Twitter / X' },
]

export function Login() {
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/'
  const sessionExpired = searchParams.get('reason') === 'session-expired'

  return (
    <main>
      <h1>Log in</h1>
      {sessionExpired && <p role="alert">Please log in to continue</p>}
      <ul>
        {PROVIDERS.map((provider) => (
          <li key={provider.slug}>
            <a
              href={providerLoginUrl(provider.slug)}
              data-testid={`login-provider-${provider.slug}`}
              onClick={() => storeReturnTo(returnTo)}
            >
              Sign in with {provider.label}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
