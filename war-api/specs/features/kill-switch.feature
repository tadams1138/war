Feature: War-creation kill switch

  Scenario: The kill switch defaults to off
    Given a Moderator
    When the Moderator GETs the kill switch
    Then the response is 200 and the kill switch is off

  Scenario: A plain Voter cannot create a War while the kill switch is on
    Given an Admin and a plain Voter
    When the Admin enables the kill switch
    And the plain Voter POSTs a War
    Then the response is 503 war_creation_disabled and no War exists

  Scenario: Staff cannot create a War while the kill switch is on
    Given an Admin
    When the Admin enables the kill switch
    And the Admin POSTs a War
    Then the response is 503 war_creation_disabled and no War exists

  Scenario: Disabling the kill switch restores War creation
    Given an Admin and a plain Voter
    When the Admin enables the kill switch
    And the Admin disables the kill switch
    And the plain Voter POSTs a War
    Then the response is 201 and one War exists

  Scenario: A Moderator can toggle the kill switch
    Given a Moderator
    When the Moderator enables the kill switch
    And the Moderator GETs the kill switch
    Then the response is 200 and the kill switch is on

  Scenario: A plain Voter can neither read nor change the kill switch
    Given a Moderator and a plain Voter
    When the Moderator enables the kill switch
    And the plain Voter GETs the kill switch
    And the plain Voter disables the kill switch
    Then both of the plain Voter's responses are 403 and the kill switch is still on

  Scenario: Enabling the kill switch writes a moderation log entry
    Given an Admin
    When the Admin enables the kill switch
    Then a moderation log entry records the Admin enabling the kill switch with no target

  Scenario: Disabling the kill switch writes a moderation log entry
    Given a Moderator
    When the Moderator enables the kill switch
    And the Moderator disables the kill switch
    Then a moderation log entry records the Moderator disabling the kill switch with no target

  Scenario: A refused change writes no moderation log entry
    Given a plain Voter
    When the plain Voter enables the kill switch
    Then the response is 403 and no moderation log entry exists

  Scenario: A malformed change is rejected and writes no moderation log entry
    Given a Moderator
    When the Moderator PUTs a kill switch body without enabled
    Then the response is 400 and no moderation log entry exists
