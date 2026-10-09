Feature: Moderation log

  Scenario: Granting a role writes a moderation log entry
    Given an Admin and a plain Voter
    When the Admin PUTs granted true for the moderator role on that Voter
    Then a moderation log entry records the Admin granting the moderator role to that Voter

  Scenario: Revoking a role writes a moderation log entry
    Given an Admin and a Voter who already has the moderator role
    When the Admin PUTs granted false for the moderator role on that Voter
    Then a moderation log entry records the Admin revoking the moderator role from that Voter

  Scenario: A refused self-removal writes no moderation log entry
    Given an Admin
    When the Admin PUTs granted false for the admin role on themselves
    Then no moderation log entry exists

  Scenario: Staff read the moderation log newest first
    Given an Admin who granted and then revoked the moderator role on a Voter
    And a Moderator
    When the Moderator GETs the moderation log
    Then the response lists the revoke before the grant, each naming the Admin, the Voter, and when

  Scenario: A plain Voter cannot read the moderation log
    Given a plain Voter
    When that Voter GETs the moderation log
    Then the response is 403

  Scenario: The moderation log is returned a page at a time
    Given an Admin and a Moderator, and 5 moderation log entries logged within the same millisecond
    When the Moderator GETs the moderation log with limit 2
    Then the response has the 2 newest entries and a next cursor

  Scenario: Following the next cursor returns every remaining entry exactly once
    Given an Admin and a Moderator, and 5 moderation log entries logged within the same millisecond
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

  Scenario: Entries carry the names of the acting Staff member and the targets
    Given an Admin named "admin" who granted the moderator role to a Voter named "target" and logged an action on a War titled "Doomed War"
    And a Moderator
    When the Moderator GETs the moderation log
    Then the role entry names the Admin as staff and the Voter as target, with a null War title
    And the War entry names the Admin as staff and the War by title, with a null Voter name

  Scenario: A removed War's title is still shown
    Given an Admin who removed a War titled "Removed War"
    And a Moderator
    When the Moderator GETs the moderation log
    Then the entry carries the War title "Removed War"

  Scenario: A hard-deleted War leaves a flagged entry with a null title
    Given an Admin who logged an action on a War that was later hard-deleted
    And a Moderator
    When the Moderator GETs the moderation log
    Then the entry remains, still naming the deleted War's id, with a null War title
    And the entry is flagged as targeting a deleted War

  Scenario: A live War with no title is not flagged as deleted
    Given an Admin who logged an action on a live War with no title
    And a Moderator
    When the Moderator GETs the moderation log
    Then the entry has a null War title and is not flagged as targeting a deleted War

  Scenario: An entry with no War target is not flagged as deleted
    Given an Admin who granted the moderator role to a Voter
    And a Moderator
    When the Moderator GETs the moderation log
    Then the entry is not flagged as targeting a deleted War
