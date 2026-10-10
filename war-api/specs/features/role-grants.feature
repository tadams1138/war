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

  Scenario Outline: A caller who is not an Admin cannot grant any role
    Given a <caller> and a target Voter
    When the <caller> grants the <role> role to the target Voter
    Then the response status is 403

    Examples:
      | caller      | role      |
      | plain Voter | moderator |
      | Moderator   | admin     |

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
