Feature: Role grants

  Scenario: An Admin grants Moderator to a Voter
    Given an Admin and a plain Voter
    When the Admin PUTs granted true for the moderator role on that Voter
    Then the response status is 200
    And the Voter now has the moderator role

  Scenario: An Admin revokes Moderator from a Voter
    Given an Admin and a Voter who already has the moderator role
    When the Admin PUTs granted false for the moderator role on that Voter
    Then the response status is 200
    And the Voter no longer has the moderator role

  Scenario: A non-Admin cannot grant any role
    Given a plain Voter and another plain Voter
    When the first Voter PUTs granted true for the moderator role on the second
    Then the response status is 403

  Scenario: A Moderator alone cannot grant any role
    Given a Moderator and a plain Voter
    When the Moderator PUTs granted true for the admin role on the plain Voter
    Then the response status is 403

  Scenario: Granting a role on a nonexistent voter 404s
    Given an Admin
    When the Admin PUTs granted true for the moderator role on a nonexistent voter id
    Then the response status is 404
