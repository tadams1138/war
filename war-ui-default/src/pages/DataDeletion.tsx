// Data Deletion instructions — required by Facebook Login's app review ("User data deletion"
// field on the App Domains page), which accepts a static instructions URL in place of a
// callback endpoint. Not a lawyer-reviewed document.
export function DataDeletion() {
  return (
    <main>
      <h1>Data Deletion</h1>

      <p>
        War does not yet have a self-service "delete my account" control. To request deletion of
        your data, email <a href="mailto:user-support@tmad.dev">user-support@tmad.dev</a> from the
        email address associated with your sign-in provider account, or otherwise identify which
        provider (Google, Microsoft, Facebook, or Twitter/X) you signed in with.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your voter identity (the record created when you first signed in).</li>
        <li>Your full vote history across every War you voted in.</li>
      </ul>

      <p>
        A War you created is not deleted automatically by this process — you can delete any War
        you created yourself at any time from its edit page. If you'd like us to delete a War you
        created as part of your data-deletion request, say so in your email.
      </p>
    </main>
  )
}
