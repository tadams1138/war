Feature: War Lifecycle

  Scenario: Creator publishes a War with enough contestants
    Given a War in "draft" status with 3 contestants, each with an image
    When the creator POSTs to /api/v1/wars/:id/publish
    Then the War status becomes "published"

  Scenario: Matchups are generated as contestants are added, not at publish time
    Given a War in "draft" status with 3 contestants
    And the War already has exactly 3 matchups
    When the creator POSTs to /api/v1/wars/:id/publish
    Then the War still has exactly 3 matchups

  Scenario: Cannot publish with fewer than 2 contestants
    Given a War in "draft" with 1 contestant
    When the creator POSTs to publish
    Then the response status is 422
    And the War remains "draft"

  Scenario: A contestant with no image can still publish
    Given a War in "draft" with 2 contestants, only one of which has an image
    When the creator POSTs to publish
    Then the War status becomes "published"

  Scenario: Non-creator cannot publish
    Given a War created by Voter A
    When Voter B POSTs to publish
    Then the response status is 403

  Scenario: Unpublishing returns a published War to draft
    Given a published War
    When the creator POSTs to /api/v1/wars/:id/unpublish
    Then the War status becomes "draft"

  Scenario: Unpublishing touches no matchup, vote, or contestant
    Given a published War with 3 contestants
    When the creator POSTs to /api/v1/wars/:id/unpublish
    Then the War still has exactly 3 matchups

  Scenario: A War can be republished after being unpublished
    Given a War that was published and then unpublished
    When the creator POSTs to /api/v1/wars/:id/publish
    Then the War status becomes "published"

  Scenario: A closed War cannot be published
    Given a closed War
    When the creator POSTs to publish
    Then the response status is 422
    And the War remains "closed"

  Scenario: A closed War cannot be unpublished
    Given a closed War
    When the creator POSTs to /api/v1/wars/:id/unpublish
    Then the response status is 422
    And the War remains "closed"

  Scenario: A War remains editable after publishing
    Given a published War
    When the creator PATCHes the title
    Then the response status is 200

  Scenario: A creator changes a War's theme while it's still a draft
    Given a War in "draft" status
    When the creator PATCHes the theme to "fight_card"
    Then the response status is 200
    And the War's theme is "fight_card"

  Scenario: A voter joins a published War
    Given a published War
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
    Given a published War created by Voter A
    When Voter B GETs the War's detail, authenticated
    Then is_owner is false

  Scenario: War detail reports non-ownership to an anonymous caller
    Given a published War created by Voter A
    When anyone GETs the War's detail, unauthenticated
    Then is_owner is false

  Scenario: A non-owner cannot see an unpublished War at all
    Given a War in "draft" status created by Voter A
    When Voter B GETs the War's detail, authenticated
    Then the response status is 404

  Scenario: The creator can always see their own War, in any status
    Given a War in "draft" status created by Voter A
    When Voter A GETs the War's detail, authenticated
    Then the response status is 200

  Scenario: Creator deletes a draft War
    Given a War in "draft" status created by Voter A
    When Voter A DELETEs the War
    Then the response status is 204
    And the War no longer exists

  Scenario: Non-creator cannot delete a draft War
    Given a War created by Voter A
    When Voter B DELETEs the War
    Then the response status is 403

  Scenario: Deleting a published War cascades its contestants, matchups, and votes
    Given a published War with 2 contestants and a vote cast on their matchup
    When the creator DELETEs the War
    Then the response status is 204
    And the War no longer exists
    And its contestants no longer exist
    And its matchups no longer exist
    And its votes no longer exist

  Scenario: Adding a contestant generates matchups against the existing roster
    Given a published War with 2 contestants
    When the creator adds a third contestant
    Then the War has exactly 3 matchups

  Scenario: Removing a contestant with no votes just removes it
    Given a War with 3 contestants and no votes cast
    When the creator removes one of the contestants
    Then that contestant no longer exists
    And the War has exactly 1 matchup

  Scenario: Removing a contestant with votes clears only that contestant's own votes
    Given a published War with 3 contestants where every matchup has a vote cast
    When the creator removes one of the contestants
    Then the votes on that contestant's own matchups no longer exist
    And the vote on the remaining matchup still exists
    And the surviving contestants' counters reflect only the remaining vote

  Scenario: Clear Votes deletes every vote and resets every contestant's counters
    Given a published War with 3 contestants where every matchup has a vote cast
    When the creator POSTs to /api/v1/wars/:id/clear-votes
    Then no votes remain in the War
    And every contestant's win and appearance counters are zero

  Scenario: Clear Votes works on a War that isn't published
    Given a War in "draft" status with 3 contestants where every matchup has a vote cast
    When the creator POSTs to /api/v1/wars/:id/clear-votes
    Then no votes remain in the War

  Scenario: Non-creator cannot clear votes
    Given a published War created by Voter A
    When Voter B POSTs to /api/v1/wars/:id/clear-votes
    Then the response status is 403
