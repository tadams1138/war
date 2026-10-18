@vote-mode-responsive
Feature: Vote Mode Responsive Layout

  Background:
    Given a War
    And that War has a matchup to vote on

  Scenario: Both contestant cards stay visible without scrolling on a phone, and the page opens scrolled past the header
    Given a phone screen
    And an authenticated voter
    When they open that War's vote page
    Then both contestant cards are on screen
    And the page is scrolled past the header
    And the contestants are stacked vertically
    And the page has no horizontal scrollbar
    And the VS divider is visible

  Scenario: The matchup lays out side by side above the phone breakpoint, with bios below the fold
    Given a desktop screen
    And the left contestant's bio is "Left bio."
    And the right contestant's bio is "Right bio."
    And an authenticated voter
    When they open that War's vote page
    Then the contestants are side by side
    And both contestant cards are on screen
    And the bios are below the fold
    When they scroll down to the bios
    Then each contestant's bio is on screen

  Scenario: A long bio scrolls within its own space instead of pushing the other contestant's card off screen
    Given a phone screen
    And the left contestant's bio is very long
    And an authenticated voter
    When they open that War's vote page
    Then the left contestant's bio scrolls within its own area
    And the right contestant's card is on screen

  Scenario: On a narrow viewport, each bio sits beside its own card, not below the fold
    Given a phone screen
    And the left contestant's bio is "Left bio."
    And the right contestant's bio is "Right bio."
    And an authenticated voter
    When they open that War's vote page
    Then each contestant's bio is on screen
    And each bio sits beside its own card

  Scenario: Clicking a bio never casts a vote
    Given a phone screen
    And the left contestant's bio is "A bio long enough to click on."
    And an authenticated voter
    And they are on that War's vote page
    When they click the left contestant's bio
    Then no vote is submitted

  Scenario Outline: The footer is reachable below the fold on a <screen> screen
    Given a <screen> screen
    And an authenticated voter
    When they open that War's vote page
    Then the footer is below the fold
    When they scroll down to the footer
    Then the footer is on screen

    Examples:
      | screen  |
      | phone   |
      | desktop |
