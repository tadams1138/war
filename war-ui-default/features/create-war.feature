@create-war
Feature: Create War

  Scenario: Creating a War immediately creates an empty draft and forwards to its Edit page
    Given the API creates an empty draft War
    And an authenticated voter
    When they open the Start a War page
    Then an empty draft War is created via the API
    And they are redirected to that War's Edit page

  Scenario: Rate-limited creation is shown as a wait, not an error, and retries automatically
    Given the API rate limits the first creation request for 1 second, then accepts the retry
    And an authenticated voter
    When they open the Start a War page
    Then a wait is shown, not an error
    And creation retries on its own once the supplied delay passes

  Scenario: An unauthenticated visitor is redirected to log in
    When a visitor opens the Start a War page
    Then they are redirected to the login page with returnTo "/wars/new"

  Scenario: A failed creation shows an error with a retry control
    Given the API rejects the first creation request, then accepts the retry
    And an authenticated voter
    When they open the Start a War page
    Then an error message is shown
    And a retry control is offered
    When they use the retry control
    Then they are redirected to that War's Edit page
