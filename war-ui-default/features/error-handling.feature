Feature: Error Handling

  Scenario: Session expiry sends the voter to log in again
    Given an authenticated voter whose session cannot be refreshed
    When a request they made returns 401 and refresh fails
    Then the message "Please log in to continue" is shown
    And they are redirected to /login

  Scenario: Voting is blocked with a closed-War message
    Given a War that has closed
    When a voter attempts to cast a vote
    Then the message "This War is locked — voting is closed" is shown
    And no vote request succeeds

  Scenario: Voting shows a join message as a defensive fallback
    Given a voter whose automatic join did not take effect before they voted
    When they attempt to cast a vote and the API responds 403 for a not-joined voter
    Then the message "Join this War to vote" is shown

  Scenario: A missing War shows a not-found message
    Given a War id that does not exist
    When a visitor requests that War's detail page or vote page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: Rate-limited voting is shown as a wait, not an error
    Given a voter who has been rate limited by the API
    When they attempt to cast a vote and the API responds 429 with a Retry-After value
    Then the message "Slow down a moment — try again in {Retry-After}" is shown
    And it is not presented as an error
    And voting re-enables automatically once that delay has passed

  Scenario: An unexpected validation failure shows a generic retry message
    Given a vote request that the API rejects with 422
    When the response is received
    Then the message "Something went wrong — please try again" is shown

  Scenario: A server error shows a generic retry message
    Given any request in this slice that the API answers with a 5xx status
    When the response is received
    Then the message "Server error — please try again shortly" is shown

  Scenario: A network failure shows a connectivity message
    Given any request in this slice that fails to reach the API at all
    When the failure occurs
    Then the message "Unable to reach the server — check your connection" is shown
