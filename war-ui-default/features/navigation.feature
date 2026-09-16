Feature: Navigation

  Scenario: An anonymous visitor sees only a link to log in
    Given an anonymous visitor on the home page
    Then the navigation shows a link to log in
    And the navigation shows no link to Home
    And the navigation shows no voter identity

  Scenario: An authenticated voter's identity is shown in the navigation, menu closed
    Given an authenticated voter whose display name is "Jordan"
    When they navigate to the home page
    Then the navigation shows "Jordan"
    And the navigation shows no link to log in
    And the identity menu is closed

  Scenario: A voter with no display name on file is shown a fallback
    Given an authenticated voter with no display name on file
    When they navigate to the home page
    Then the navigation shows a fallback identity label instead of a blank

  Scenario: Opening the identity menu reveals Home, My Wars, Create War and Log out
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    Then the identity menu shows a link to Home
    And the identity menu shows a link to My Wars
    And the identity menu shows a link to create a War
    And the identity menu shows a log out control

  Scenario: The identity menu has its own background, not the page behind it
    Given an authenticated voter on a themed War's detail page
    When they open the identity menu
    Then the menu renders on an opaque or translucent surface of its own

  Scenario Outline: My Wars, Create War and Home remain reachable, via the identity menu, from every route
    Given an authenticated voter who has already created a War
    When they navigate to "<page>"
    And they open the identity menu
    Then the identity menu shows a link to Home
    And the identity menu shows a link to My Wars
    And the identity menu shows a link to create a War

    Examples:
      | page                       |
      | the home page              |
      | their My Wars page         |
      | the Create War page        |
      | that War's detail page     |
      | that War's vote page       |

  Scenario: Selecting an item in the identity menu navigates there and closes the menu
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    And they select Create War from the identity menu
    Then they land on the Create War page
    And the identity menu is closed

  Scenario: The current page is indicated within the identity menu
    Given an authenticated voter on their My Wars page
    When they open the identity menu
    Then the My Wars item is marked as the current page
    And the Create War item is not marked as the current page
    And the Home item is not marked as the current page

  Scenario: Clicking outside the identity menu closes it
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    And they click outside the menu
    Then the identity menu is closed

  Scenario: Pressing Escape closes the identity menu
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    And they press Escape
    Then the identity menu is closed

  Scenario: Logging out returns the navigation to its anonymous state
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    And they select log out from the identity menu
    Then the navigation shows a link to log in
    And it no longer shows their identity or the identity menu

  Scenario: A failed server-side logout still logs the voter out locally
    Given an authenticated voter viewing the navigation
    When they open the identity menu
    And they select log out and the server-side logout request fails
    Then the navigation shows a link to log in
    And it no longer shows their identity or the identity menu
    And no error message is displayed
