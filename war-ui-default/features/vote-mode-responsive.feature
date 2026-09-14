Feature: Vote Mode Responsive Layout

  Scenario: Both contestant cards stay visible and the page does not scroll sideways on a phone
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then both contestant cards are visible
    And the page has no horizontal scrollbar
