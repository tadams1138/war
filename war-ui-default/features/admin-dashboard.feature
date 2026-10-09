Feature: Admin Dashboard

  Scenario: The Admin Dashboard requires authentication
    Given no voter is authenticated
    When they navigate directly to "/admin"
    Then they are redirected to "/login"
    And the returnTo query param is "/admin"

  Scenario: A plain Voter is redirected Home and sees no dashboard link
    Given an authenticated voter who is neither a Moderator nor an Admin
    When they navigate to "/admin"
    Then they are redirected to "/"
    And the navigation offers no Admin Dashboard link

  Scenario: A Moderator sees the dashboard link and the dashboard
    Given an authenticated Moderator
    When they open the account menu
    Then the Admin Dashboard link is offered
    When they select it
    Then the Admin Dashboard is shown beneath the navigation header

  Scenario: An Admin reaches the dashboard
    Given an authenticated Admin
    When they navigate to "/admin"
    Then the Admin Dashboard is shown beneath the navigation header

  Scenario: The kill switch panel shows the current state
    Given the War-creation kill switch is off
    When a Staff member opens the Admin Dashboard
    Then the kill switch is shown as off

  Scenario: Enabling the kill switch requires confirmation
    Given the War-creation kill switch is off
    When a Staff member chooses to enable it
    Then a confirmation is shown and the switch is not yet set
    When they confirm
    Then the kill switch is shown as on
    And the switch was set to enabled

  Scenario: Cancelling the confirmation leaves the kill switch unchanged
    Given the War-creation kill switch is off
    When a Staff member chooses to enable it and cancels
    Then the kill switch is still shown as off
    And no request to set the switch was made

  Scenario: Disabling the kill switch needs no confirmation
    Given the War-creation kill switch is on
    When a Staff member turns it off
    Then the kill switch is shown as off

  Scenario: A failed kill switch update shows an error and leaves the state unchanged
    Given the War-creation kill switch is off and setting it will fail
    When a Staff member enables it and confirms
    Then an error is shown
    And the kill switch is still shown as off

  Scenario: The moderation log lists entries newest first with readable labels
    Given the moderation log holds several entries
    When a Staff member opens the Admin Dashboard
    Then each entry shows a readable action label, who did it, its target, and when
    And an unknown action is shown as its raw string

  Scenario: Load more appends the next page and hides once there is no next cursor
    Given the moderation log has a further page
    When a Staff member chooses Load more
    Then the next page's entries are appended
    And Load more is hidden once there is no next cursor

  Scenario: Toggling the kill switch adds its entry to the moderation log
    Given the War-creation kill switch is off
    When a Staff member enables it and confirms
    Then the moderation log is refetched and shows the new entry

  Scenario: A banned Voter's sign-in shows a banned message
    Given the OAuth callback reports the account as banned
    When the SPA's callback route is loaded
    Then a message says this account has been banned

  Scenario: A moderation log entry targeting a War links to its detail
    Given a moderation log entry targets a War
    When a Staff member opens the Admin Dashboard
    Then the entry shows the War's title, linked to that War's Staff detail

  Scenario: A moderation log entry targeting a deleted War shows no link
    Given a moderation log entry targets a War that no longer exists
    When a Staff member opens the Admin Dashboard
    Then the entry says a deleted War was targeted, with its id and no link

  Scenario: A moderation log entry targeting an untitled live War links to it
    Given a moderation log entry targets a live War that has no title
    When a Staff member opens the Admin Dashboard
    Then the entry names it as an untitled War and links to its Staff detail

  Scenario: A moderation log entry's Voter ids link to the Voter's detail
    Given a moderation log entry targets a Voter
    When a Staff member opens the Admin Dashboard
    Then the target Voter's name and the acting Staff member's name link to their Voter detail

  Scenario: The current Voter's identity is fetched once per visit to the Admin Dashboard
    Given an authenticated Moderator
    When they open the Admin Dashboard
    Then the current Voter's identity was requested exactly once

  Scenario: Signing in as another Voter does not reuse the previous Voter's identity
    Given an authenticated Moderator is on the Admin Dashboard
    When they log out and a plain Voter signs in and opens the Admin Dashboard
    Then they are redirected to "/" and the identity was requested once per sign-in
