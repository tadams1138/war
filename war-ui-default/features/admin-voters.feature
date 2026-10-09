Feature: Admin Dashboard Voters

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

  Scenario: A plain Voter cannot reach a Voter's Staff detail
    Given an authenticated voter who is neither a Moderator nor an Admin
    When they navigate to "/admin/voters/x"
    Then they are redirected to "/"

  Scenario: An unknown Voter's Staff detail says the Voter doesn't exist
    Given no Voter exists with the requested id
    When a Staff member opens that Voter's Staff detail
    Then they are told the Voter doesn't exist, not that a War is missing

  Scenario: A Staff action on a Voter who no longer exists says the Voter doesn't exist
    Given a plain Voter's Staff detail and suspending will find no such Voter
    When a Staff member suspends the Voter and confirms
    Then they are told the Voter doesn't exist, not that a War is missing

  Scenario: The current Voter's identity is fetched once per visit to a Voter's Staff detail
    Given an authenticated Moderator
    When they open a Voter's Staff detail
    Then the current Voter's identity was requested exactly once
