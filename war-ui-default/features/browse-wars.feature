Feature: Browse Wars

  Scenario: Anonymous user browses public Wars
    Given published public Wars exist
    When an unauthenticated visitor loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count
    And a "Login to Vote" call to action is shown

  Scenario: Authenticated user browses public Wars
    Given published public Wars exist
    When an authenticated voter loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count
    And no "Login to Vote" call to action is shown

  Scenario: No published Wars for an anonymous visitor
    Given no published public Wars exist
    When an unauthenticated visitor loads the home page
    Then an empty state is shown
    And no link to create a War is displayed

  Scenario: No published Wars for an authenticated voter
    Given no published public Wars exist
    When an authenticated voter loads the home page
    Then an empty state is shown
    And a link to create a War is displayed

  Scenario: A War card offers direct Vote and Results entry points, not a status label
    Given a published public War titled "Miss Universe 2026" exists
    When an authenticated voter loads the home page
    Then its War card shows a "Vote" link and a "Results" link
    And its War card does not show the word "published"

  Scenario: A War card's Results link opens its detail page
    Given a published public War titled "Miss Universe 2026" exists
    When the visitor selects its Results link
    Then the War detail page for "Miss Universe 2026" is shown

  Scenario: An anonymous visitor tapping Vote is redirected to sign in
    Given a published public War titled "Miss Universe 2026" exists
    When an unauthenticated visitor selects its Vote link
    Then the visitor is redirected to the sign-in page
