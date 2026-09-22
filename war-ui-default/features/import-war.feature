Feature: Import a War

  Scenario: Selecting a valid export file creates a new draft and opens its Edit page
    Given an authenticated voter on the Import page
    When they choose a valid War export file
    Then a new draft War is created from it
    And they land on the new draft's Edit page

  Scenario: Selecting a file that is not a valid export shows an error and creates nothing
    Given an authenticated voter on the Import page
    When they choose a file that is not a valid War export
    Then an error is shown
    And no War is created
