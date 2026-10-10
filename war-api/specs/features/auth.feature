Feature: Authentication and sessions

  Scenario: New voter signs in with Google
    Given a user has never signed in before
    When they authenticate via Google OAuth
    Then a new Voter record is created
    And a JWT and refresh token are returned

  Scenario: Returning voter signs in
    Given a voter has previously signed in with Google
    When they authenticate again via Google OAuth
    Then no new Voter record is created
    And the existing record is returned

  Scenario Outline: Accounts are keyed by provider and provider subject, never linked by email
    Given voter A signed in with <first_provider> using "<first_subject>"
    When a user signs in with <second_provider> using "<second_subject>"
    Then a separate Voter record is created
    And the two accounts are not linked

    Examples:
      | first_provider | first_subject      | second_provider | second_subject     |
      | Google         | user-a@example.com | Google          | user-b@example.com |
      | Google         | user@example.com   | Microsoft       | user@example.com   |

  Scenario: Unauthenticated request to protected endpoint
    When an unauthenticated caller calls GET /api/v1/auth/me
    Then the response status is 401

  Scenario: No token is placed in the redirect URL
    When a user completing OAuth with Google is redirected back to the SPA by the callback
    Then the redirect location contains no token in its path, query, or fragment
    And the refresh token is set as an HttpOnly cookie

  Scenario: A user declines Google's consent prompt
    Given a user who began signing in with Google
    When Google's callback reports "access_denied" instead of an authorization code
    Then the response status is 403
    And the reported reason is "access_denied"
    And no refresh token cookie is set

  Scenario: The SPA obtains its first JWT by exchanging the cookie
    Given a refresh cookie set by a completed OAuth callback
    When the SPA POSTs to /api/v1/auth/refresh
    Then a JWT is returned in the response body

  Scenario: Refresh rotates the token
    Given a valid refresh token
    When it is exchanged at /auth/refresh
    Then a new refresh token is issued
    And the presented token is marked used

  Scenario: Reusing a rotated refresh token revokes the family
    Given a refresh token that has already been exchanged once
    When it is presented again
    Then the response status is 401
    And every token in its family is revoked
    And the voter must re-authenticate

  Scenario: Refresh rejects a cross-origin caller
    Given a valid refresh cookie
    When /auth/refresh is called with an unregistered Origin header
    Then the response status is 403

  Scenario: Logout revokes the whole family
    Given an authenticated voter
    When they call DELETE /auth/session
    Then their refresh token family is revoked
    And a subsequent refresh returns 401
