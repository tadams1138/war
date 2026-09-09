Feature: Listing and Lookup Tools

  list_my_wars mirrors war-api-spec.md §7.2's creator=me semantics exactly, including its
  default scope (every status, once authenticated as the owner). get_war mirrors
  GET /wars/:id exactly, including that endpoint's lack of a visibility restriction
  (spec §5.2) — war-mcp adds no restriction of its own in either direction.

  Scenario: list_my_wars with no arguments returns every status, including drafts
    Given a valid cached credential
    And the authenticated voter has created a draft War, an active War, and a closed War
    When list_my_wars is called with no arguments
    Then a GET /api/v1/wars?creator=me request is made
    And all three Wars are returned

  Scenario: list_my_wars does not return another voter's Wars
    Given a valid cached credential
    And the authenticated voter has created no Wars
    And another voter has created an active public War
    When list_my_wars is called with no arguments
    Then a GET /api/v1/wars?creator=me request is made
    And the other voter's War is not among the results

  Scenario: list_my_wars combines with the status filter
    Given a valid cached credential
    And the authenticated voter has created a draft War and an active War
    When list_my_wars is called with status "draft"
    Then a GET /api/v1/wars?creator=me&status=draft request is made
    And only the draft War is returned

  Scenario: get_war returns a War by id with no ownership check applied
    Given a valid cached credential
    And a draft War created by a different voter
    When get_war is called with that War's id
    Then a GET /api/v1/wars/:id request is made
    And the War's detail is returned

  Scenario: get_war reports a not-found War as the API reports it
    Given a valid cached credential
    And no War exists with a given id
    When get_war is called with that id
    Then the result reports the API's 404
