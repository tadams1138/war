Feature: Scheduled task watchdog

  Scenario: No successful run has been recorded
    Given the close-expired-wars task has never succeeded
    When anyone GETs /api/v1/health/scheduled-tasks
    Then the response status is 503
    And the response is not cacheable

  Scenario: A successful close run is reported
    Given the close-expired-wars task has just succeeded
    When anyone GETs /api/v1/health/scheduled-tasks
    Then the response status is 200
    And the response is not cacheable
    And the response reports only the time of the last success

  Scenario: The last success is still fresh after two missed nightly runs
    Given the close-expired-wars task last succeeded 48 hours ago
    When anyone GETs /api/v1/health/scheduled-tasks
    Then the response status is 200

  Scenario: The last success is too old
    Given the close-expired-wars task last succeeded 50 hours ago
    When anyone GETs /api/v1/health/scheduled-tasks
    Then the response status is 503
    And the response reports the time of that last success

  Scenario: A rejected run does not count as a success
    Given the close-expired-wars task was called with a wrong X-Internal-Token
    When anyone GETs /api/v1/health/scheduled-tasks
    Then the response status is 503
