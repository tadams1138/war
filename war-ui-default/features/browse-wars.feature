Feature: Browse Wars

  Scenario: Anonymous user browses public Wars
    Given active public Wars exist
    When an unauthenticated visitor loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count
    And a "Login to Vote" call to action is shown

  Scenario: Authenticated user browses public Wars
    Given active public Wars exist
    When an authenticated voter loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count
    And no "Login to Vote" call to action is shown

  Scenario: No active Wars for an anonymous visitor
    Given no active public Wars exist
    When an unauthenticated visitor loads the home page
    Then an empty state is shown
    And no link to create a War is displayed

  Scenario: No active Wars for an authenticated voter
    Given no active public Wars exist
    When an authenticated voter loads the home page
    Then an empty state is shown
    And a link to create a War is displayed

  Scenario: A War card offers direct Vote and Results entry points, not a status label
    Given an active public War titled "Miss Universe 2026" exists
    When an authenticated voter loads the home page
    Then its War card shows a "Vote" link and a "Results" link
    And its War card does not show the word "active"

  Scenario: A War card's Results link opens its detail page
    Given an active public War titled "Miss Universe 2026" exists
    When the visitor selects its Results link
    Then the War detail page for "Miss Universe 2026" is shown

  Scenario: An anonymous visitor tapping Vote is redirected to sign in
    Given an active public War titled "Miss Universe 2026" exists
    When an unauthenticated visitor selects its Vote link
    Then the visitor is redirected to the sign-in page
