Feature: War Creation

  Scenario: An authenticated voter creates a War
    Given an authenticated voter
    When they POST a title to /api/v1/wars
    Then a new War is created in "draft" status
    And its visibility defaults to "public"

  Scenario: A title is required
    Given an authenticated voter
    When they POST to /api/v1/wars with no title
    Then the response status is 422
    And no War is created

  Scenario: An unauthenticated request cannot create a War
    Given a request with no Authorization header
    When they POST to /api/v1/wars
    Then the response status is 401

  Scenario: The creator adds a contestant to their draft War
    Given a draft War created by the requester
    When they POST a name to /api/v1/wars/:id/contestants
    Then the contestant is created
    And it appears in the War's contestant list

  Scenario: A contestant name is required
    Given a draft War created by the requester
    When they POST to /api/v1/wars/:id/contestants with no name
    Then the response status is 422
    And no contestant is created

  Scenario: A non-creator cannot add a contestant
    Given a War created by Voter A
    When Voter B POSTs a contestant to it
    Then the response status is 403

  Scenario: A contestant cannot be added once the War is active
    Given an active War
    When its creator POSTs a new contestant
    Then the response status is 403
