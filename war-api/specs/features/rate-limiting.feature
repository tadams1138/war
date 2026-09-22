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
