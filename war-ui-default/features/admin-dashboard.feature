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

  Scenario: Load more appends the next page
    Given the moderation log has a further page
    When a Staff member chooses Load more
    Then the next page's entries are appended
    And Load more is hidden once there is no next cursor

  Scenario: Toggling the kill switch adds its log entry
    Given the War-creation kill switch is off
    When a Staff member enables it and confirms
    Then the moderation log is refetched and shows the new entry

  Scenario: A banned Voter's sign-in shows a banned message
    Given the OAuth callback reports the account as banned
    When the SPA's callback route is loaded
    Then a message says this account has been banned

  Scenario: The Wars list shows Wars of every status with removed and report markers
    Given Wars of every status exist, one removed and one with unaddressed reports
    When a Staff member opens the Admin Dashboard
    Then each War is listed with its title, status, and creator
    And the removed War is marked Removed
    And the War with unaddressed reports shows a report count badge
    And an untitled War shows a placeholder title

  Scenario: Filtering the Wars list by status
    Given the Wars list is shown
    When a Staff member picks the Removed status filter
    Then the list is requested with that status and shows the matching Wars

  Scenario: Searching the Wars list is debounced
    Given the Wars list is shown
    When a Staff member types a search term
    Then one request carrying the settled term is made and the matching Wars are shown

  Scenario: Load more appends the next page of Wars
    Given the Wars list has a further page
    When a Staff member chooses Load more in the Wars list
    Then the next page is requested with its cursor and appended
    And Load more is hidden once there is no next cursor

  Scenario: Opening a War shows its Staff detail with contestants and reports
    Given a published War with contestants and reports
    When a Staff member selects it in the Wars list
    Then they are taken to the War's Staff detail at "/admin/wars/:id"
    And its contestants are shown with their standings
    And its reports are shown with their explanation and addressed state

  Scenario: Marking a report addressed and unaddressed
    Given a War with an unaddressed report
    When a Staff member marks the report addressed
    Then the report is patched as addressed and shown as addressed
    When they mark it unaddressed
    Then the report is patched as unaddressed and shown as unaddressed

  Scenario: A failed report update shows an error and leaves the report unchanged
    Given a War with an unaddressed report and updating it will fail
    When a Staff member marks the report addressed
    Then an error is shown and the report is still unaddressed

  Scenario: Removing a War requires confirmation
    Given a published War's Staff detail
    When a Staff member chooses Remove War
    Then an in-page confirmation explains the War is hidden and its media permanently deleted, and nothing is sent yet
    When they confirm
    Then the removal is requested, the detail is refetched and shows the War as Removed
    And the Remove War action is gone

  Scenario: Cancelling the removal confirmation does nothing
    Given a published War's Staff detail
    When a Staff member chooses Remove War and cancels
    Then no removal is requested and the War is unchanged

  Scenario: A failed removal shows an error
    Given a published War's Staff detail and removing it will fail
    When a Staff member chooses Remove War and confirms
    Then an error is shown and the War is not shown as removed

  Scenario: A removed War's detail offers no Remove action and requests no reports
    Given a removed War
    When a Staff member opens its Staff detail
    Then it is shown as Removed with no Remove War action
    And its reports were not requested

  Scenario: The unaddressed reports queue lists Wars and opens their detail
    Given Wars with unaddressed reports are waiting
    When a Staff member opens the Admin Dashboard
    Then each is listed with its title and unaddressed count
    When they select one
    Then that War's Staff detail is shown

  Scenario: The unaddressed reports queue shows an empty state
    Given no reports are waiting
    When a Staff member opens the Admin Dashboard
    Then the queue says nothing is waiting

  Scenario: A moderation log entry targeting a War links to its detail
    Given a moderation log entry targets a War
    When a Staff member opens the Admin Dashboard
    Then the entry's War id links to that War's Staff detail

  Scenario: A plain Voter cannot reach a War's Staff detail
    Given an authenticated voter who is neither a Moderator nor an Admin
    When they navigate to "/admin/wars/w-1"
    Then they are redirected to "/"

  Scenario: The Voters list shows badges and War counts
    Given Voters exist, including a Moderator, an Admin, a suspended Voter and a banned Voter
    When a Staff member opens the Admin Dashboard
    Then each Voter is listed with their name and the number of Wars they created
    And Moderator, Admin, Suspended and Banned Voters carry the matching badge

  Scenario: Filtering the Voters list by status
    Given the Voters list is shown
    When a Staff member picks each of the Suspended, Banned, Staff and All filters in turn
    Then each request carries the matching status, none for All, and the matching Voters are shown

  Scenario: Searching the Voters list is debounced
    Given the Voters list is shown
    When a Staff member types a search term
    Then one request carrying the settled term is made and the matching Voters are shown

  Scenario: Load more appends the next page of Voters
    Given the Voters list has a further page
    When a Staff member chooses Load more in the Voters list
    Then the next page is requested with its cursor and appended
    And Load more is hidden once there is no next cursor

  Scenario: Opening a Voter shows their Staff detail with their Wars
    Given a Voter who created a published War and a removed War
    When a Staff member selects them in the Voters list
    Then they are taken to the Voter's Staff detail at "/admin/voters/:id"
    And the Voter's badges and every War they created are shown, the removed one marked Removed
    When they select a War
    Then that War's Staff detail is shown

  Scenario: A Voter's vote history shows the winner and loser of each vote
    Given a Voter who has cast votes
    When a Staff member opens their Staff detail
    Then each vote shows its War, the winner, the loser and when it was cast
    When they select a vote's War
    Then that War's Staff detail is shown

  Scenario: A Voter's vote history pages with Load more
    Given a Voter whose vote history has a further page
    When a Staff member chooses Load more in the vote history
    Then the next page is requested with its cursor and appended
    And Load more is hidden once there is no next cursor

  Scenario: Suspending a Voter requires confirmation
    Given a plain Voter's Staff detail
    When a Staff member chooses Suspend and the confirmation is shown
    Then nothing has been sent yet
    When they confirm
    Then the suspension is requested, the detail is refetched and shows the Voter as Suspended
    And the action now offers Unsuspend

  Scenario: Cancelling the suspension confirmation does nothing
    Given a plain Voter's Staff detail
    When a Staff member chooses Suspend and cancels
    Then no suspension is requested and the Voter is unchanged

  Scenario: A failed suspension shows an error
    Given a plain Voter's Staff detail and suspending will fail
    When a Staff member chooses Suspend and confirms
    Then an error is shown and the Voter is not shown as Suspended

  Scenario: Unsuspending a Voter
    Given a suspended Voter's Staff detail
    When a Staff member chooses Unsuspend
    Then the suspension is lifted with no confirmation, and the detail shows the Voter as no longer Suspended

  Scenario: Banning a Voter requires a confirmation that states what is deleted
    Given a plain Voter's Staff detail
    When a Staff member chooses Ban
    Then the confirmation says every War the Voter created and every vote they cast is permanently deleted and sign-in is blocked, and nothing is sent yet
    When they confirm
    Then the ban is requested, the detail is refetched and shows the Voter as Banned
    And the action now offers Unban

  Scenario: Cancelling the ban confirmation does nothing
    Given a plain Voter's Staff detail
    When a Staff member chooses Ban and cancels
    Then no ban is requested and the Voter is unchanged

  Scenario: A failed ban shows an error
    Given a plain Voter's Staff detail and banning will be refused
    When a Staff member chooses Ban and confirms
    Then an error is shown and the Voter is not shown as Banned

  Scenario: Unbanning a Voter
    Given a banned Voter's Staff detail
    When a Staff member chooses Unban and confirms
    Then the confirmation says unban restores sign-in only, the unban is requested, and the Voter is no longer shown as Banned

  Scenario: An Admin sees role controls on a Voter
    Given an authenticated Admin viewing a plain Voter's Staff detail
    Then they can grant the Moderator and Admin roles

  Scenario: A Moderator does not see role controls
    Given an authenticated Moderator viewing a plain Voter's Staff detail
    Then no role controls are offered

  Scenario: Granting Moderator sends the grant and updates the badges
    Given an authenticated Admin viewing a plain Voter's Staff detail
    When they grant the Moderator role
    Then the grant is requested with no confirmation, the detail is refetched and shows the Moderator badge
    And the control now offers Revoke Moderator

  Scenario: Revoking Admin requires confirmation
    Given an authenticated Admin viewing another Admin's Staff detail
    When they choose Revoke Admin
    Then a confirmation is shown and nothing is sent yet
    When they confirm
    Then the revocation is requested and the detail no longer shows the Admin badge

  Scenario: Cancelling the Revoke Admin confirmation does nothing
    Given an authenticated Admin viewing another Admin's Staff detail
    When they choose Revoke Admin and cancel
    Then no revocation is requested and the Voter is unchanged

  Scenario: A refused role change shows an error
    Given an authenticated Admin viewing a plain Voter's Staff detail and the grant will be refused
    When they grant the Moderator role
    Then an error is shown and the Voter's badges are unchanged

  Scenario: Staff cannot suspend or ban themselves or revoke their own Admin role
    Given an authenticated Admin viewing their own Staff detail
    Then no Suspend, Ban or Revoke Admin action is offered
    And a note explains why

  Scenario: Suspend and Ban are not offered against a Staff member
    Given an authenticated Moderator viewing another Moderator's Staff detail
    Then no Suspend or Ban action is offered
    And a note says a Staff member's role must be revoked first

  Scenario: A moderation log entry's Voter ids link to the Voter's detail
    Given a moderation log entry targets a Voter
    When a Staff member opens the Admin Dashboard
    Then the target Voter id and the acting Staff id link to their Voter detail

  Scenario: A plain Voter cannot reach a Voter's Staff detail
    Given an authenticated voter who is neither a Moderator nor an Admin
    When they navigate to "/admin/voters/x"
    Then they are redirected to "/"

  Scenario: An unknown Voter's Staff detail says the Voter doesn't exist
    Given no Voter exists with the requested id
    When a Staff member opens that Voter's Staff detail
    Then they are told the Voter doesn't exist, not that a War is missing
