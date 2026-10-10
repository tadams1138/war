@error-handling
Feature: Error Handling

  Scenario: Session expiry sends the voter to log in again
    Given the voter's session has expired and cannot be refreshed
    And an authenticated voter
    When they open that War's detail page
    Then the message "Please log in to continue" is shown
    And they are redirected to the login page

  Scenario: Voting is blocked with a closed-War message
    Given a War
    And that War has a matchup to vote on
    And that War has closed
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "This War is locked — voting is closed" is shown
    And the matchup still shows "Left Contestant"

  # The join is automatic; the API refuses the vote anyway.
  Scenario: Voting shows a join message as a defensive fallback
    Given a War
    And that War has a matchup to vote on
    And the voter's automatic join did not take effect
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "Join this War to vote" is shown

  Scenario: A missing War shows a not-found message on its detail page
    Given a War that does not exist
    When a visitor opens that War's detail page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: A missing War shows a not-found message on its vote page
    Given a War that does not exist
    And an authenticated voter
    When they open that War's vote page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: Rate-limited voting is shown as a wait, not an error
    Given a War
    And that War has a matchup to vote on
    And the API is rate limiting votes for 1 second
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "Slow down a moment — try again in 1s" is shown
    And the message is announced as a status, not an alert
    And voting is disabled
    And voting re-enables once that delay has passed

  Scenario: An unexpected validation failure shows a generic retry message
    Given a War
    And that War has a matchup to vote on
    And the API rejects a vote as invalid
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "Something went wrong — please try again" is shown

  Scenario: A server error shows a generic retry message
    Given a War
    And that War has a matchup to vote on
    And the API fails a vote with a server error
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "Server error — please try again shortly" is shown

  Scenario: A network failure shows a connectivity message
    Given a War
    And that War has a matchup to vote on
    And the API cannot be reached to cast a vote
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then the message "Unable to reach the server — check your connection" is shown
