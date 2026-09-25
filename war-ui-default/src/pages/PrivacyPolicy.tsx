// Privacy Policy — required by Google's OAuth consent screen. Generic
// boilerplate drafted from what war-spec.md says the platform actually
// collects, not a lawyer-reviewed document. Owner should replace before
// this is relied on for real compliance obligations.
const LAST_UPDATED = '2026-09-24'

export function PrivacyPolicy() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p>
        <em>
          This is a draft policy for a small, independently-run project. It is not legal advice and has not been
          reviewed by an attorney.
        </em>
      </p>
      <p>Last updated: {LAST_UPDATED}</p>

      <h2>Who runs this</h2>
      <p>War is operated by Tom Adams as an independent, non-commercial project.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Sign-in identity.</strong> War signs you in through a third-party provider (Google, Microsoft,
          Facebook, or Twitter/X). We receive a provider account identifier, and where the provider supplies them,
          your display name and avatar. We never see or store your password with any provider.
        </li>
        <li>
          <strong>Votes.</strong> When you vote in a War, we record which contestant you chose, tied to your
          signed-in identity.
        </li>
        <li>
          <strong>Content you upload.</strong> If you create a War, images you upload are processed on upload — we
          strip embedded metadata (including any location data a phone camera may attach) and re-encode the image
          before it is ever shown to anyone. The original file you uploaded is not kept.
        </li>
        <li>
          <strong>Session cookies.</strong> Signing in sets an HttpOnly session cookie so you stay signed in. It
          isn't readable by page scripts and isn't used for tracking or advertising.
        </li>
      </ul>

      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell or share your data with advertisers.</li>
        <li>We don't link identities across sign-in providers — signing in with a different provider creates a separate identity.</li>
        <li>We don't run third-party analytics or advertising trackers.</li>
      </ul>

      <h2>Embedded video</h2>
      <p>
        A War's contestants may include embedded YouTube or Vimeo video. YouTube is embedded through its no-cookie
        domain, which suppresses tracking cookies. Playing an embedded video is still subject to that provider's own
        privacy policy.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        A War's creator can delete it and its data at any time. If you want your voter identity or vote history
        removed, contact us using the details below.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:tadams1138@hotmail.com">tadams1138@hotmail.com</a>
      </p>
    </main>
  )
}
