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

  Scenario: Paging through Wars with Next and Prev re-shows the cached page without a new request
    Given more published public Wars exist than fit on one page
    When a visitor selects Next then Prev
    Then the first page's Wars are shown again without a new request

  Scenario: Home has a page heading above the War cards
    Given published public Wars
    When a visitor opens Home
    Then the page has a level-one heading
    And each War card title is a level-two heading

  Scenario: A War card's Vote and Results actions lay out horizontally with consistent themed button styling
    Given a published War listed on Home
    When a visitor opens Home
    Then the card's Vote and Results actions sit side by side
    And both use the same themed button styling

  Scenario: Requests 10 Wars per page
    Given published Wars listed on Home
    When a visitor opens Home
    Then Wars are requested 10 per page
