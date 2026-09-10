Feature: Unbound UI scenarios

  Scenarios carried over from the specification that no Playwright binding
  covers. Video-mode ones describe behaviour that is not built; the rest are
  wording variants of scenarios that do run under different names.

  Scenario: Voter is served a matchup
    Given an authenticated voter who has joined an active War
    When they navigate to /wars/:id/vote
    Then two contestant cards are displayed
    And a progress bar shows "0 of N matchups"

  Scenario: Voter casts a vote and sees next matchup
    Given a voter on the vote screen with matchup M1
    When they tap Contestant A's card
    Then a vote is submitted to the API
    And the next matchup M2 is loaded
    And the progress bar increments

  Scenario: Videos play in sequence
    Given a matchup in a video War
    When the voter starts playback
    Then the left video plays first
    And the right video begins when the left one ends

  Scenario: Voting is locked until both videos have played
    Given a matchup in a video War where only the left video has played
    Then neither card is selectable
    When the right video finishes
    Then both cards become selectable

  Scenario: A blocked autoplay offers a manual control
    Given the left video has ended
    When the browser refuses to start the right video
    Then a play control is shown on the right card
    And the voter is not left with a stalled player

  Scenario: An unavailable video still permits a vote
    Given a matchup where one contestant's video has been made private
    When the player reports it unavailable
    Then an unavailable state is shown on that card
    And both cards are selectable

Feature: Contestant Attributes

  Scenario: The same component renders a different campaign
    Given a War declaring party, state, and office
    When the War detail page loads
    Then each contestant shows those labels with its values

  Scenario: Voter completes all matchups
    Given a voter who has voted on all but one matchup
    When they cast the final vote
    And the API returns 204 for /matchups/next
    Then a completion screen is shown
    And a link to the rankings page is displayed

  Scenario: Unauthenticated user visits vote page
    Given a user is not logged in
    When they navigate to /wars/:id/vote
    Then they are redirected to /login
    And the returnTo param points back to the vote page

Feature: Rankings

  Scenario: Rankings page loads for anonymous user
    Given a public active War with votes
    When an anonymous user navigates to /wars/:id/rankings
    Then the leaderboard is displayed with rank, name, wins, and appearances
    And no win percentage is displayed anywhere

  Scenario: Rankings poll while War is active
    Given a user viewing the rankings of an active War
    When 30 seconds elapse
    Then the UI re-fetches rankings from the API
    And the leaderboard updates if rankings changed

  Scenario: The UI does not compute rankings
    Given the API returns contestants in a given order with given ranks
    When the rankings page renders
    Then rows appear in the order returned
    And the displayed ranks match the API response exactly

  Scenario: Unranked contestants shown at bottom
    Given a War where Contestant C has received no votes
    When the rankings page loads
    Then Contestant C appears at the bottom with rank "—"

Feature: Create War
