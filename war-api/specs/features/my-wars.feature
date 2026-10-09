Feature: My Wars

  Scenario: A voter lists the Wars they created, across every status
    Given a voter has created a draft War, a published War, and a closed War
    And another voter has created a public published War
    When they GET /api/v1/wars?creator=me
    Then only the requester's three Wars are returned

  Scenario: creator=me combines with the status filter
    Given a voter has created a draft War and a published War
    And another voter has created a draft War
    When they GET /api/v1/wars?creator=me&status=draft
    Then only their own draft War is returned

  Scenario: An unauthenticated request for creator=me is rejected
    When an unauthenticated caller GETs /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A request for creator=me with an invalid or expired token is rejected
    When a caller bearing an invalid or expired JWT GETs /api/v1/wars?creator=me
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

  Scenario: creator=me filters by effective status before the close task runs
    Given a voter has created a published War whose end date passed a minute ago and has not yet been closed by the close task
    When they GET /api/v1/wars?creator=me&status=closed
    Then their expired War is returned as "closed"
    When they GET /api/v1/wars?creator=me&status=published
    Then their expired War is not returned

  Scenario: A voter's own draft whose end date has passed counts as closed
    Given a voter has created a draft War whose end date passed a minute ago
    When they GET /api/v1/wars?creator=me&status=closed
    Then their expired draft War is returned as "closed"
    When they GET /api/v1/wars?creator=me&status=draft
    Then their expired draft War is not returned
