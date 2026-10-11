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

  # The mocked API stands in for its own creator=me scoping, which war-api tests: it
  # returns the other voter's War only to a request that does not ask for creator=me.
  Scenario: My Wars does not show another voter's Wars
    Given another voter has created a published public War
    And the voter has created no Wars
    And an authenticated voter
    When they open My Wars
    Then that other voter's War is not shown
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
    Given the voter has created no Wars
    And an authenticated voter
    When they open My Wars
    Then an empty state is shown
    And a link to create a War is shown

  Scenario: My Wars requires authentication
    When a visitor opens My Wars
    Then they are redirected to the login page with returnTo "/my-wars"

  Scenario: My Wars offers sorting and search controls
    Given the API lists these Wars:
      | title            | status    |
      | My Draft War     | draft     |
      | My Published War | published |
      | My Closed War    | closed    |
    And an authenticated voter
    When they open My Wars
    Then the sort menu shows "Newest"
    And the search box is shown

  Scenario: Choosing a different sort on My Wars re-fetches their own Wars in that order
    Given the API lists these Wars:
      | title  | status    |
      | Newest | published |
      | Middle | published |
      | Oldest | published |
    And the API lists them in reverse when sorted oldest first
    And an authenticated voter
    And they are on My Wars
    When they choose "Oldest" from the sort menu
    Then Wars are requested with "creator=me&sort=oldest"
    And the War cards are shown in this order:
      | Oldest |
      | Middle |
      | Newest |

  Scenario: A draft War card shows an Edit link
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    When they open My Wars
    Then the "My Draft War" card shows an Edit link

  Scenario: A draft War card's Edit link is styled as a themed button, not plain text
    Given the API lists these Wars:
      | title        | status |
      | My Draft War | draft  |
    And an authenticated voter
    When they open My Wars
    Then the "My Draft War" card's Edit link is styled as a themed button

  Scenario: A published War card also shows an Edit link — editing is never status-gated
    Given the API lists these Wars:
      | title            | status    |
      | My Published War | published |
    And an authenticated voter
    When they open My Wars
    Then the "My Published War" card shows an Edit link
