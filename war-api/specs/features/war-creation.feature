Feature: War Creation

  Scenario: An authenticated voter creates a War
    Given an authenticated voter
    When they POST a title to /api/v1/wars
    Then a new War is created in "draft" status
    And its visibility defaults to "public"

  Scenario: A title is optional
    Given an authenticated voter
    When they POST to /api/v1/wars with no title
    Then a new War is created in "draft" status
    And its title is null

  Scenario: An empty-string title is rejected
    Given an authenticated voter
    When they POST to /api/v1/wars with an empty-string title
    Then the response status is 422
    And no War is created

  Scenario: An unauthenticated request cannot create a War
    Given a request with no Authorization header
    When they POST to /api/v1/wars
    Then the response status is 401

  Scenario: A War's theme defaults to "arcade"
    Given an authenticated voter
    When they POST a title to /api/v1/wars
    Then a new War is created in "draft" status
    And its theme defaults to "arcade"

  Scenario: A creator sets a War's theme at creation
    Given an authenticated voter
    When they POST a title and theme "fight_card" to /api/v1/wars
    Then a new War is created in "draft" status
    And its theme is "fight_card"

  Scenario: An invalid theme is rejected
    Given an authenticated voter
    When they POST a title and theme "neon" to /api/v1/wars
    Then the response status is 422
    And no War is created

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

  Scenario: A contestant can be added even once the War is published
    Given a published War
    When its creator POSTs a new contestant
    Then the contestant is created

  Scenario: contestant_schema and attributes are no longer recognized fields
    Given an authenticated voter
    When they create a War with a contestant_schema and add a contestant with attributes
    Then the created War has no contestant_schema field
    And the created contestant has no attributes field
