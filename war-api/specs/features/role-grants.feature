Feature: Role grants

  Scenario: An Admin grants Moderator to a Voter
    Given an Admin and a plain Voter
    When the Admin grants the moderator role to that Voter
    Then the response status is 200
    And the Voter now has the moderator role

  Scenario: An Admin revokes Moderator from a Voter
    Given an Admin and a Voter who already has the moderator role
    When the Admin revokes the moderator role from that Voter
    Then the response status is 200
    And the Voter no longer has the moderator role

  Scenario: A Voter who is not an Admin cannot grant a role
    Given a plain Voter and a target Voter
    When the plain Voter grants the moderator role to the target Voter
    Then the response status is 403

  Scenario: Granting a role on a nonexistent voter 404s
    Given an Admin
    When the Admin grants the moderator role to a nonexistent Voter
    Then the response status is 404

  Scenario: An Admin cannot remove their own Admin role
    Given an Admin
    When the Admin revokes the admin role from themselves
    Then the response status is 403
    And the Admin still has the admin role

  Scenario: Another Admin can remove a first Admin's role
    Given two Admins
    When the first Admin revokes the admin role from the second Admin
    Then the response status is 200
    And the second Admin no longer has the admin role

  Scenario: An Admin grants themselves Moderator, keeps Admin and can then use a Moderator feature
    Given an Admin
    When the Admin grants the moderator role to themselves
    Then the response status is 200
    And the Admin has both the admin and moderator roles
    And the Admin can GET the unaddressed-reports queue

  Scenario: An Admin revokes their own Moderator role
    Given an Admin who also has the moderator role
    When the Admin revokes the moderator role from themselves
    Then the response status is 200
    And the Admin no longer has the moderator role but still has the admin role
