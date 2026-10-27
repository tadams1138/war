@video-mode
Feature: Video Mode

  Scenario: Videos play in sequence
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then both video posters are shown
    And the left video plays first
    When the left video ends
    Then the right video begins
    And no playback log is shown

  Scenario: A debug flag shows a playback log for diagnosing phones
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page with debugging on
    Then the playback log records the left video playing

  Scenario: Voting is available from the start
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then both cards become selectable
    And the left video plays first

  Scenario: A blocked autoplay offers a manual control
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the browser refuses to autoplay the right video
    When the left video ends
    Then a play control is shown on the right card
    And replay is not yet offered
    And the voter can start the right video manually
    And only replay is offered

  Scenario: A blocked autoplay on the first video offers a manual control
    Given a matchup in a video War
    And an authenticated voter
    Given the browser refuses to autoplay the left video
    When they open that War's vote page
    Then a play control is shown on the left card
    And the voter can start the left video manually

  Scenario: Replay restarts from the left once the right video starts
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    When the left video ends
    Then only replay is offered
    When the voter replays the pair
    Then both cards remain selectable
    And the left video plays first

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
    When the left video ends
    Then an unavailable state is shown on the right card
    And both cards become selectable

  Scenario: Players exist only for the current matchup
    Given a matchup in a video War
    And a later video matchup
    And the API accepts votes
    And an authenticated voter
    When they open that War's vote page
    Then the later matchup's video posters were fetched ahead
    When the left video ends
    And the right video ends
    And they select the left video card
    Then the next video matchup is shown
    And the previous players are destroyed before the next pair starts

  Scenario: Clips stop at their end time
    Given a matchup in a video War
    And the videos are clips ending after 5 seconds
    And an authenticated voter
    When they open that War's vote page
    When the left clip reaches its end time
    Then the right video begins
    When the right clip reaches its end time
    Then both cards become selectable

  Scenario: A private first video still permits a vote
    Given a matchup in a video War
    And an authenticated voter
    Given the left video has been made private
    When they open that War's vote page
    Then an unavailable state is shown on the left card
    And both cards become selectable
    And the right video begins

  Scenario: Players that cannot be loaded still permit a vote
    Given a matchup in a video War
    And the video players cannot be loaded
    And an authenticated voter
    When they open that War's vote page
    Then an unavailable state is shown on the left card
    And both cards become selectable

  Scenario: Skip to the second video with the next button
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    When the voter skips the first video
    Then the right video begins
    And the first player is stopped
    And only replay is offered

  Scenario: Skip to the second video by clicking its poster
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    When the voter clicks the right poster
    Then the right video begins
    And the first player is stopped
    And only replay is offered

  Scenario: Voting during playback stops the player while the vote is pending
    Given a matchup in a video War
    And a later video matchup
    And the video vote takes time to accept
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    When they select the left video card
    Then both video vote buttons are disabled
    And the first player is stopped
    Then the next video matchup is shown

  Scenario: A missing first video starts the second automatically
    Given a matchup in a video War
    And the left contestant has no video
    And an authenticated voter
    When they open that War's vote page
    Then an unavailable state is shown on the left card
    And the right video begins
    And both cards become selectable

  Scenario: Replay advances past a missing first video
    Given a matchup in a video War
    And the left contestant has no video
    And an authenticated voter
    When they open that War's vote page
    Then the right video begins
    And only replay is offered
    When the voter replays the pair
    Then an unavailable state is shown on the left card
    And the right video begins
