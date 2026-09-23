Feature: Share Image

  Scenario: Uploading a share image doesn't take effect until Save is clicked
    Given an authenticated voter editing a draft War
    When they choose a file for the share image
    Then no upload has happened yet
    When they click Save
    Then the share image is uploaded

  Scenario: Generating a share image doesn't take effect until Save is clicked, and can be re-rolled
    Given an authenticated voter editing a draft War with two contestants who each have an image
    When they generate a share image
    Then a preview is shown and no upload has happened yet
    When they generate again
    Then a fresh preview is shown, still with no upload
    When they click Save
    Then the share image is uploaded

  Scenario: Generating is unavailable with fewer than two qualifying contestants
    Given an authenticated voter editing a draft War with only one contestant who has an image
    Then the generate control is disabled
    And an explanation is shown

  Scenario: A War card shows its share image when the War has one
    Given a War with a share image
    When its card is shown
    Then the card displays that image

  Scenario: A War card shows no image slot when the War has none
    Given a War with no share image
    When its card is shown
    Then the card has no image slot
