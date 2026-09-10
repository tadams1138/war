Feature: War Expiry

  Scenario: An expired War reports as closed before the nightly task runs
    Given an active War whose ends_at passed one minute ago
    And the close-expired-wars task has not yet run
    When anyone GETs /api/v1/wars/:id
    Then the response status field is "closed"

  Scenario: The nightly task materialises the stored status
    Given an active War whose ends_at passed six hours ago
    When the close-expired-wars task runs
    Then the stored status column becomes "closed"
    And the response reports 1 War closed

  Scenario: The nightly task is idempotent
    Given the close-expired-wars task has already closed all expired Wars
    When it runs again
    Then zero Wars are modified
    And the response status is 200
