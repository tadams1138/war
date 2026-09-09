Feature: Image Upload Tool

  upload_image reads a local file and forwards it to war-api-spec.md §7.3's image
  endpoint. Reading the file is war-mcp's own responsibility (spec §5.4); everything
  about whether the content is acceptable is the API's.

  Scenario: upload_image reads the file and uploads it
    Given a valid cached credential
    And a draft War the authenticated voter created with a contestant
    And a readable image file on disk
    When upload_image is called with that file's path
    Then a POST /api/v1/wars/:id/contestants/:cId/images request is made carrying the file's bytes
    And the result reports the stored image's id

  Scenario: upload_image fails before any request when the path cannot be read
    Given a valid cached credential
    And a path that does not exist on disk
    When upload_image is called with that path
    Then the result reports that the file could not be read
    And no request is made to the War API

  Scenario: upload_image surfaces the API's per-contestant image limit
    Given a valid cached credential
    And a contestant that already has ten images
    And a readable image file on disk
    And the War API rejects the upload with 422 naming the ten-image limit
    When upload_image is called with that file's path
    Then the result reports that same 422 message

  Scenario: upload_image on a contestant the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a contestant belonging to a draft War created by Voter A
    And a readable image file on disk
    When Voter B calls upload_image for that contestant
    Then a POST request is made bearing Voter B's token
    And the result reports the API's 403
