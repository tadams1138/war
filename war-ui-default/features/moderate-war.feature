@moderate-war
Feature: Moderating a War

  A Moderator moderates a War on its detail page (war-spec.md §6.7, §10.4): the
  page everyone sees, plus the War's reports and a Remove control.

  Scenario: A Moderator sees a War's reports and the Remove control on its detail page
    Given a published War
    And that War has these reports:
      | explanation     | state       |
      | Spam in the bio | unaddressed |
      | Offensive image | addressed   |
    And an authenticated Moderator
    When they open that War's detail page
    Then its reports are shown with their explanation and addressed state
    And the "Remove War" button is shown

  Scenario: A plain Voter sees no reports and no Remove control
    Given a published War
    And that War has an unaddressed report
    And an authenticated voter
    When they open that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the "Remove War" button is hidden
    And that War's reports were requested 0 times

  Scenario: Marking a report addressed
    Given a published War
    And that War has an unaddressed report
    And the API accepts changes to that War's reports
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Mark addressed" button
    Then the API has been asked to mark the report addressed
    And the report is shown as addressed
    And the "Mark unaddressed" button is hidden

  Scenario: A failed report update shows an error and leaves the report unchanged
    Given a published War
    And that War has an unaddressed report
    And changing that War's reports fails with a server error
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Mark addressed" button
    Then the message "Server error — please try again shortly" is shown
    And the report is shown as unaddressed

  Scenario: Marking a report addressed when the report is gone says it no longer exists
    Given a published War
    And that War has an unaddressed report
    And changing that War's reports finds no such report
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Mark addressed" button
    Then the message "This report doesn't exist" is shown
    And the report is shown as unaddressed

  Scenario: Removing a War requires confirmation
    Given a published War
    And the voter has voted on 1 of 3 matchups in that War
    And the API accepts a request to remove that War
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Remove War" button
    Then a confirmation is shown
    And the confirmation says "hides it from everyone and permanently deletes its media"
    And the API has not been asked to remove that War
    And the "Vote" link is shown
    When they confirm
    Then the API has been asked to remove that War
    And the War is shown as Removed
    And no confirmation is shown
    And the "Remove War" button is hidden
    And the "Vote" link is hidden

  Scenario: Cancelling the removal confirmation does nothing
    Given a published War
    And the API accepts a request to remove that War
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Remove War" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to remove that War
    And the War is not shown as Removed
    And the "Remove War" button is shown

  Scenario: A failed removal shows an error
    Given a published War
    And the target of a request to remove that War does not exist
    And an authenticated Moderator
    And they are on that War's detail page
    When they select the "Remove War" button
    And they confirm
    Then the message "This War doesn't exist or has been removed" is shown
    And the War is not shown as Removed

  Scenario: A removed War is shown as Removed, with no Remove, Vote or owner controls
    Given a removed War
    And the voter has voted on 1 of 3 matchups in that War
    And an authenticated Moderator
    When they open that War's detail page
    Then the War is shown as Removed
    And the "Remove War" button is hidden
    And the "Vote" link is hidden
    And the "Edit" link is hidden
    And that War's reports were requested 0 times
