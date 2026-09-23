Feature: Share Image

  Scenario: Uploading a share image stores it and returns its URL
    Given a draft War owned by its creator
    When the creator uploads a share image
    Then the response includes a share_image_url
    And the image is stored as a JPEG exactly 1200 by 630

  Scenario: An oversized or oddly-shaped upload is center-cropped, not rejected
    Given a draft War owned by its creator
    When the creator uploads a 3000 by 900 image as the share image
    Then the response status is 200
    And the stored image is exactly 1200 by 630

  Scenario: The original is retained privately
    Given a draft War owned by its creator
    When the creator uploads a share image
    Then the original is retained in a private prefix

  Scenario: Uploading a share image replaces the previous one
    Given a draft War that already has a share image
    When the creator uploads a new share image
    Then the War's share_image_url points at the new image

  Scenario: No file is rejected
    Given a draft War owned by its creator
    When the creator submits the share image upload with no file
    Then the response status is 422

  Scenario: Only the creator may set a War's share image
    Given a draft War owned by another voter
    When a voter who is not its creator uploads a share image
    Then the response status is 403

  Scenario: A War that has left draft cannot have its share image changed
    Given an active War owned by its creator
    When the creator uploads a share image
    Then the response status is 403

  Scenario: A War with no share image has none in its response
    Given a draft War with no share image
    When any endpoint returns that War
    Then its share_image_url is null
