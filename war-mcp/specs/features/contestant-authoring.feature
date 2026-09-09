Feature: Contestant Tools

  add_contestant and update_contestant are thin wrappers over war-api-spec.md §7.3.
  Attribute validation against a War's contestant_schema, draft-only and creator-only
  gating, and their failure responses are the API's; these scenarios pin only that
  war-mcp relays them.

  Scenario: add_contestant adds a contestant to the caller's own draft War
    Given a valid cached credential
    And a draft War the authenticated voter created
    When add_contestant is called with a name
    Then a POST /api/v1/wars/:id/contestants request is made
    And the created contestant is returned

  Scenario: add_contestant rejects an attribute the War's schema does not declare
    Given a valid cached credential
    And a draft War with a contestant_schema that does not declare "country"
    And the War API rejects the request with 422 for the unknown attribute
    When add_contestant is called with a "country" attribute
    Then the result reports that same 422 message
    And no contestant is treated as created

  Scenario: add_contestant on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a draft War created by Voter A
    When Voter B calls add_contestant on Voter A's War
    Then a POST /api/v1/wars/:id/contestants request is made bearing Voter B's token
    And the result reports the API's 403

  Scenario: update_contestant edits an existing contestant's fields
    Given a valid cached credential
    And a draft War the authenticated voter created with an existing contestant
    When update_contestant is called with a new bio
    Then a PATCH /api/v1/wars/:id/contestants/:cId request body contains only the bio field
    And the updated contestant is returned

  Scenario: update_contestant on a War that is no longer draft is rejected
    Given a valid cached credential
    And an active War the authenticated voter created with an existing contestant
    When update_contestant is called for that contestant
    Then a PATCH request is made to the API
    And the result reports the API's 403
