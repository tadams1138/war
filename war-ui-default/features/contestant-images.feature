@contestant-images
Feature: Contestant Images

  Background:
    Given a War
    And that War has a matchup to vote on
    And the API accepts votes

  Scenario: Swiping browses images without voting
    Given the left contestant has 3 images
    And an authenticated voter
    And they are on that War's vote page
    When they swipe the left contestant's card beyond the swipe threshold
    Then the left contestant's card shows image 2
    And no vote is submitted

  Scenario: A swipe never casts a vote however it ends
    Given the left contestant has 3 images
    And an authenticated voter
    And they are on that War's vote page
    When they begin swiping the left contestant's card and release it back over its starting position
    Then no vote is submitted

  Scenario: Tapping votes
    Given the left contestant has 3 images
    And an authenticated voter
    And they are on that War's vote page
    When they tap the left contestant's card
    Then a vote is submitted for the left contestant

  Scenario: A single image shows no carousel affordance
    Given the left contestant has 1 image
    And an authenticated voter
    When they open that War's vote page
    Then the left contestant's card shows no dot indicators or arrow controls

  Scenario: Dot indicators and arrows appear with multiple images
    Given the left contestant has 3 images
    And an authenticated voter
    When they open that War's vote page
    Then the left contestant's card shows 3 dot indicators and arrow controls

  Scenario: Arrow controls and the keyboard browse images without voting
    Given the left contestant has 3 images
    And an authenticated voter
    And they are on that War's vote page
    And the left contestant's card has keyboard focus
    When they press the right arrow key
    Then the left contestant's card shows image 2
    When they press the left arrow key
    Then the left contestant's card shows image 1
    And no vote is submitted
    And the left contestant's card remains a single tab stop

  Scenario: Clicking an arrow control browses images without voting
    Given the left contestant has 3 images
    And an authenticated voter
    And they are on that War's vote page
    When they click the next-image arrow on the left contestant's card
    Then the left contestant's card shows image 2
    And no vote is submitted

  Scenario: Non-primary images are not loaded up front
    Given the left contestant has 10 images
    And an authenticated voter
    When they open that War's vote page
    Then the left contestant's image 1 has been requested
    And the left contestant's images 2 to 10 have not been requested

  Scenario Outline: Navigating toward an image by <action> loads it on demand
    Given the left contestant has 10 images
    And an authenticated voter
    And they are on that War's vote page
    And the left contestant's image 1 has been requested
    When they <action>
    Then the left contestant's image 2 has been requested
    And the left contestant's images 3 to 10 have not been requested

    Examples:
      | action                                                     |
      | swipe the left contestant's card beyond the swipe threshold |
      | click the next-image arrow on the left contestant's card    |
