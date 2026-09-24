Feature: Vote Mode Responsive Layout

  Scenario: Both contestant cards stay visible and the page does not scroll sideways on a phone
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then both contestant cards are visible
    And the page has no horizontal scrollbar
    And the matchup stacks the two contestants vertically
    And the VS divider is visible

  Scenario: The matchup lays out side-by-side above the phone breakpoint
    Given an authenticated voter on a War's vote page, viewed at a wide desktop width
    When the first matchup has loaded
    Then the two contestants are laid out side by side

  Scenario: Contestant media is capped so voting never requires scrolling first
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then both contestant cards fit within the viewport without scrolling

  Scenario: A long bio scrolls within its own space instead of pushing the other contestant off screen
    Given an authenticated voter on a War's vote page, viewed at phone width, where one
      contestant has a very long bio
    When the first matchup has loaded
    Then the long bio scrolls within its own area
    And the other contestant's card still fits within the viewport
