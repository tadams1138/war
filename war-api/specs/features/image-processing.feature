Feature: Contestant image processing

  Scenario: Uploaded images are re-encoded into variants
    Given a 10MB JPEG uploaded for a contestant
    When the upload completes
    Then WebP variants are stored at 400, 800, and 1600 pixels wide
    And the original is retained in a private prefix

  Scenario: EXIF metadata is stripped
    Given a photo containing GPS coordinates in its EXIF data
    When the photo is uploaded
    Then no EXIF metadata is present in any variant

  Scenario Outline: Android photos are stored the way the phone shows them
    Given an Android <shape> photo whose camera recorded EXIF orientation <orientation>
    When the photo is uploaded
    Then every variant shows the photo upright, with no EXIF orientation
    And the image's aspect ratio is that of a <shape> photo

    Examples:
      | shape     | orientation |
      | portrait  | 6           |
      | portrait  | 8           |
      | landscape | 1           |
      | landscape | 3           |

  Scenario: A photo without EXIF metadata is stored as it is
    Given a landscape photo with no EXIF metadata
    When the photo is uploaded
    Then every variant shows the photo upright, with no EXIF orientation
    And the image's aspect ratio is that of a landscape photo

  Scenario: Images are never upscaled
    Given an image 600 pixels wide
    When the image is uploaded
    Then a 400px variant exists
    And no 800px or 1600px variant is produced

  Scenario: Originals are not publicly reachable
    Given a stored original image
    When it is requested through the public media path
    Then it is not served

  Scenario: Responses expose variants, not raw URLs
    Given a contestant with images
    When any endpoint returns that contestant
    Then each image includes a variants array with width and url

  Scenario: A contestant may hold up to ten images
    Given a contestant with ten images in a draft War
    When an eleventh image is uploaded
    Then the response status is 422
    And the response explains that a contestant may hold at most 10 images

  Scenario: Deleting one image reclaims its stored objects but leaves the contestant's other image
    Given a contestant with two uploaded images
    When the creator deletes the first image
    Then only the second image's variants and original remain in storage

  Scenario: Reordering an image requires a display order
    Given a contestant with two uploaded images
    When the creator PATCHes the second image with no display_order
    Then the response status is 422
    And the second image keeps its display order

  Scenario: An Admin can delete an image of a contestant in another Voter's War
    Given a contestant with two uploaded images in a War created by Voter A
    When an Admin deletes the first image
    Then only the second image's variants and original remain in storage
