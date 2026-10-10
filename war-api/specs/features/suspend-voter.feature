Feature: Suspend a Voter

  Scenario: A suspended Voter cannot create a War
    Given a Moderator and a plain Voter
    When the Moderator suspends the Voter
    And the Voter POSTs a War
    Then the response is 403 suspended and no War exists

  Scenario: Staff cannot suspend themselves
    Given a Moderator
    When the Moderator suspends themselves
    Then the response is 403 and the Moderator is not suspended and nothing is logged

  Scenario: Staff cannot suspend other Staff
    Given a Moderator and an Admin
    When the Moderator suspends the Admin
    Then the response is 403 and the Admin is not suspended and nothing is logged

  Scenario: Unsuspending restores War creation
    Given a Moderator and a plain Voter
    When the Moderator suspends the Voter
    And the Moderator unsuspends the Voter
    And the Voter POSTs a War
    Then the response is 201 and one War exists

  Scenario: Suspending and unsuspending are logged
    Given a Moderator and a plain Voter
    When the Moderator suspends the Voter
    And the Moderator unsuspends the Voter
    Then the log holds a suspend_voter and an unsuspend_voter entry naming the Moderator and the Voter

  Scenario: A plain Voter cannot suspend
    Given two plain Voters
    When the first Voter suspends the second
    Then the response is 403 and nothing is logged

  Scenario: Suspending an unknown Voter 404s
    Given a Moderator
    When the Moderator suspends an unknown Voter id
    Then the response is 404 and nothing is logged

  Scenario: A suspended Voter can still vote and edit their own Wars
    Given a suspended Voter who owns a draft War and has joined another Voter's published War
    When the suspended Voter votes and PATCHes their own War
    Then the vote is created and the PATCH succeeds

  Scenario: The kill switch wins over a suspension
    Given a Moderator and a suspended Voter and the kill switch on
    When the Voter POSTs a War
    Then the response is 503 war_creation_disabled
