Feature: War Lifecycle

  Scenario: Creator activates a War with enough contestants
    Given a War in "draft" status with 3 contestants, each with an image
    When the creator POSTs to /api/v1/wars/:id/activate
    Then the War status becomes "active"
    And exactly 3 matchups are generated

  Scenario: Cannot activate with fewer than 2 contestants
    Given a War in "draft" with 1 contestant
    When the creator POSTs to activate
    Then the response status is 422
    And the War remains "draft"

  Scenario: A contestant with no image can still activate
    Given a War in "draft" with 2 contestants, only one of which has an image
    When the creator POSTs to activate
    Then the War status becomes "active"

  Scenario: Cannot edit after activation
    Given a War in "active" status
    When the creator PATCHes the title
    Then the response status is 403

  Scenario: A creator changes a War's theme while it's still a draft
    Given a War in "draft" status
    When the creator PATCHes the theme to "fight_card"
    Then the response status is 200
    And the War's theme is "fight_card"

  Scenario: Non-creator cannot activate
    Given a War created by Voter A
    When Voter B POSTs to activate
    Then the response status is 403

  Scenario: A voter joins an active War
    Given an active War
    And an authenticated voter who has not joined
    When they POST to /api/v1/wars/:id/join
    Then a war_membership record is created for that voter and War

  Scenario: The browse list reports each War's contestant count
    Given a War with 3 contestants
    When anyone GETs /api/v1/wars
    Then that War's entry in the list has contestant_count 3

  Scenario: War detail reports ownership to its creator
    Given a War created by Voter A
    When Voter A GETs the War's detail, authenticated
    Then is_owner is true

  Scenario: War detail reports non-ownership to another voter
    Given a War created by Voter A
    When Voter B GETs the War's detail, authenticated
    Then is_owner is false

  Scenario: War detail reports non-ownership to an anonymous caller
    Given a War created by Voter A
    When anyone GETs the War's detail, unauthenticated
    Then is_owner is false

  Scenario: Creator deletes a draft War
    Given a War in "draft" status created by Voter A
    When Voter A DELETEs the War
    Then the response status is 204
    And the War no longer exists

  Scenario: Non-creator cannot delete a draft War
    Given a War created by Voter A
    When Voter B DELETEs the War
    Then the response status is 403

  Scenario: Cannot delete a War that has left draft
    Given a War in "active" status
    When the creator DELETEs the War
    Then the response status is 403
