@admin-wars
Feature: Admin Dashboard Wars

  Scenario: The Wars list shows Wars of every status with removed and report markers
    # A War with no title is untitled.
    Given the API lists these Wars to Staff:
      | title         | status    | creator       | unaddressed reports | removed |
      | Draft War     | draft     | Casey Creator | 0                   |         |
      | Published War | published | Pat Poster    | 3                   |         |
      | Closed War    | closed    | Casey Creator | 0                   |         |
      | Gone War      | published | Casey Creator | 0                   | yes     |
      |               | draft     | Casey Creator | 0                   |         |
    And an authenticated Staff member
    When they open the Admin Dashboard
    Then the Wars list shows these Wars, in order:
      | title         | status    | creator       | report badge | marker  |
      | Draft War     | draft     | Casey Creator |              |         |
      | Published War | published | Pat Poster    | 3            |         |
      | Closed War    | closed    | Casey Creator |              |         |
      | Gone War      | published | Casey Creator |              | Removed |
      | Untitled War  | draft     | Casey Creator |              |         |

  Scenario: Filtering the Wars list by status
    Given the API lists these Wars to Staff:
      | title     | removed |
      | Alpha War |         |
      | Beta War  | yes     |
    And an authenticated Staff member
    And they are on the Admin Dashboard
    When they filter the Wars list by "Removed"
    Then the Wars list shows only "Beta War"
    And the Wars list was last requested for the "Removed" filter

  Scenario: Searching the Wars list is debounced
    Given the API lists these Wars to Staff:
      | title     |
      | Alpha War |
      | Beta War  |
    And an authenticated Staff member
    And they are on the Admin Dashboard
    When they search the Wars list for "beta"
    Then the Wars list shows only "Beta War"
    And the Wars list was searched exactly once, for "beta"

  Scenario: Load more appends the next page of Wars
    Given the API lists these Wars to Staff, 1 per page:
      | title     |
      | Alpha War |
      | Beta War  |
    And an authenticated Staff member
    And they are on the Admin Dashboard
    Then the Wars list shows only "Alpha War"
    When they select the "Load more" button
    Then the Wars list shows, in order:
      | Alpha War |
      | Beta War  |
    And the next page of the Wars list was requested from where the first page ended
    And the "Load more" button is hidden

  Scenario: Opening a War shows its Staff detail with contestants and reports
    Given a published War titled "Alpha War"
    And that War has these contestants:
      | name   | wins | appearances |
      | Rocky  | 7    | 10          |
      | Apollo | 3    | 10          |
    And that War has these reports:
      | explanation     | state       |
      | Spam in the bio | unaddressed |
      | Offensive image | addressed   |
    And an authenticated Staff member
    And they are on the Admin Dashboard
    When they select "Alpha War" in the Wars list
    Then that War's Staff detail page is shown
    And the heading "Alpha War" is shown
    And its contestants are shown with their standings
    And its reports are shown with their explanation and addressed state

  Scenario: Marking a report addressed and unaddressed
    Given a published War
    And that War has an unaddressed report
    And the API accepts changes to that War's reports
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Mark addressed" button
    Then the API has been asked to mark the report addressed
    And the report is shown as addressed
    When they select the "Mark unaddressed" button
    Then the API has been asked to mark the report unaddressed
    And the report is shown as unaddressed

  Scenario: A failed report update shows an error and leaves the report unchanged
    Given a published War
    And that War has an unaddressed report
    And changing that War's reports fails with a server error
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Mark addressed" button
    Then the message "Server error — please try again shortly" is shown
    And the report is shown as unaddressed

  Scenario: Marking a report addressed when the report is gone says it no longer exists
    Given a published War
    And that War has an unaddressed report
    And changing that War's reports finds no such report
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Mark addressed" button
    Then the message "This report doesn't exist" is shown
    And the report is shown as unaddressed

  Scenario: Removing a War requires confirmation
    Given a published War
    And the API accepts a request to remove that War
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Remove War" button
    Then a confirmation is shown
    And the confirmation says "hides it from everyone and permanently deletes its media"
    And the API has not been asked to remove that War
    When they confirm
    Then the API has been asked to remove that War
    And that War's Staff detail was requested 2 times
    And the War is shown as Removed
    And no confirmation is shown
    And the "Remove War" button is hidden

  Scenario: Cancelling the removal confirmation does nothing
    Given a published War
    And the API accepts a request to remove that War
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Remove War" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to remove that War
    And the War is not shown as Removed
    And the "Remove War" button is shown

  Scenario: A failed removal shows an error
    Given a published War
    And the target of a request to remove that War does not exist
    And an authenticated Staff member
    And they are on that War's Staff detail page
    When they select the "Remove War" button
    And they confirm
    Then the message "This War doesn't exist or has been removed" is shown
    And the War is not shown as Removed

  Scenario: A removed War's detail offers no Remove action and requests no reports
    Given a removed War
    And an authenticated Staff member
    When they open that War's Staff detail page
    Then the War is shown as Removed
    And its contestants are shown with their standings
    And the "Remove War" button is hidden
    And that War's reports were requested 0 times

  Scenario: The unaddressed reports queue lists Wars and opens their detail
    Given the API lists these Wars to Staff:
      | title     | unaddressed reports |
      | Alpha War | 4                   |
      |           | 1                   |
    And an authenticated Staff member
    When they open the Admin Dashboard
    Then the unaddressed reports queue lists:
      | title        | unaddressed reports |
      | Alpha War    | 4                   |
      | Untitled War | 1                   |
    When they select "Alpha War" in the unaddressed reports queue
    Then the first War's Staff detail page is shown
    And the heading "Alpha War" is shown

  Scenario: The unaddressed reports queue shows an empty state
    Given no reports are waiting
    And an authenticated Staff member
    When they open the Admin Dashboard
    Then the unaddressed reports queue says nothing is waiting

  Scenario: A plain Voter cannot reach a War's Staff detail
    Given a published War
    And an authenticated voter
    When they open that War's Staff detail page
    Then they are redirected to Home
    And no Staff detail is shown
