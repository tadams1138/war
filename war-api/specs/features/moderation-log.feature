Feature: Moderation log

  Scenario: Granting a role writes a moderation log entry
    Given an Admin and a plain Voter
    When the Admin grants the moderator role to that Voter
    Then a moderation log entry records the Admin granting the moderator role to that Voter

  Scenario: Revoking a role writes a moderation log entry
    Given an Admin and a Voter who already has the moderator role
    When the Admin revokes the moderator role from that Voter
    Then a moderation log entry records the Admin revoking the moderator role from that Voter

  Scenario: A refused self-removal writes no moderation log entry
    Given an Admin
    When the Admin revokes the admin role from themselves
    Then no moderation log entry exists

  Scenario: An Admin reads the role-change entries newest first
    Given an Admin who granted and then revoked the moderator role on a Voter
    When the Admin GETs the moderation log
    Then the response lists the revoke before the grant, each naming the Admin, the Voter, and when

  Scenario: A plain Voter cannot read the moderation log
    Given a plain Voter
    When that Voter GETs the moderation log
    Then the response is 403

  Scenario: The moderation log is returned a page at a time
    Given a Moderator, and 5 moderation log entries logged within the same millisecond
    When the Moderator GETs the moderation log with limit 2
    Then the response has the 2 newest entries and a next cursor

  Scenario: Following the next cursor returns every remaining entry exactly once
    Given a Moderator, and 5 moderation log entries logged within the same millisecond
    When the Moderator pages through the moderation log with limit 2 following each next cursor
    Then every entry appears exactly once, newest first, and the last page has a null next cursor

  Scenario: A malformed cursor is rejected
    Given a Moderator
    When the Moderator GETs the moderation log with cursor "not-a-cursor"
    Then the response is 400

  Scenario: A limit outside 1 to 100 is rejected
    Given a Moderator
    When the Moderator GETs the moderation log with limit 101
    Then the response is 400

  Scenario: Entries carry the names of the acting role holder and the targets
    Given an Admin named "admin" who granted the moderator role to a Voter named "target"
    And a Moderator named "mod" who logged an action on a War titled "Doomed War"
    When the Admin GETs the moderation log
    Then the role entry names the Admin as the actor and the Voter as target, with a null War title
    When the Moderator GETs the moderation log
    Then the War entry names the Moderator as the actor and the War by title, with a null Voter name

  Scenario: A removed War's title is still shown
    Given a Moderator who removed a War titled "Removed War"
    When the Moderator GETs the moderation log
    Then the entry carries the War title "Removed War"

  Scenario: A hard-deleted War leaves a flagged entry with a null title
    Given a Moderator who logged an action on a War that was later hard-deleted
    When the Moderator GETs the moderation log
    Then the entry remains, still naming the deleted War's id, with a null War title
    And the entry is flagged as targeting a deleted War

  Scenario: A live War with no title is not flagged as deleted
    Given a Moderator who logged an action on a live War with no title
    When the Moderator GETs the moderation log
    Then the entry has a null War title and is not flagged as targeting a deleted War

  Scenario: An entry with no War target is not flagged as deleted
    Given a Moderator who enabled the kill switch
    When the Moderator GETs the moderation log
    Then the entry is not flagged as targeting a deleted War

  Scenario: A Voter who is not a Moderator sees no moderation entries
    Given an Admin who granted the moderator role to a Voter, and a Moderator who removed a War
    When the Admin GETs the moderation log
    Then the response lists the role grant and no moderation entry

  Scenario: A Voter who is not an Admin sees no role-change entries
    Given an Admin who granted the moderator role to a Voter, and a Moderator who removed a War
    When the Moderator GETs the moderation log
    Then the response lists the War removal and no role-change entry

  Scenario: An Admin's action on another Voter's War is logged naming the Admin and the War
    Given an Admin and a published War titled "Their War" created by Voter A
    When the Admin unpublishes the War
    And the Admin GETs the moderation log
    Then the entry names the Admin as the actor and the War by title "Their War"

  Scenario: An Admin acting on their own War writes no moderation log entry
    Given an Admin and a published War created by that Admin
    When the Admin unpublishes the War
    Then no moderation log entry exists

  Scenario: Every kind of change an Admin makes to another Voter's War is logged once per request
    Given an Admin and a draft War created by Voter A with 2 contestants
    When the Admin edits, shares, adds and edits a contestant, adds, reorders and removes an image, removes a contestant, publishes, unpublishes, clears the votes of and deletes the War
    Then the log holds one entry per request, with the action names edit_war, set_share_image, add_contestant, edit_contestant, add_image, reorder_images, remove_image, remove_contestant, publish_war, unpublish_war, clear_votes and delete_war

  Scenario: A Moderator sees no owner-action entries
    Given a published War created by Voter A, an Admin who unpublished it and a Moderator who removed another War
    When the Moderator GETs the moderation log
    Then the response lists the War removal and no owner-action entry

  Scenario: An Admin sees owner-action entries and no moderation entries
    Given a published War created by Voter A, an Admin who unpublished it and a Moderator who removed another War
    When the Admin GETs the moderation log
    Then the response lists the owner action and no moderation entry

  Scenario: A refused owner action by an Admin writes no entry
    Given an Admin and a War created by Voter A
    When the Admin PATCHes the War with an invalid title
    Then no moderation log entry exists

  Scenario: An Admin's change to another Voter's War is undone when its log entry can't be written
    Given a published War created by Voter A
    And an Admin
    And the moderation log cannot be written
    When the Admin PATCHes the title
    Then the response is 500
    And the War's title is unchanged
    And no moderation log entry exists

  Scenario: An Admin's contestant image upload leaves nothing behind when its log entry can't be written
    Given a published War created by Voter A, with a contestant
    And an Admin
    And the moderation log cannot be written
    When the Admin uploads an image to that contestant
    Then the response is 500
    And the contestant has no images
    And nothing from the upload is left in storage

  Scenario: An Admin's share image upload leaves the War's share image as it was when its log entry can't be written
    Given a published War created by Voter A, with a share image
    And an Admin
    And the moderation log cannot be written
    When the Admin uploads a new share image
    Then the response is 500
    And the War's share image is unchanged
    And nothing from the upload is left in storage
