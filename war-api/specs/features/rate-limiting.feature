Feature: Rate Limiting

  Scenario: Voting beyond the per-voter limit is throttled
    Given a voter who has cast 60 votes within one minute
    When they cast another vote
    Then the response status is 429
    And a Retry-After header is present

  Scenario: Limits are keyed by voter, not by address
    Given two voters sharing one public IP address
    When one of them reaches the vote rate limit
    Then the other can still vote

  Scenario: Throttled votes are not recorded
    Given a voter who is being rate limited
    When their vote is rejected with 429
    Then no Vote record is created
    And no counters change

  Scenario: Creating Wars beyond the per-voter limit is throttled
    Given a voter who has created 10 Wars within one hour
    When they create another War
    Then the response status is 429
    And a Retry-After header is present

  Scenario: Uploading images beyond the per-voter limit is throttled
    Given a voter who has uploaded 100 images within one hour
    When they upload another image
    Then the response status is 429
    And a Retry-After header is present

  Scenario: Starting sign-in beyond the per-address limit is throttled
    Given a client address that has started sign-in 10 times within one minute
    When that address starts sign-in again
    Then the response status is 429
    And a Retry-After header is present

  Scenario: The sign-in limit is keyed by client address
    Given a client address that has been throttled on starting sign-in
    When a different client address starts sign-in
    Then the response redirects to the provider

  Scenario: Refreshing a token beyond the per-address limit is throttled
    Given a client address that has attempted 30 token refreshes within one minute
    When that address attempts another refresh
    Then the response status is 429
    And a Retry-After header is present

  Scenario: The refresh limit is keyed by client address
    Given a client address that has been throttled on token refresh
    When a different client address attempts a refresh
    Then the response is not throttled

  Scenario: Address limits stay off until the proxy hop count is configured
    Given the API has no proxy hop count configured
    When one client address starts sign-in 11 times within one minute
    Then every attempt redirects to the provider
