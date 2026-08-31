Feature: Vote Mode

  Scenario: A voter is served a matchup
    Given an authenticated voter viewing an active War with unvoted pairs remaining
    When they navigate to that War's vote page
    Then two contestant cards are displayed
    And a progress bar shows "0 of N matchups"

  Scenario: Navigating to vote silently joins the War
    Given an authenticated voter who has not yet joined an active War
    When they navigate to that War's vote page
    Then the War is joined on their behalf before the first matchup is requested
    And no Join control or message is shown to them

  Scenario: Cards are rendered in the order the API returns
    Given the API returns a matchup with Contestant B as left and Contestant A as right
    When the vote page renders that matchup
    Then Contestant B is displayed on the left
    And Contestant A is displayed on the right

  Scenario: Both cards are disabled while a vote is in flight
    Given a voter on the vote screen with matchup M
    When they select a card
    Then both cards become disabled and show a loading state
    And a second selection has no effect until the vote request completes

  Scenario: Voter casts a vote and the next matchup loads automatically
    Given a voter on the vote screen with matchup M1
    When they select Contestant A's card and the vote succeeds
    Then the next matchup M2 is displayed automatically
    And the progress bar increments
    And both cards are enabled again

  Scenario: A decided pair is never shown again
    Given a voter who has voted on matchup M
    When they continue voting in the same War
    Then matchup M is never displayed again

  Scenario: A conflicting vote advances silently
    Given a stale tab showing matchup M that the voter already decided elsewhere
    When they select a card and the API responds 409
    Then no error message is shown
    And the next matchup loads automatically

  Scenario: There is no skip control
    Given a voter on the vote screen
    Then no skip, pass, or abstain control is displayed

  Scenario: Voter completes every matchup
    Given a voter who has voted on every pair but one
    When they cast the final vote
    And the next-matchup request then returns 204
    Then a completion screen is shown in place of a matchup
    And no further vote request is possible from that screen
