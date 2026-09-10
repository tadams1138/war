Feature: Media Mode

  Scenario: A video War rejects image uploads
    Given a draft War with media_mode video
    When an image is uploaded for a contestant
    Then the response status is 409

  Scenario: An image War rejects video attachment
    Given a draft War with media_mode image
    When a video URL is attached to a contestant
    Then the response status is 409

  Scenario: Activation requires media matching the mode
    Given a draft War with media_mode video
    And a contestant with no video attached
    When the creator activates the War
    Then the response status is 422
    And the War remains draft

  Scenario: An unembeddable video is rejected when added
    Given a video URL whose owner has disabled embedding
    When it is attached to a contestant
    Then the response status is 422
    And no media record is created

  Scenario: An unsupported provider is rejected
    Given a video URL from a provider outside the allow-list
    When it is attached to a contestant
    Then the response status is 422

  Scenario: Overlong videos are rejected
    Given a video whose effective duration is 90 seconds
    When it is attached to a contestant
    Then the response status is 422

  Scenario: A clip window shortens a longer video
    Given a five-minute video with start_seconds 60 and end_seconds 80
    When it is attached to a contestant
    Then the media record stores a duration of 20 seconds

  Scenario: Video responses carry an identity, never an embed URL
    Given a contestant with a video
    When any endpoint returns that contestant
    Then the media object names a provider and a video id
    And it contains no embed URL
