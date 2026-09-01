Feature: My Wars

  Scenario: A voter sees every War they created, across every status
    Given an authenticated voter who created a draft War, an active War, and a closed War
    When they navigate to their My Wars page
    Then a War card is shown for each of their three Wars
    And each card shows its status

  Scenario: My Wars does not show another voter's Wars
    Given an authenticated voter with no Wars of their own
    And another voter has created an active public War
    When they navigate to their My Wars page
    Then that other voter's War is not shown

  Scenario: A War card links to its detail page
    Given an authenticated voter who created a draft War
    When they select its card on the My Wars page
    Then that War's detail page is shown

  Scenario: No Wars created yet
    Given an authenticated voter who has created no Wars
    When they navigate to their My Wars page
    Then an empty state is shown
    And a link to create a War is displayed

  Scenario: My Wars requires authentication
    Given no voter is authenticated
    When they navigate directly to "/my-wars"
    Then they are redirected to "/login"
    And the returnTo query param is "/my-wars"
