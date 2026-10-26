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
    When the right video finishes
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

  Scenario: Replay keeps voting available after both videos have played
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    And the voter starts playback
    And the left video ends
    And the right video finishes
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
    And the voter starts playback
    And the left video ends
    And the right video finishes
    And they select the left video card
    Then the next video matchup is shown
    And the previous players are destroyed before the next pair starts
