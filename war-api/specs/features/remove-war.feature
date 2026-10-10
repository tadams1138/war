Feature: Remove a War

  Scenario: A Moderator removes a published War and it becomes not found for everyone
    Given a published War, its creator, a plain Voter and a Moderator
    When the Moderator removes the War
    Then the response is 204 and the War is 404 for its creator, the plain Voter and the Moderator

  Scenario: A removed War is absent from the public list and from its creator's own list
    Given a published War and a Moderator
    When the Moderator removes the War
    Then the War is absent from GET /wars and from its creator's own list

  Scenario: The creator cannot delete, edit or publish a removed War and its rows persist
    Given a removed published War with votes
    When the creator DELETEs, PATCHes and publishes the War
    Then all three responses are 404 and the War, its contestants, matchups and votes still exist

  Scenario: A plain Voter, including the War's creator, cannot remove a War
    Given a published War, its creator and a plain Voter
    When the creator and the plain Voter each try to remove the War
    Then both responses are 403, the War is still visible and no moderation log entry exists

  Scenario: Removing a War writes a remove_war moderation log entry
    Given a published War and a Moderator
    When the Moderator removes the War
    Then a moderation log entry records the Moderator removing the War

  Scenario: Removing a nonexistent or already removed War is 404 and logs nothing further
    Given a published War and a Moderator
    When the Moderator removes the War twice and removes a War that never existed
    Then the first response is 204, the other two are 404 and exactly one moderation log entry exists

  Scenario: A removed War's reports are excluded from the unaddressed queue
    Given a published War with an unaddressed report and a Moderator
    When the Moderator removes the War
    Then the unaddressed reports queue is empty

  Scenario: Voting on a matchup of a removed War is rejected
    Given a published War with a matchup and a Moderator
    When the Moderator removes the War and a Voter votes on its matchup
    Then the vote response is 404 and no vote exists

  Scenario: Removing a War hard-deletes its media but leaves another War's media untouched
    Given a War about to be removed with contestant images and a share image, another War with images, and a Moderator
    When the Moderator removes the first War
    Then its stored objects and contestant_media rows are gone, its share image key is cleared, and the other War's media remains

  Scenario: A storage failure while deleting media still removes the War
    Given a published War, a Moderator and storage that fails to delete
    When the Moderator removes the War
    Then the response is 204 and the War stays removed
