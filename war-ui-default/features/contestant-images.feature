Feature: Contestant Images

  Scenario: Swiping browses images without voting
    Given a contestant card with three images
    When the voter swipes horizontally across it by more than the swipe threshold
    Then the next image in that card is shown
    And no vote is submitted

  Scenario: A swipe never casts a vote however it ends
    Given a contestant card with three images
    When the voter begins a horizontal swipe and releases it back over its starting position
    Then no vote is submitted for that card

  Scenario: Tapping votes
    Given a contestant card with three images
    When the voter taps it without horizontal movement beyond the swipe threshold
    Then a vote is submitted for that contestant

  Scenario: A single image shows no carousel affordance
    Given a contestant with exactly one image
    When the vote screen renders
    Then no dot indicators or arrow controls are displayed for that card

  Scenario: Dot indicators and arrows appear with multiple images
    Given a contestant with three images
    When the vote screen renders
    Then dot indicators and arrow controls are displayed for that card

  Scenario: Arrow controls and the keyboard browse images without voting
    Given a contestant card with three images, focused via keyboard
    When the voter presses an arrow key
    Then the next or previous image is shown
    And no vote is submitted
    And the card remains a single tab stop

  Scenario: Non-primary images are not loaded up front
    Given a contestant with ten images
    When the matchup first renders
    Then only the primary image has been requested
    And the remaining nine have not

  Scenario: Navigating toward an image loads it on demand
    Given a contestant with ten images, only the primary one loaded
    When the voter swipes or navigates to the second image
    Then the second image is requested at that point
    And images beyond it remain unloaded
