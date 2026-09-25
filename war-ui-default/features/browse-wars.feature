Feature: Browse Wars

  Scenario: Anonymous user browses public Wars
    Given published public Wars exist
    When an unauthenticated visitor loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count
    And no "Login to Vote" call to action or "War" heading is shown, since the persistent header already covers both

  Scenario: Authenticated user browses public Wars
    Given published public Wars exist
    When an authenticated voter loads the home page
    Then a War card is displayed for each War, showing its title, category, and contestant count

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

  Scenario: A War card shows its creator's name when known
    Given a published public War created by a voter named "Ada Lovelace"
    When an authenticated voter loads the home page
    Then its War card shows "Ada Lovelace"

  Scenario: A War card shows nothing extra when the creator's name is unknown
    Given a published public War with no known creator name
    When an authenticated voter loads the home page
    Then its War card does not show a creator name

  Scenario: Home offers sorting and search controls
    Given published public Wars exist
    When an authenticated voter loads the home page
    Then a sort menu and a search box are shown

  Scenario: Choosing a different sort re-fetches Wars in that order
    Given published public Wars exist
    When a visitor selects "Oldest" from the sort menu
    Then Wars are requested sorted "oldest" first

  Scenario: Searching narrows the Wars shown, after a short pause
    Given published public Wars exist
    When a visitor types into the search box
    Then Wars are requested matching that search text, once typing settles

  Scenario: Paging through Wars with Next and Prev
    Given more published public Wars exist than fit on one page
    When a visitor selects Next then Prev
    Then the first page's Wars are shown again without a new request
