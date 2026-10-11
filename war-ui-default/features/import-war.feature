@import-war
Feature: Import a War

  Scenario: Selecting a valid export file creates a new draft and opens its Edit page
    Given the API accepts an imported War
    And an authenticated voter
    And they are on the Import page
    When they choose a valid War export file
    Then a new draft War is created from it
    And they are redirected to that War's Edit page

  Scenario: Selecting a file that is not a valid export shows an error and creates nothing
    Given an authenticated voter
    And they are on the Import page
    When they choose a file that is not a valid War export
    Then an error is shown on the Import page
    And no War is created

  Scenario: Selecting a valid export file with a share image uploads it to the new draft
    Given the API accepts an imported War
    And the API accepts a share image upload
    And an authenticated voter
    And they are on the Import page
    When they choose a valid War export file that includes a share image
    Then a new draft War is created from it
    And they are redirected to that War's Edit page
    And the share image is uploaded to that War
