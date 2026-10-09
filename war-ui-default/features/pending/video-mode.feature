Feature: Video Mode

  Video Wars are not built yet, so these scenarios have no Playwright binding.
  Move this file up to features/ and bind each scenario when video Wars ship.

  Scenario: Videos play in sequence
    Given a matchup in a video War
    When the voter starts playback
    Then the left video plays first
    And the right video begins when the left one ends

  Scenario: Voting is locked until both videos have played
    Given a matchup in a video War where only the left video has played
    Then neither card is selectable
    When the right video finishes
    Then both cards become selectable

  Scenario: A blocked autoplay offers a manual control
    Given the left video has ended
    When the browser refuses to start the right video
    Then a play control is shown on the right card
    And the voter is not left with a stalled player

  Scenario: An unavailable video still permits a vote
    Given a matchup where one contestant's video has been made private
    When the player reports it unavailable
    Then an unavailable state is shown on that card
    And both cards are selectable
