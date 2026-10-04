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
