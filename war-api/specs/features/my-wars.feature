Feature: My Wars

  Scenario: A voter lists the Wars they created, across every status
    Given a voter has created a draft War, an active War, and a closed War
    And another voter has created a public active War
    When they GET /api/v1/wars?creator=me
    Then only the requester's three Wars are returned

  Scenario: creator=me combines with the status filter
    Given a voter has created a draft War and an active War
    When they GET /api/v1/wars?creator=me&status=draft
    Then only their draft War is returned

  Scenario: An unauthenticated request for creator=me is rejected
    Given a request with no Authorization header
    When they GET /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A voter's own invite-only or draft Wars are included
    Given a voter has created a draft, invite-only War
    When they GET /api/v1/wars?creator=me
    Then that War is included in the results
