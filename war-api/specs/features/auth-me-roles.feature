Feature: The signed-in Voter's roles

  Scenario Outline: GET /api/v1/auth/me reports the caller's Staff roles
    Given a <caller>
    When they call GET /api/v1/auth/me
    Then the response status is 200
    And the response reports is_moderator <moderator> and is_admin <admin>

    Examples:
      | caller      | moderator | admin |
      | Moderator   | true      | false |
      | plain Voter | false     | false |
