Feature: Login and Authentication

  Scenario: Voter selects an OAuth provider
    Given the login page is loaded
    Then a sign-in button is shown for each supported OAuth provider
    When the voter selects one
    Then the browser navigates to that provider's login endpoint

  Scenario: A completed sign-in returns the voter to where they started
    Given a voter was redirected to /login with returnTo set to "/wars/abc-123/vote"
    When they complete sign-in with any provider
    Then they land on "/wars/abc-123/vote"
    And they are treated as authenticated from that point on

  Scenario: The JWT is never written to durable storage
    Given a voter has completed sign-in
    Then no access token is present in localStorage or sessionStorage
    And the JWT exists only in memory for the lifetime of the page

  Scenario: No token ever appears in a URL
    Given a voter completing the OAuth flow
    When the callback returns them to the SPA
    Then no access or refresh token appears in the page URL's path, query, or fragment

  Scenario: Unauthenticated visit to a protected route redirects to login
    Given no voter is authenticated
    When they navigate directly to "/wars/abc-123/vote"
    Then they are redirected to "/login"
    And the returnTo query param is "/wars/abc-123/vote"

  Scenario: Concurrent 401s trigger exactly one refresh
    Given an authenticated voter whose JWT has expired
    When two API requests are in flight at the same time and both receive a 401
    Then exactly one call to the refresh endpoint is made
    And both original requests are retried once the refresh succeeds
    And both requests succeed without the voter seeing an error

  Scenario: A failed refresh is terminal
    Given an authenticated voter whose JWT has expired
    When a request receives a 401 and the subsequent refresh attempt also fails
    Then the in-memory JWT is cleared
    And the voter is redirected to "/login" with returnTo set to the page they were on
    And no further refresh is attempted for that session
