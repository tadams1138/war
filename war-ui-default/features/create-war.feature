Feature: Create War

  Scenario: Creating a War immediately creates an empty draft and forwards to its Edit page
    Given an authenticated voter
    When they choose to create a War
    Then an empty draft War is created via the API
    And they are redirected to that War's Edit page

  Scenario: Rate-limited creation is shown as a wait, not an error, and retries automatically
    Given an authenticated voter
    When they choose to create a War and the request is rate limited
    Then a wait is shown, using the supplied delay, not an error
    And creation retries on its own once the delay passes

  Scenario: Creating a War requires authentication
    Given no voter is authenticated
    When they navigate directly to "/wars/new"
    Then they are redirected to "/login"
    And the returnTo query param is "/wars/new"
