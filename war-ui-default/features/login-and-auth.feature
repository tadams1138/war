@login-and-auth
Feature: Login and Authentication

  Scenario: Voter selects an OAuth provider
    When a visitor opens the login page
    Then a sign-in button is shown for each supported provider
    But no sign-in button is shown for Apple
    When they select Google
    Then the browser navigates to Google's login endpoint

  Scenario: A completed sign-in returns the voter to where they started
    When a visitor opens "/wars/abc-123/vote"
    Then they are redirected to the login page with returnTo "/wars/abc-123/vote"
    When they complete sign-in with Google
    Then "/wars/abc-123/vote" is shown
    And they are signed in

  Scenario: The JWT is never written to durable storage
    When a visitor opens the login page
    And they complete sign-in with Google
    Then Home is shown
    And no access token is stored in localStorage or sessionStorage
    And the JWT exists only in memory

  Scenario: No token ever appears in a URL
    When a visitor opens the login page
    And they complete sign-in with Google
    Then Home is shown
    And no token appears in the page URL

  Scenario: Unauthenticated visit to a protected route redirects to login
    When a visitor opens "/wars/abc-123/vote"
    Then they are redirected to the login page with returnTo "/wars/abc-123/vote"

  Scenario: Concurrent 401s trigger exactly one refresh
    Given the voter's session has expired but can be refreshed
    And an authenticated voter
    When two API requests are in flight at the same time
    Then exactly one call is made to refresh the session
    And both requests are retried once the refresh succeeds
    And both requests succeed without the voter seeing an error

  Scenario: A failed refresh is terminal
    Given the voter's session has expired and cannot be refreshed
    And an authenticated voter
    And they are on the Import page
    When two API requests are made one after the other
    Then they are redirected to the login page with returnTo the Import page
    And the redirect gives the reason "session-expired"
    And they are signed out
    And exactly one call is made to refresh the session

  Scenario: The login page is themed and its content is centered
    When a visitor opens the login page
    Then the page renders in the "arcade" theme
    And the sign-in options are shown in a centered panel

  Scenario: Each provider button shows that provider's logo
    When a visitor opens the login page
    Then each provider's sign-in button shows that provider's logo
