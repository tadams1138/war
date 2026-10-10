@share-image
Feature: Share Image

  Scenario: Uploading a share image doesn't take effect until Save is clicked
    Given a draft War with 0 contestants with an image
    And the API accepts a share image upload
    And an authenticated voter
    When they open that War's Edit page
    And they choose a share image file
    Then a share image preview is shown
    And no share image has been uploaded
    When they click Save
    Then the share image is uploaded to that War

  Scenario: Generating a share image doesn't take effect until Save is clicked, and can be re-rolled
    Given a draft War with 2 contestants with an image
    And the API accepts a share image upload
    And an authenticated voter
    When they open that War's Edit page
    And they generate a share image
    Then a share image preview is shown
    And no share image has been uploaded
    When they generate a share image again
    Then a fresh share image preview is shown
    And no share image has been uploaded
    When they click Save
    Then the share image is uploaded to that War

  Scenario: Generate is disabled with an explanation when fewer than two contestants have an image
    Given a draft War with 1 contestant with an image
    And an authenticated voter
    When they open that War's Edit page
    Then the generate control is disabled
    And an explanation is shown

  Scenario: A War card shows its share image when the War has one
    Given the API lists these Wars:
      | title     | status | share image                        |
      | Has Image | draft  | https://cdn.example.test/share.jpg |
    And an authenticated voter
    When they open My Wars
    Then the "Has Image" card displays the image "https://cdn.example.test/share.jpg"

  Scenario: A War card shows no image slot when the War has none
    Given the API lists these Wars:
      | title    | status |
      | No Image | draft  |
    And an authenticated voter
    When they open My Wars
    Then the "No Image" card has no image slot
