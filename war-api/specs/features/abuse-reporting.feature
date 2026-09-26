Feature: Abuse reporting

  Scenario: Any authenticated Voter can report a War
    Given an authenticated Voter and a War created by someone else
    When they POST an explanation to that War's reports
    Then the response status is 201
    And the response carries the explanation and the reporter's id
    And the report's addressed state is false

  Scenario: A Voter may report the same War more than once
    Given an authenticated Voter and a War
    When they POST two different explanations to that War's reports
    Then both requests succeed
    And two separate reports exist against that War

  Scenario: An empty explanation is rejected
    Given an authenticated Voter and a War
    When they POST an empty-string explanation to that War's reports
    Then the response status is 422
    And no report is created

  Scenario: Reporting a nonexistent War 404s
    Given an authenticated Voter
    When they POST an explanation to a nonexistent War's reports
    Then the response status is 404

  Scenario: An unauthenticated request cannot file a report
    Given a request with no Authorization header
    When they POST an explanation to a War's reports
    Then the response status is 401

  Scenario: A Moderator lists every report against a War
    Given a War with two reports against it and a Moderator
    When the Moderator GETs that War's reports
    Then the response status is 200
    And both reports are listed, newest first

  Scenario: The War's own creator cannot see its reports
    Given a War with a report against it
    When its creator GETs that War's reports
    Then the response status is 403

  Scenario: A plain Voter cannot list reports for a War
    Given a War with a report against it and a plain Voter
    When the plain Voter GETs that War's reports
    Then the response status is 403

  Scenario: A Moderator sees only Wars with unaddressed reports
    Given one War with an unaddressed report and another whose only report is addressed
    When the Moderator GETs the unaddressed-reports queue
    Then the response status is 200
    And only the War with the unaddressed report is listed

  Scenario: An Admin without the Moderator flag can also read the queue
    Given an Admin and a War with an unaddressed report
    When the Admin GETs the unaddressed-reports queue
    Then the response status is 200

  Scenario: A plain Voter cannot read the queue
    Given a plain Voter
    When the plain Voter GETs the unaddressed-reports queue
    Then the response status is 403

  Scenario: A Moderator marks a report addressed
    Given a Moderator and an unaddressed report
    When the Moderator PATCHes that report's addressed state to true
    Then the response status is 200
    And the report's addressed state is now true

  Scenario: A Moderator reopens a report addressed in error
    Given a Moderator and a report already marked addressed
    When the Moderator PATCHes that report's addressed state to false
    Then the response status is 200
    And the report's addressed state is now false

  Scenario: A plain Voter cannot change a report's addressed state
    Given a plain Voter and an unaddressed report
    When the plain Voter PATCHes that report's addressed state to true
    Then the response status is 403

  Scenario: Addressing a nonexistent report 404s
    Given a Moderator
    When the Moderator PATCHes a nonexistent report's addressed state to true
    Then the response status is 404
