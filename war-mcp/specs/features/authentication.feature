Feature: Authentication

  Every tool call needs a valid war-api JWT. war-mcp obtains one from a refresh token
  cached by a prior `war-mcp login` (spec §4.2) — that initial browser-driven capture is
  not covered here (spec §8.2); these scenarios start from whatever the token store
  already holds and exercise the refresh/retry/lockout behavior in spec §4.4.

  Background:
    Given war-mcp has no cached refresh token

  Scenario: A tool call with no cached credential fails without calling the API
    When the create_war tool is called
    Then the result reports "not authenticated - run war-mcp login"
    And no request was made to the War API

  Scenario: A cached refresh token is exchanged for a JWT on first use
    Given a valid refresh token is cached
    When the list_my_wars tool is called
    Then a request is made to POST /api/v1/auth/refresh
    And the resulting JWT is sent as the Authorization header of the list_my_wars request

  Scenario: A cached JWT is reused without refreshing again
    Given a valid refresh token is cached
    And a JWT was already obtained earlier in this session
    When the list_my_wars tool is called
    Then no request is made to POST /api/v1/auth/refresh
    And the cached JWT is sent as the Authorization header

  Scenario: An expired JWT is refreshed once and the original call retried
    Given a valid refresh token is cached
    And the War API rejects the first list_my_wars request with 401
    When the list_my_wars tool is called
    Then a request is made to POST /api/v1/auth/refresh
    And the list_my_wars request is retried exactly once with the new JWT
    And the tool call succeeds

  Scenario: A revoked refresh token fails the tool call and clears the cache
    Given a cached refresh token that the War API rejects at POST /api/v1/auth/refresh
    When the list_my_wars tool is called
    Then the result reports "not authenticated - run war-mcp login"
    And no cached refresh token remains afterward
