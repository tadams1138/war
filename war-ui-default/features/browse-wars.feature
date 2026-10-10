@browse-wars
Feature: Browse Wars

  # The persistent header already covers both the call to action and the heading.
  Scenario: Anonymous user browses public Wars
    Given the API lists these Wars:
      | title              | status    | category | contestants |
      | Miss Universe 2026 | published | Pageant  | 12          |
      | 2026 Senate Race   | published | Politics | 1           |
    When a visitor opens Home
    Then a War card is shown for each War, with its title, category and contestant count
    And no "Login to Vote" call to action or "War" heading is shown

  Scenario: Authenticated user browses public Wars
    Given the API lists these Wars:
      | title              | status    | category | contestants |
      | Miss Universe 2026 | published | Pageant  | 12          |
      | 2026 Senate Race   | published | Politics | 1           |
    And an authenticated voter
    When they open Home
    Then a War card is shown for each War, with its title, category and contestant count
    And no "Login to Vote" call to action or "War" heading is shown

  Scenario: No published Wars for an anonymous visitor
    Given no published public Wars exist
    When a visitor opens Home
    Then an empty state is shown
    And no link to create a War is displayed

  Scenario: No published Wars for an authenticated voter
    Given no published public Wars exist
    And an authenticated voter
    When they open Home
    Then an empty state is shown
    And a link to create a War is shown

  Scenario: A War card offers direct Vote and Results entry points, not a status label
    Given a published public War titled "Miss Universe 2026" exists
    And an authenticated voter
    When they open Home
    Then the "Miss Universe 2026" card shows a "Vote" link and a "Results" link
    And the "Miss Universe 2026" card shows no status badge
    And the "Miss Universe 2026" card does not show the word "published"

  Scenario: A War card's Results link opens its detail page
    Given a published public War titled "Miss Universe 2026" exists
    And they are on Home
    When they select the "Miss Universe 2026" card's "Results" link
    Then that War's detail page is shown
    And the heading "Miss Universe 2026" is shown

  Scenario: An anonymous visitor tapping Vote is redirected to sign in
    Given a published public War titled "Miss Universe 2026" exists
    And they are on Home
    When they select the "Miss Universe 2026" card's "Vote" link
    Then they are redirected to the login page with returnTo that War's vote page

  Scenario: A War card shows its creator's name when known
    Given a published public War created by a voter named "Ada Lovelace"
    And an authenticated voter
    When they open Home
    Then the War card shows the creator's name "Ada Lovelace"

  Scenario: A War card shows nothing extra when the creator's name is unknown
    Given a published public War with no known creator name
    And an authenticated voter
    When they open Home
    Then the War card shows no creator name

  Scenario: Home offers sorting and search controls
    Given published public Wars exist
    When a visitor opens Home
    Then the sort menu shows "Newest"
    And the search box is shown

  Scenario: Choosing a different sort re-fetches Wars in that order
    Given published public Wars exist
    And they are on Home
    When they choose "Oldest" from the sort menu
    Then Wars are requested sorted "oldest" first

  Scenario: Searching narrows the Wars shown, after a short pause
    Given published public Wars exist
    And they are on Home
    When they type "pastry" into the search box
    Then no Wars are requested matching "pastry" yet
    And Wars are requested matching "pastry" once typing settles

  Scenario: Paging through Wars with Next and Prev re-shows the cached page without a new request
    Given more published public Wars exist than fit on one page
    When a visitor opens Home
    Then the first page's Wars are shown
    And the "Prev" button is disabled
    When they select the "Next" button
    Then the second page's Wars are shown
    And the "Next" button is disabled
    When they select the "Prev" button
    Then the first page's Wars are shown
    And Wars have been requested 2 times in all

  Scenario: Home has a page heading above the War cards
    Given published public Wars exist
    When a visitor opens Home
    Then the page has the level-one heading "Head-to-head contests" above the War cards
    And each War card title is a level-two heading

  Scenario: A War card's Vote and Results actions lay out horizontally with consistent themed button styling
    Given a published public War titled "Miss Universe 2026" exists
    When a visitor opens Home
    Then the "Miss Universe 2026" card's Vote and Results actions sit side by side
    And the "Miss Universe 2026" card's Vote and Results actions use the same themed button styling

  Scenario: Requests 10 Wars per page
    Given published public Wars exist
    When a visitor opens Home
    Then Wars are requested 10 per page
