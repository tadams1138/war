@vote-mode
Feature: Vote Mode

  Background:
    Given a War

  Scenario: A voter is served a matchup
    Given that War has a matchup to vote on
    And an authenticated voter
    When they open that War's vote page
    Then the matchup is shown
    And two contestant cards are shown
    And the progress bar shows "0 of 10 matchups"

  Scenario: Opening a War's vote page joins the voter to it automatically
    Given that War has a matchup to vote on
    And an authenticated voter
    When they open that War's vote page
    Then the War is joined on their behalf before the first matchup is requested
    And the matchup is shown
    And no Join control or message is shown

  Scenario: Cards are rendered in the order the API returns
    Given that War has a matchup to vote on
    And the left contestant is named "Contestant B"
    And the right contestant is named "Contestant A"
    And an authenticated voter
    When they open that War's vote page
    Then "Contestant B" is displayed on the left
    And "Contestant A" is displayed on the right

  Scenario: A card's image paging does not carry over to the next matchup
    Given that War has a matchup to vote on
    And the left contestant has 2 images
    And a later matchup between "Third" and "Fourth"
    And the left contestant has 2 images
    And the API accepts votes
    And an authenticated voter
    And they are on that War's vote page
    When they click the next-image arrow on the left contestant's card
    Then the left contestant's card shows image 2
    When they vote for "Right Contestant"
    Then "Third" is displayed on the left
    And the left contestant's card shows image 1

  Scenario: Both cards are disabled while a vote is in flight
    Given that War has a matchup to vote on
    And the API takes 400 ms to accept a vote
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    And they vote for "Right Contestant"
    Then voting is disabled
    And exactly one vote is submitted

  Scenario: Voter casts a vote and the next matchup loads automatically
    Given that War has a matchup to vote on
    And a later matchup between "Third" and "Fourth"
    And the API accepts votes
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then "Third" is displayed on the left
    And "Fourth" is displayed on the right
    And the progress bar shows "1 of 10 matchups"
    And voting re-enables

  Scenario: A decided pair is never shown again
    Given that War has a matchup to vote on
    And a later matchup between "Third" and "Fourth"
    And the API accepts votes
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then "Third" is displayed on the left
    And "Left Contestant" is not displayed
    And "Right Contestant" is not displayed
    And the next matchup has been requested 2 times

  Scenario: A conflicting vote advances silently
    Given that War has a matchup to vote on
    And the voter already decided that matchup elsewhere
    And a later matchup between "Third" and "Fourth"
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then "Third" is displayed on the left
    And no error message is shown

  Scenario: There is no skip control
    Given that War has a matchup to vote on
    And an authenticated voter
    When they open that War's vote page
    Then the matchup is shown
    And no skip, pass or abstain control is displayed

  Scenario: Voter completes every matchup
    Given that War has a matchup to vote on
    And that matchup is the last one the voter has to decide
    And the API accepts votes
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then they are redirected to that War's results page

  Scenario: Visiting the vote page after already voting on everything redirects to results
    Given the voter has voted on every matchup in that War
    And an authenticated voter
    When they open that War's vote page
    Then they are redirected to that War's results page
