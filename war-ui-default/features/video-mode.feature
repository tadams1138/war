@video-mode
Feature: Video Mode

  Scenario: Videos play in sequence
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left card shows only its player
    And the right card shows only its player
    And the left video plays first
    When the left video ends
    Then the right video begins
    And no playback log is shown

  Scenario: On a phone, a video matchup shows no bios, leaving the space to the videos
    Given a phone screen
    And a matchup in a video War
    And both video contestants have bios
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    And no bio is shown

  Scenario: On a wide screen, a video matchup still shows its bios
    Given a desktop screen
    And a matchup in a video War
    And both video contestants have bios
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    And each video contestant's bio is shown

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

  Scenario: A blocked autoplay shows the provider player without our play button
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Given the browser refuses to autoplay the right video
    When the left video ends
    Then the right video waits for a provider tap
    And the right card shows only its player
    And replay is not yet offered

  Scenario: A tap inside a blocked left player starts playback
    Given a matchup in a video War
    And an authenticated voter
    Given the browser refuses to autoplay the left video
    When they open that War's vote page
    Then the left video waits for a provider tap
    And the left card shows only its player
    When the voter taps inside the left player
    Then the left video plays first

  Scenario: Replay restarts from the left once the right video starts
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    When the left video ends
    Then only replay is offered
    When the voter replays the pair
    Then both cards remain selectable
    And the left video plays first
    And the right player is paused without being destroyed

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

  Scenario: Tapping the right player pauses the left video
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    When the voter taps inside the right player
    Then the right video begins
    And the left player is paused without being destroyed
    And only replay is offered

  Scenario: Provider players are the only controls for starting or switching videos
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    And no page play or skip controls are shown

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

  Scenario: Finished videos show only their players, not their posters
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    And the left video ends
    And the right video ends
    Then the left card shows only its player
    And the right card shows only its player

  Scenario: Switching back to the left player pauses the right
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    When the voter taps inside the right player
    Then the right video begins
    When the voter taps inside the left player
    Then the left video plays first
    And the right player is paused without being destroyed
    And the left card shows only its player
    And the right card shows only its player

  Scenario: Both players exist on load with the right player waiting
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then the left video plays first
    And the right card shows only its player
    And the right player has not been asked to play

  Scenario: The vote button labels the video without a separate contestant name
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    Then both cards become selectable
    And no separate contestant name appears under either video

  Scenario: Replaying inside the left provider still advances to the right
    Given a matchup in a video War
    And an authenticated voter
    When they open that War's vote page
    And the left video ends
    Then the right video begins
    When the voter taps inside the left player
    Then the left video plays first
    When the left video ends
    Then the right video begins
    And the right player has been asked to play 2 times
