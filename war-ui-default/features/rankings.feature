Feature: Rankings

  Scenario: Rankings load for an anonymous visitor
    Given a public active War with votes recorded
    When an unauthenticated visitor navigates to that War's rankings page
    Then the leaderboard is shown with rank, image, name, wins, and appearances for each contestant
    And no win percentage is displayed anywhere

  Scenario: The UI renders rankings in the order and ranks the API returns
    Given the API returns contestants in a given order with given ranks
    When the rankings page renders
    Then rows appear in that exact order
    And the displayed ranks match the API response exactly

  Scenario: Unranked contestants are shown at the bottom
    Given a War where a contestant has received no votes
    When the rankings page loads
    Then that contestant appears at the bottom of the leaderboard with rank "—"

  Scenario: Rankings poll while the War is active
    Given a visitor viewing the rankings of an active War
    When 30 seconds elapse
    Then the rankings page re-fetches rankings from the API
    And the leaderboard updates if the rankings changed

  Scenario: Rankings do not poll once the War is closed
    Given a visitor viewing the rankings of a closed War
    When 30 seconds elapse
    Then the rankings page does not re-fetch rankings from the API

  Scenario: Invite-only rankings require sign-in
    Given an invite-only War
    When an unauthenticated visitor navigates to that War's rankings page
    Then the message "Please log in to continue" is shown
    And they are redirected to /login

  Scenario: A completed vote flow links to rankings
    Given a voter who has just cast their final vote in a War
    When the completion screen is shown
    And they select the rankings link
    Then that War's rankings page is shown
