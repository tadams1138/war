Feature: War Lifecycle Tools

  create_war, update_war, activate_war, and close_war are thin wrappers over
  war-api-spec.md §7.2. Every rule they appear to enforce (ownership, draft-only,
  minimum contestants) is the API's own — these scenarios pin that war-mcp relays the
  request and the API's answer, and never decides these questions itself (spec §2.1).

  Scenario: create_war sends only the fields supplied
    Given a valid cached credential
    When create_war is called with only a title
    Then a POST /api/v1/wars request is made whose body contains no media_mode field
    And the created War's fields are returned as the API reported them

  Scenario: create_war surfaces a validation failure verbatim
    Given a valid cached credential
    And the War API rejects POST /api/v1/wars with 422 and a message about the title
    When create_war is called with an empty title
    Then the result reports that same 422 message
    And no War is treated as created

  Scenario: update_war omits fields that were not supplied
    Given a valid cached credential
    And a draft War the authenticated voter created
    When update_war is called with only a new category
    Then the PATCH /api/v1/wars/:id request body contains only the category field

  Scenario: update_war on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a draft War created by Voter A
    When Voter B calls update_war on Voter A's War
    Then a PATCH /api/v1/wars/:id request is made bearing Voter B's token
    And the result reports the API's 403

  Scenario: activate_war surfaces the API's activation rules
    Given a valid cached credential
    And a draft War with only one contestant
    When activate_war is called for that War
    Then the result reports the API's 422 for too few contestants
    And the War remains in draft status

  Scenario: close_war closes an active War the caller owns
    Given a valid cached credential
    And an active War the authenticated voter created
    When close_war is called for that War
    Then a POST /api/v1/wars/:id/close request is made
    And the result reports the War's closed status

  Scenario: close_war on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And an active War created by Voter A
    When Voter B calls close_war on Voter A's War
    Then a POST /api/v1/wars/:id/close request is made bearing Voter B's token
    And the result reports the API's 403
