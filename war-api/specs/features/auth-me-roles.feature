Feature: /auth/me reports Staff roles

  Scenario: A Moderator's /auth/me reports is_moderator true
    Given a Moderator
    When they call GET /api/v1/auth/me
    Then the response status is 200
    And the response reports is_moderator true and is_admin false

  Scenario: A plain Voter's /auth/me reports both roles false
    Given a plain Voter
    When they call GET /api/v1/auth/me
    Then the response status is 200
    And the response reports is_moderator false and is_admin false
