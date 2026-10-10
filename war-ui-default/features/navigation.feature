@navigation
Feature: Navigation

  # Pages that need signing in redirect a visitor to log in, so they are not listed.
  Scenario Outline: Every page shows a persistent footer with attribution and project links
    Given a War
    When a visitor opens <page>
    Then the footer shows a copyright notice
    And the footer links to the project's GitHub repository
    And the footer links to the Import build guide
    And the footer links to the Privacy Policy
    And the footer links to the Terms of Service
    And the footer links to the Data Deletion instructions

    Examples:
      | page                                |
      | Home                                |
      | the login page                      |
      | the Privacy Policy page             |
      | the Terms of Service page           |
      | the Data Deletion instructions page |
      | that War's detail page              |

  Scenario: The Privacy Policy page is reachable and shows its content
    When a visitor opens the Privacy Policy page
    Then the heading "Privacy Policy" is shown

  Scenario: The Terms of Service page is reachable and shows its content
    When a visitor opens the Terms of Service page
    Then the heading "Terms of Service" is shown

  Scenario: The Data Deletion instructions page is reachable and shows its content
    When a visitor opens the Data Deletion instructions page
    Then the heading "Data Deletion" is shown

  Scenario: An anonymous visitor sees a link to log in and the Home brand mark
    When a visitor opens Home
    Then they are signed out
    And the Home brand mark links to the home page

  Scenario: The Home brand mark sits left of the theme switcher and links to Home
    Given an authenticated voter
    Then the Home brand mark sits to the left of the theme switcher
    And the Home brand mark links to the home page

  Scenario: An authenticated voter's identity is shown in the navigation, menu closed
    Given the voter's display name is "Jordan"
    And an authenticated voter
    Then they are signed in
    And the navigation shows the name "Jordan"
    And the identity menu is closed

  Scenario: A voter with no display name on file is shown a fallback
    Given the voter has no display name on file
    And an authenticated voter
    Then the navigation shows a fallback identity label instead of a blank

  Scenario: Opening the identity menu reveals My Wars, Start a War and Log out
    Given an authenticated voter
    When they open the identity menu
    Then the identity menu links "My Wars" to My Wars
    And the identity menu links "Start a War" to the Start a War page
    And the identity menu shows a log out control

  Scenario: The identity menu has its own background, not the page behind it
    Given a War themed "fight_card"
    And an authenticated voter
    And they are on that War's detail page
    When they open the identity menu
    Then the menu renders on an opaque or translucent surface of its own

  Scenario Outline: My Wars, Start a War and Home remain reachable from <page>
    Given the API lists these Wars:
      | title         | status    |
      | Draft Nav War | draft     |
      | Nav War       | published |
    And an authenticated voter
    When they open <page>
    Then the Home brand mark links to the home page
    When they open the identity menu
    Then the identity menu links "My Wars" to My Wars
    And the identity menu links "Start a War" to the Start a War page

    Examples:
      | page                       |
      | Home                       |
      | My Wars                    |
      | the first War's Edit page  |
      | that War's detail page     |
      | that War's vote page       |

  Scenario: Selecting an item in the identity menu navigates there and closes the menu
    Given the API creates an empty draft War
    And an authenticated voter
    When they open the identity menu
    And they select "Start a War" from the identity menu
    Then they are redirected to that War's Edit page
    And the identity menu is closed

  Scenario: The current page is indicated within the identity menu
    Given an authenticated voter
    And they are on My Wars
    When they open the identity menu
    Then the "My Wars" item is marked as the current page
    And the "Start a War" item is not marked as the current page

  Scenario: Clicking outside the identity menu closes it
    Given an authenticated voter
    When they open the identity menu
    And they click outside the menu
    Then the identity menu is closed

  Scenario: Pressing Escape closes the identity menu
    Given an authenticated voter
    When they open the identity menu
    And they press Escape
    Then the identity menu is closed

  Scenario: Logging out returns the navigation to its anonymous state
    Given an authenticated voter
    When they open the identity menu
    And they select "Log out" from the identity menu
    Then they are signed out

  Scenario: A failed server-side logout still logs the voter out locally
    Given the server-side logout request takes 3 seconds and then fails
    And an authenticated voter
    When they open the identity menu
    And they select "Log out" from the identity menu
    Then they are signed out without waiting for the server
    And no error message is shown

  Scenario: Opening the identity menu moves focus to its first item
    Given an authenticated voter
    When they open the identity menu
    Then focus is on the first menu item

  Scenario: Arrow keys move between identity menu items
    Given an authenticated voter
    When they open the identity menu
    And they press the down arrow
    Then focus is on the second menu item
    When they press the up arrow
    Then focus is on the first menu item

  Scenario: Escape closes the identity menu and returns focus to its trigger
    Given an authenticated voter
    When they open the identity menu
    And they press Escape
    Then the identity menu is closed
    And focus is on the identity control
