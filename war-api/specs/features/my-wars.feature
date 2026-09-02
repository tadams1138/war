Feature: My Wars

  Scenario: A voter lists the Wars they created, across every status
    Given a voter has created a draft War, an active War, and a closed War
    And another voter has created a public active War
    When they GET /api/v1/wars?creator=me
    Then only the requester's three Wars are returned

  Scenario: creator=me combines with the status filter
    Given a voter has created a draft War and an active War
    And another voter has created a draft War
    When they GET /api/v1/wars?creator=me&status=draft
    Then only their own draft War is returned

  Scenario: An unauthenticated request for creator=me is rejected
    Given a request with no Authorization header
    When they GET /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A request for creator=me with an invalid or expired token is rejected
    Given a request bearing an invalid or expired JWT
    When they GET /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A voter's own invite-only or draft Wars are included, and another voter's are not
    Given a voter has created a draft, invite-only War
    And another voter has created a draft, invite-only War
    When they GET /api/v1/wars?creator=me
    Then their own invite-only draft War is returned
    And the other voter's is not

  Scenario: A creator value other than "me" is rejected
    When they GET /api/v1/wars?creator=someone-else
    Then the response status is 400
    And the response is Fastify's own validation-error envelope, not this API's "error" shape
