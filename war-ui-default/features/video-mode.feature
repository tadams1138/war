@video-mode
Feature: Video Mode

  Scenario: Videos play in sequence
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then both video posters are shown
    When the voter starts playback
    Then the left video plays first
    When the left video ends
    Then the right video begins

  Scenario: Voting is locked until both videos have played
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    And the voter starts playback
    And the left video ends
    Then neither card is selectable
    When the right video ends
    Then both cards become selectable

  Scenario: A blocked autoplay offers a manual control
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the browser refuses to autoplay the right video
    When the voter starts playback
    And the left video ends
    Then a play control is shown on the right card
    And the voter can start the right video manually

  Scenario: A blocked autoplay on the first video offers a manual control
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the browser refuses to autoplay the left video
    When the voter starts playback
    Then a play control is shown on the left card
    And the voter can start the left video manually

  Scenario: Replay keeps voting available after both videos have played
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    And the voter starts playback
    And the left video ends
    And the right video ends
    Then both cards become selectable
    When the voter replays the pair
    Then both cards remain selectable

  Scenario: A missing video does not block voting
    Given a matchup in a video War
    And the right contestant has no video
    And an authenticated voter
    When they open that War's vote page
    Then an unavailable state is shown on the right card
    And both cards become selectable

  Scenario: An unavailable video still permits a vote
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the right video has been made private
    When the voter starts playback
    And the left video ends
    Then an unavailable state is shown on the right card
    And both cards become selectable

  Scenario: Players exist only for the current matchup
    Given a matchup in a video War
    And a later video matchup
    And the API accepts votes
    And an authenticated voter
    When they open that War's vote page
    Then the later matchup's video posters were fetched ahead
    When the voter starts playback
    And the left video ends
    And the right video ends
    And they select the left video card
    Then the next video matchup is shown
    And the previous players are destroyed before the next pair starts

  Scenario: Clips stop at their end time
    Given a matchup in a video War
    And the videos are clips ending after 5 seconds
    And an authenticated voter
    When they open that War's vote page
    And the voter starts playback
    And the left clip reaches its end time
    Then the right video begins
    When the right clip reaches its end time
    Then both cards become selectable

  Scenario: A private first video still permits a vote
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the left video has been made private
    When the voter starts playback
    Then an unavailable state is shown on the left card
    And both cards become selectable

  Scenario: Players that cannot be loaded still permit a vote
    Given a matchup in a video War
    And the video players cannot be loaded
    And an authenticated voter
    When they open that War's vote page
    And the voter starts playback
    Then an unavailable state is shown on the left card
    And both cards become selectable
