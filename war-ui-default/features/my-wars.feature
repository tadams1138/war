@my-wars
Feature: My Wars

  Scenario: A voter sees every War they created, across every status
    Given the API lists these Wars:
      | title            | status    |
      | My Draft War     | draft     |
      | My Published War | published |
      | My Closed War    | closed    |
    And an authenticated voter
    When they open My Wars
    Then 3 War cards are shown
    And the "My Draft War" card shows the status "draft"
    And the "My Published War" card shows the status "published"
    And the "My Closed War" card shows the status "closed"

  # The mocked API stands in for its own creator=me scoping, which war-api tests.
  Scenario: My Wars does not show another voter's Wars
    Given the API lists no Wars
    And an authenticated voter
    When they open My Wars
    Then Wars are requested with "creator=me"
    And 0 War cards are shown
    And an empty state is shown

  Scenario: A War card links to its detail page
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    And they are on My Wars
    When they click the "My Draft War" card
    Then that War's detail page is shown
    And the heading "My Draft War" is shown

  Scenario: No Wars created yet
    Given the API lists no Wars
    And an authenticated voter
    When they open My Wars
    Then an empty state is shown
    And a link to create a War is shown

  Scenario: My Wars requires authentication
    When a visitor opens My Wars
    Then they are redirected to the login page with returnTo "/my-wars"

  Scenario: My Wars offers sorting and search controls
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    When they open My Wars
    Then the sort menu shows "Newest"
    And the search box is shown

  Scenario: Choosing a different sort on My Wars re-fetches their own Wars in that order
    Given the API lists no Wars
    And an authenticated voter
    And they are on My Wars
    When they choose "Oldest" from the sort menu
    Then Wars are requested with "creator=me&sort=oldest"

  Scenario: A draft War card shows an Edit link
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    When they open My Wars
    Then the "My Draft War" card shows an Edit link

  Scenario: A draft War card's Edit link is styled as a button, not plain text
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    When they open My Wars
    Then the "My Draft War" card's Edit link has a background colour

  Scenario: A published War card also shows an Edit link — editing is never status-gated
    Given the API lists these Wars:
      | title            | status    |
      | My Published War | published |
    And an authenticated voter
    When they open My Wars
    Then the "My Published War" card shows an Edit link
