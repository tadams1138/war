// Terms of Service — required by Google's OAuth consent screen. Generic
// boilerplate, not a lawyer-reviewed document. Owner should replace before
// this is relied on for real legal protection.
const LAST_UPDATED = '2026-09-24'

export function TermsOfService() {
  return (
    <main>
      <h1>Terms of Service</h1>
      <p>
        <em>
          This is a draft agreement for a small, independently-run project. It is not legal advice and has not been
          reviewed by an attorney.
        </em>
      </p>
      <p>Last updated: {LAST_UPDATED}</p>

      <h2>Who runs this</h2>
      <p>War is operated by Tom Adams as an independent, non-commercial project. By using it, you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        War lets signed-in users create "Wars" — head-to-head voting campaigns — and lets visitors vote in them. It's
        provided as-is, with no uptime or availability guarantee.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in through a third-party OAuth provider. You're responsible for keeping that provider account
        secure — we have no way to recover access if it's compromised.
      </p>

      <h2>Your content</h2>
      <p>
        If you create a War, you're responsible for the images, video links, and text you submit. Don't upload
        content you don't have the right to use, or content that's illegal, harassing, or infringing. We may remove
        a War or content that violates this.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don't attempt to manipulate vote counts outside normal use of the voting UI.</li>
        <li>Don't use the service to harass, defame, or impersonate anyone.</li>
        <li>Don't attempt to disrupt or overload the service.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The service is provided "as is," without warranty of any kind. We're not liable for any damages arising from
        your use of it, to the extent permitted by law.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms or the service at any time. Continued use after a change means you accept it.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:tadams1138@hotmail.com">tadams1138@hotmail.com</a>
      </p>
    </main>
  )
}
