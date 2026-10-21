@admin-voters
Feature: Admin Dashboard Voters

  Scenario: The Voters list shows badges and War counts
    Given the API lists these Voters to Admins and Moderators:
      | name          | badge     | war count |
      | Plain Pat     |           | 2         |
      | Mod Max       | Moderator | 1         |
      | Admin Ada     | Admin     | 0         |
      | Suspended Sam | Suspended | 0         |
      | Banned Bo     | Banned    | 0         |
    And an authenticated Admin
    When they open the Admin Dashboard
    Then the Voters list shows these Voters, in order:
      | name          | badge     | Wars   |
      | Plain Pat     |           | 2 Wars |
      | Mod Max       | Moderator | 1 War  |
      | Admin Ada     | Admin     | 0 Wars |
      | Suspended Sam | Suspended | 0 Wars |
      | Banned Bo     | Banned    | 0 Wars |

  Scenario: Filtering the Voters list by status
    Given the API lists these Voters to Admins and Moderators:
      | name          | badge     |
      | Plain Pat     |           |
      | Suspended Sam | Suspended |
      | Banned Bo     | Banned    |
      | Role Rae      | Moderator |
    And an authenticated Admin
    And they are on the Admin Dashboard
    When they filter the Voters list by "Suspended"
    Then the Voters list shows only "Suspended Sam"
    And the Voters list was last requested for the "Suspended" filter
    When they filter the Voters list by "Banned"
    Then the Voters list shows only "Banned Bo"
    And the Voters list was last requested for the "Banned" filter
    When they filter the Voters list by "Role holders"
    Then the Voters list shows only "Role Rae"
    And the Voters list was last requested for the "Role holders" filter
    When they filter the Voters list by "All"
    Then the Voters list shows, in order:
      | Plain Pat     |
      | Suspended Sam |
      | Banned Bo     |
      | Role Rae      |
    And the Voters list was last requested for the "All" filter
    And the Voters list was requested 5 times

  Scenario: Searching the Voters list is debounced
    Given the API lists these Voters to Admins and Moderators:
      | name  |
      | Alpha |
      | Beta  |
    And an authenticated Admin
    And they are on the Admin Dashboard
    When they search the Voters list for "beta"
    Then the Voters list shows only "Beta"
    And the Voters list was searched exactly once, for "beta"

  Scenario: Load more appends the next page of Voters
    Given the API lists these Voters to Admins and Moderators, 1 per page:
      | name  |
      | Alpha |
      | Beta  |
    And an authenticated Admin
    And they are on the Admin Dashboard
    Then the Voters list shows only "Alpha"
    When they select the "Load more" button
    Then the Voters list shows, in order:
      | Alpha |
      | Beta  |
    And the next page of the Voters list was requested from where the first page ended
    And the "Load more" button is hidden

  Scenario: Opening a Voter shows their detail with their Wars
    Given the API lists these Voters to Admins and Moderators:
      | name          | badge     |
      | Casey Creator | Moderator |
    And that Voter created these Wars:
      | title     | removed |
      | Alpha War |         |
      | Beta War  | yes     |
    And an authenticated Moderator
    And they are on the Admin Dashboard
    When they select "Casey Creator" in the Voters list
    Then that Voter's detail page is shown
    And the heading "Casey Creator" is shown
    And the Voter's badges and every War they created are shown, the removed one marked Removed
    When they select "Alpha War" in the Voter's Wars
    Then the first War's moderation page is shown
    And the heading "Alpha War" is shown

  Scenario: An Admin opens one of a Voter's Wars from the Voter's detail page
    Given a plain Voter
    And that Voter created these Wars:
      | title     | status |
      | Draft War | draft  |
    And an authenticated Admin
    And they are on that Voter's detail page
    When they select "Draft War" in the Voter's Wars
    Then the first War's detail page is shown

  Scenario: A Voter's vote history shows the winner and loser of each vote
    # A vote in a War with no title shows an untitled War.
    Given a plain Voter
    And that Voter has cast these votes:
      | War       | winner | loser  | cast                 |
      | Alpha War | Rocky  | Apollo | 2026-10-03T12:00:00Z |
      |           | Creed  | Drago  | 2026-10-02T12:00:00Z |
    And an authenticated Moderator
    When they open that Voter's detail page
    Then each vote shows its War, the winner, the loser and when it was cast
    When they select "Alpha War" in the vote history
    Then the first War's moderation page is shown
    And the heading "Alpha War" is shown

  Scenario: A Voter's vote history pages with Load more
    Given a plain Voter
    And that Voter has cast these votes, 1 per page:
      | War       | winner | loser  |
      | Alpha War | Rocky  | Apollo |
      | Beta War  | Creed  | Drago  |
    And an authenticated Moderator
    And they are on that Voter's detail page
    Then the vote history shows only "Alpha War"
    When they select the "Load more" button
    Then the vote history shows, in order:
      | Alpha War |
      | Beta War  |
    And the next page of the vote history was requested from where the first page ended
    And the "Load more" button is hidden

  Scenario: Suspending a Voter requires confirmation
    Given a plain Voter
    And the API accepts a request to suspend that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Suspend" button
    Then a confirmation is shown
    And the API has not been asked to suspend that Voter
    When they confirm
    Then the API has been asked to suspend that Voter
    And that Voter's detail was requested 2 times
    And the Voter's badges are "Suspended"
    And no confirmation is shown
    And the "Unsuspend" button is shown

  Scenario: Cancelling the suspension confirmation does nothing
    Given a plain Voter
    And the API accepts a request to suspend that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Suspend" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to suspend that Voter
    And the Voter has no badges
    And the "Suspend" button is shown

  Scenario: A failed suspension shows an error
    Given a plain Voter
    And the API fails a request to suspend that Voter with a server error
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Suspend" button
    And they confirm
    Then the message "Server error — please try again shortly" is shown
    And the Voter has no badges

  Scenario: Unsuspending a Voter
    Given a suspended Voter
    And the API accepts a request to unsuspend that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    Then the Voter's badges are "Suspended"
    When they select the "Unsuspend" button
    Then the API has been asked to unsuspend that Voter
    And no confirmation is shown
    And the Voter has no badges
    And the "Suspend" button is shown

  Scenario: Banning a Voter requires a confirmation that states what is deleted
    Given a plain Voter
    And the API accepts a request to ban that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Ban" button
    Then a confirmation is shown
    And the confirmation says "permanently deletes every War they created and every vote they cast"
    And the confirmation says "blocks their sign-in"
    And the API has not been asked to ban that Voter
    When they confirm
    Then the API has been asked to ban that Voter
    And that Voter's detail was requested 2 times
    And the Voter's badges are "Banned"
    And no confirmation is shown
    And the "Unban" button is shown

  Scenario: Cancelling the ban confirmation does nothing
    Given a plain Voter
    And the API accepts a request to ban that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Ban" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to ban that Voter
    And the Voter has no badges
    And the "Ban" button is shown

  Scenario: A failed ban shows an error
    Given a plain Voter
    And the API refuses a request to ban that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Ban" button
    And they confirm
    Then the message "You don't have permission to do that" is shown
    And the Voter has no badges

  Scenario: Unbanning a Voter
    Given a banned Voter
    And the API accepts a request to unban that Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    Then the Voter's badges are "Banned"
    When they select the "Unban" button
    Then a confirmation is shown
    And the confirmation says "restores sign-in only"
    When they confirm
    Then the API has been asked to unban that Voter
    And the Voter has no badges
    And the "Ban" button is shown

  Scenario: An Admin sees role controls on a Voter
    Given a plain Voter
    And an authenticated Admin
    And they are on that Voter's detail page
    Then the "Grant Moderator" button is shown
    And the "Grant Admin" button is shown

  Scenario: A Moderator does not see role controls
    Given a plain Voter
    And an authenticated Moderator
    And they are on that Voter's detail page
    Then the "Suspend" button is shown
    And no role controls are offered

  Scenario: Granting Moderator sends the grant and updates the badges
    Given a plain Voter
    And the API accepts a request to grant that Voter the Moderator role
    And an authenticated Admin
    And they are on that Voter's detail page
    When they select the "Grant Moderator" button
    Then the API has been asked to grant that Voter the Moderator role
    And no confirmation is shown
    And that Voter's detail was requested 2 times
    And the Voter's badges are "Moderator"
    And the "Revoke Moderator" button is shown

  Scenario: Revoking Admin requires confirmation
    Given another Admin
    And the API accepts a request to revoke that Voter's Admin role
    And an authenticated Admin
    And they are on that Voter's detail page
    Then the Voter's badges are "Admin"
    When they select the "Revoke Admin" button
    Then a confirmation is shown
    And the API has not been asked to revoke that Voter's Admin role
    When they confirm
    Then the API has been asked to revoke that Voter's Admin role
    And the Voter has no badges

  Scenario: Cancelling the Revoke Admin confirmation does nothing
    Given another Admin
    And the API accepts a request to revoke that Voter's Admin role
    And an authenticated Admin
    And they are on that Voter's detail page
    When they select the "Revoke Admin" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to revoke that Voter's Admin role
    And the Voter's badges are "Admin"

  Scenario: A refused role change shows an error
    Given a plain Voter
    And the API refuses a request to grant that Voter the Moderator role
    And an authenticated Admin
    And they are on that Voter's detail page
    When they select the "Grant Moderator" button
    Then the message "You don't have permission to do that" is shown
    And the Voter has no badges

  Scenario: An Admin who is also a Moderator cannot suspend or ban themselves or revoke their own Admin role
    Given the signed-in voter is an Admin and a Moderator
    And an authenticated Admin and Moderator
    And they are on their own detail page
    Then the "Revoke Moderator" button is shown
    And no "Suspend", "Ban" or "Revoke Admin" action is offered
    And a note says "You cannot suspend or ban your own account."

  Scenario: Suspend and Ban are not offered against a role holder
    Given another Moderator
    And an authenticated Moderator
    And they are on that Voter's detail page
    Then the Voter's badges are "Moderator"
    And no "Suspend" or "Ban" action is offered
    And a note says "A role holder cannot be suspended or banned; their role must be revoked by an Admin first."

  Scenario: A plain Voter cannot reach a Voter's detail page
    Given a plain Voter
    And an authenticated voter
    When they open that Voter's detail page
    Then they are redirected to Home
    And no detail page is shown

  Scenario: An unknown Voter's detail page says the Voter doesn't exist
    Given no Voter exists with the requested id
    And an authenticated Admin
    When they open that Voter's detail page
    Then the message "This Voter doesn't exist" is shown

  Scenario: A moderation action on a Voter who no longer exists says the Voter doesn't exist
    Given a plain Voter
    And the target of a request to suspend that Voter does not exist
    And an authenticated Moderator
    And they are on that Voter's detail page
    When they select the "Suspend" button
    And they confirm
    Then the message "This Voter doesn't exist" is shown

  Scenario: The current Voter's identity is fetched once per visit to a Voter's detail page
    Given a plain Voter
    And an authenticated Moderator
    When they open that Voter's detail page
    Then the "Suspend" button is shown
    And the current Voter's identity was requested 1 time

  Scenario: An Admin grants themselves Moderator, keeps Admin and gets the moderation panels
    Given the signed-in voter is an Admin
    And the API accepts a request to grant that Voter the Moderator role
    And an authenticated Admin
    And they are on their own detail page
    When they select the "Grant Moderator" button
    Then the API has been asked to grant that Voter the Moderator role
    And the Voter's badges are "Admin, Moderator"
    And the "Revoke Moderator" button is shown
    When they open the Admin Dashboard
    Then the Wars list was requested 1 time

  Scenario: An Admin revokes their own Moderator role
    Given the signed-in voter is an Admin and a Moderator
    And the API accepts a request to revoke that Voter's Moderator role
    And an authenticated Admin and Moderator
    And they are on their own detail page
    When they select the "Revoke Moderator" button
    Then the API has been asked to revoke that Voter's Moderator role
    And the Voter's badges are "Admin"
    And the "Grant Moderator" button is shown
