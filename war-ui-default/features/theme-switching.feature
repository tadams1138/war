Feature: Theme Switching

  Scenario: A War's detail page renders in its creator-chosen theme by default
    Given a War whose theme is "fight_card"
    When a voter views that War's detail page
    Then the page renders with theme "fight_card"
    And the navigation bar renders with theme "fight_card"

  Scenario: A voter's own theme choice overrides the War's default, only for that War
    Given a War whose theme is "fight_card"
    When a voter views that War's detail page and chooses the "Tape & Prints" theme from the nav
    And they reload the page
    Then the page renders with theme "scrapbook"
    And the navigation bar renders with theme "scrapbook"

  Scenario: A voter's theme choice for one War does not affect a different War
    Given two Wars, one themed "fight_card" and one themed "arcade"
    When a voter chooses "Tape & Prints" from the nav on the first War's detail page
    And they view the second War's detail page
    Then the second War's page renders with theme "arcade"

  Scenario: A War's vote page renders in its creator-chosen theme
    Given a War whose theme is "fight_card"
    When a voter casts votes on that War's vote page
    Then the page renders with theme "fight_card"

  Scenario: A War's rankings page renders in its creator-chosen theme
    Given a War whose theme is "scrapbook"
    When a voter views that War's rankings page
    Then the page renders with theme "scrapbook"

  Scenario: Home renders in "arcade" until the voter chooses otherwise
    Given no theme has been chosen for Home yet
    When a voter views Home
    Then the page renders with theme "arcade"

  Scenario: Choosing a theme on Home does not change what a War's own page shows
    Given a War whose theme is "fight_card"
    When a voter chooses the "Tape & Prints" theme from the nav on Home
    And they view that War's detail page
    Then the War's page still renders with theme "fight_card"

  Scenario: The nav theme menu is present and usable on pages with no War in scope
    Given a voter on the login page
    Then the nav theme menu is visible
    When they choose the "Tape & Prints" theme from the nav
    And they view Home
    Then the page renders with theme "scrapbook"
