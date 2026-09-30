Feature: Moderation log

  Scenario: Granting a role writes a moderation log entry
    Given an Admin and a plain Voter
    When the Admin PUTs granted true for the moderator role on that Voter
    Then a moderation log entry records the Admin granting the moderator role to that Voter

  Scenario: Revoking a role writes a moderation log entry
    Given an Admin and a Voter who already has the moderator role
    When the Admin PUTs granted false for the moderator role on that Voter
    Then a moderation log entry records the Admin revoking the moderator role from that Voter
