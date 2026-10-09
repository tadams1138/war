Feature: Admin Dashboard Wars

  Scenario: The Wars list shows Wars of every status with removed and report markers
    Given Wars of every status exist, one removed and one with unaddressed reports
    When a Staff member opens the Admin Dashboard
    Then each War is listed with its title, status, and creator
    And the removed War is marked Removed
    And the War with unaddressed reports shows a report count badge
    And an untitled War shows a placeholder title

  Scenario: Filtering the Wars list by status
    Given the Wars list is shown
    When a Staff member picks the Removed status filter
    Then the list is requested with that status and shows the matching Wars

  Scenario: Searching the Wars list is debounced
    Given the Wars list is shown
    When a Staff member types a search term
    Then one request carrying the settled term is made and the matching Wars are shown

  Scenario: Load more appends the next page of Wars
    Given the Wars list has a further page
    When a Staff member chooses Load more in the Wars list
    Then the next page is requested with its cursor and appended
    And Load more is hidden once there is no next cursor

  Scenario: Opening a War shows its Staff detail with contestants and reports
    Given a published War with contestants and reports
    When a Staff member selects it in the Wars list
    Then they are taken to the War's Staff detail at "/admin/wars/:id"
    And its contestants are shown with their standings
    And its reports are shown with their explanation and addressed state

  Scenario: Marking a report addressed and unaddressed
    Given a War with an unaddressed report
    When a Staff member marks the report addressed
    Then the report is patched as addressed and shown as addressed
    When they mark it unaddressed
    Then the report is patched as unaddressed and shown as unaddressed

  Scenario: A failed report update shows an error and leaves the report unchanged
    Given a War with an unaddressed report and updating it will fail
    When a Staff member marks the report addressed
    Then an error is shown and the report is still unaddressed

  Scenario: Marking a report addressed when the report is gone says it no longer exists
    Given a War with an unaddressed report that no longer exists on the server
    When a Staff member marks the report addressed
    Then they are told the report doesn't exist, not that a War is missing
    And the report is still shown unaddressed

  Scenario: Removing a War requires confirmation
    Given a published War's Staff detail
    When a Staff member chooses Remove War
    Then an in-page confirmation explains the War is hidden and its media permanently deleted, and nothing is sent yet
    When they confirm
    Then the removal is requested, the detail is refetched and shows the War as Removed
    And the Remove War action is gone

  Scenario: Cancelling the removal confirmation does nothing
    Given a published War's Staff detail
    When a Staff member chooses Remove War and cancels
    Then no removal is requested and the War is unchanged

  Scenario: A failed removal shows an error
    Given a published War's Staff detail and removing it will fail
    When a Staff member chooses Remove War and confirms
    Then an error is shown and the War is not shown as removed

  Scenario: A removed War's detail offers no Remove action and requests no reports
    Given a removed War
    When a Staff member opens its Staff detail
    Then it is shown as Removed with no Remove War action
    And its reports were not requested

  Scenario: The unaddressed reports queue lists Wars and opens their detail
    Given Wars with unaddressed reports are waiting
    When a Staff member opens the Admin Dashboard
    Then each is listed with its title and unaddressed count
    When they select one
    Then that War's Staff detail is shown

  Scenario: The unaddressed reports queue shows an empty state
    Given no reports are waiting
    When a Staff member opens the Admin Dashboard
    Then the queue says nothing is waiting

  Scenario: A plain Voter cannot reach a War's Staff detail
    Given an authenticated voter who is neither a Moderator nor an Admin
    When they navigate to "/admin/wars/w-1"
    Then they are redirected to "/"
