Feature: Login (war-mcp login)

  The interactive part of login - a human signing into Google in their own real browser -
  is not exercised here (spec §8.2). These scenarios start from the point war-mcp's own
  code takes over: its loopback listener receiving the redirect a real login would produce.

  Scenario: The loopback listener exchanges a received code for tokens
    Given war-mcp login has started its loopback listener and opened the browser
    When the listener receives a GET /callback request carrying a code
    Then a POST /api/v1/auth/google/token/native request is made with that code,
      the code_verifier generated for this run, and the redirect_uri given at login start
    And on a 200 response, the returned refresh token is cached

  Scenario: An invalid or expired code fails login without caching anything
    Given war-mcp login's loopback listener is waiting
    And the War API rejects POST /api/v1/auth/google/token/native with 400
    When the listener receives a GET /callback request carrying a code
    Then war-mcp login reports a failure
    And no refresh token is cached

  Scenario: war-mcp login opens the login URL via the OS's own default browser
    Given war-mcp login is started
    When it begins the loopback flow
    Then it invokes the operating system's own default-browser launch command with the
      login URL, rather than starting or driving a browser process of its own
