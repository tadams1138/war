@theme-switching
Feature: Theme Switching

  Scenario: A War's detail page renders in its creator-chosen theme by default
    Given a War themed "fight_card"
    When a visitor opens that War's detail page
    Then the page renders in the "fight_card" theme
    And the nav bar renders in the "fight_card" theme

  Scenario: A voter's own theme choice overrides the War's default, only for that War
    Given a War themed "fight_card"
    When a visitor opens that War's detail page
    And they choose the "Tape & Prints" theme
    And they reload the page
    Then the page renders in the "scrapbook" theme
    And the nav bar renders in the "scrapbook" theme

  Scenario: A voter's theme choice for one War does not affect a different War
    Given a War themed "fight_card"
    And another War themed "arcade"
    When a visitor opens the first War's detail page
    And they choose the "Tape & Prints" theme
    And they open that War's detail page
    Then the page renders in the "arcade" theme

  Scenario: A War's vote page renders in its creator-chosen theme
    Given a War themed "fight_card"
    And that War has a matchup to vote on
    And an authenticated voter
    When they open that War's vote page
    Then the matchup is shown
    And the page renders in the "fight_card" theme

  Scenario: Home renders in "arcade" until the voter chooses otherwise
    When a visitor opens Home
    Then the page renders in the "arcade" theme

  Scenario: Choosing a theme on Home does not change what a War's own page shows
    Given a War themed "fight_card"
    When a visitor opens Home
    And they choose the "Tape & Prints" theme
    And they open that War's detail page
    Then the page renders in the "fight_card" theme

  Scenario: The nav theme menu is present and usable on pages with no War in scope
    When a visitor opens the login page
    Then the nav theme menu is visible
    When they choose the "Tape & Prints" theme
    And they open Home
    Then the page renders in the "scrapbook" theme
