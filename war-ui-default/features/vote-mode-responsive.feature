Feature: Vote Mode Responsive Layout

  Scenario: Both contestant cards stay visible without scrolling on a phone, and the page opens scrolled past the header
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then both contestant cards are visible
    And the page has no horizontal scrollbar
    And the matchup stacks the two contestants vertically
    And the VS divider is visible

  Scenario: The matchup lays out side by side above the phone breakpoint, with bios below the fold
    Given an authenticated voter on a War's vote page, viewed at a wide desktop width
    When the first matchup has loaded
    Then the two contestants are laid out side by side

  Scenario: A long bio scrolls within its own space instead of pushing the other contestant's card off screen
    Given an authenticated voter on a War's vote page, viewed at phone width, where one
      contestant has a very long bio
    When the first matchup has loaded
    Then the long bio scrolls within its own area
    And the other contestant's card still fits within the viewport

  Scenario: On a narrow viewport, each bio sits beside its own card, not below the fold
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then each contestant's bio is on screen beside its own card without scrolling

  Scenario: Clicking a bio never casts a vote
    Given an authenticated voter on a War's vote page with a matchup loaded
    When they click a contestant's bio
    Then no vote is submitted

  Scenario: The footer is reachable below the fold on both breakpoints
    Given an authenticated voter on a War's vote page
    When the page is viewed at phone width and at desktop width
    Then the footer can be scrolled into view at both widths
