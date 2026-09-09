Feature: Navigation

  Scenario: An anonymous visitor sees only anonymous navigation
    Given an anonymous visitor on the home page
    Then the navigation shows a link to Home
    And the navigation shows a link to log in
    And the navigation shows no link to My Wars
    And the navigation shows no link to create a War
    And the navigation shows no voter identity

  Scenario: An authenticated voter's identity is shown in the navigation
    Given an authenticated voter whose display name is "Jordan"
    When they navigate to the home page
    Then the navigation shows "Jordan"

  Scenario: A voter with no display name on file is shown a fallback
    Given an authenticated voter with no display name on file
    When they navigate to the home page
    Then the navigation shows a fallback identity label instead of a blank

  Scenario Outline: Create War and My Wars remain reachable from every route
    Given an authenticated voter who has already created a War
    When they navigate to "<page>"
    Then the navigation shows a link to Home
    And the navigation shows a link to My Wars
    And the navigation shows a link to create a War

    Examples:
      | page                       |
      | the home page              |
      | their My Wars page         |
      | the Create War page        |
      | that War's detail page     |
      | that War's vote page       |
      | that War's rankings page   |

  Scenario: The current page is indicated in the navigation
    Given an authenticated voter on their My Wars page
    Then the My Wars navigation link is marked as the current page
    And the Create War navigation link is not marked as the current page

  Scenario: Logging out returns the navigation to its anonymous state
    Given an authenticated voter viewing the navigation
    When they select log out
    Then the navigation shows a link to log in
    And it no longer shows their identity or a log out control

  Scenario: A failed server-side logout still logs the voter out locally
    Given an authenticated voter viewing the navigation
    When they select log out and the server-side logout request fails
    Then the navigation shows a link to log in
    And it no longer shows their identity or a log out control
    And no error message is displayed
