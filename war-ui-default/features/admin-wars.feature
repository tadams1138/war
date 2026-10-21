@admin-wars
Feature: Admin Dashboard Wars

  Scenario: The Wars list shows Wars of every status with removed and report markers
    # A War with no title is untitled.
    Given the API lists these Wars to Moderators:
      | title         | status    | creator       | unaddressed reports | removed |
      | Draft War     | draft     | Casey Creator | 0                   |         |
      | Published War | published | Pat Poster    | 3                   |         |
      | Closed War    | closed    | Casey Creator | 0                   |         |
      | Gone War      | published | Casey Creator | 0                   | yes     |
      |               | draft     | Casey Creator | 0                   |         |
    And an authenticated Moderator
    When they open the Admin Dashboard
    Then the Wars list shows these Wars, in order:
      | title         | status    | creator       | report badge | marker  |
      | Draft War     | draft     | Casey Creator |              |         |
      | Published War | published | Pat Poster    | 3            |         |
      | Closed War    | closed    | Casey Creator |              |         |
      | Gone War      | published | Casey Creator |              | Removed |
      | Untitled War  | draft     | Casey Creator |              |         |

  Scenario: Filtering the Wars list by status
    Given the API lists these Wars to Moderators:
      | title     | removed |
      | Alpha War |         |
      | Beta War  | yes     |
    And an authenticated Moderator
    And they are on the Admin Dashboard
    When they filter the Wars list by "Removed"
    Then the Wars list shows only "Beta War"
    And the Wars list was last requested for the "Removed" filter

  Scenario: Searching the Wars list is debounced
    Given the API lists these Wars to Moderators:
      | title     |
      | Alpha War |
      | Beta War  |
    And an authenticated Moderator
    And they are on the Admin Dashboard
    When they search the Wars list for "beta"
    Then the Wars list shows only "Beta War"
    And the Wars list was searched exactly once, for "beta"

  Scenario: Load more appends the next page of Wars
    Given the API lists these Wars to Moderators, 1 per page:
      | title     |
      | Alpha War |
      | Beta War  |
    And an authenticated Moderator
    And they are on the Admin Dashboard
    Then the Wars list shows only "Alpha War"
    When they select the "Load more" button
    Then the Wars list shows, in order:
      | Alpha War |
      | Beta War  |
    And the next page of the Wars list was requested from where the first page ended
    And the "Load more" button is hidden

  Scenario: Opening a War from the Wars list shows its detail page
    Given the API lists a published War titled "Alpha War" to Moderators
    And an authenticated Moderator
    And they are on the Admin Dashboard
    When they select "Alpha War" in the Wars list
    Then that War's detail page is shown
    And the heading "Alpha War" is shown

  Scenario: The unaddressed reports queue lists Wars and opens their detail
    Given the API lists these Wars to Moderators:
      | title     | unaddressed reports |
      | Alpha War | 4                   |
      |           | 1                   |
    And an authenticated Moderator
    When they open the Admin Dashboard
    Then the unaddressed reports queue lists:
      | title        | unaddressed reports |
      | Alpha War    | 4                   |
      | Untitled War | 1                   |
    When they select "Alpha War" in the unaddressed reports queue
    Then the first War's detail page is shown
    And the heading "Alpha War" is shown

  Scenario: The unaddressed reports queue shows an empty state
    Given no reports are waiting
    And an authenticated Moderator
    When they open the Admin Dashboard
    Then the unaddressed reports queue says nothing is waiting
