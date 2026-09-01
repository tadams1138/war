Feature: Create War

  Scenario: A voter completes the wizard and activates the War
    Given an authenticated voter on the Create War page
    When they submit the Metadata step with a title
    And they add 2 contestants, each with one image
    And they activate the War from the Review step
    Then the War is created, its contestants added, and it is activated via the API
    And they are redirected to that War's vote page

  Scenario: A title is required to proceed past Metadata
    Given an authenticated voter on the Create War page
    When they submit the Metadata step with no title
    Then an error is shown
    And no War is created

  Scenario: A contestant requires a name
    Given an authenticated voter with a draft War in progress
    When they submit the contestant form with no name
    Then an error is shown
    And no contestant is added

  Scenario: Activation is blocked with fewer than 2 contestants
    Given an authenticated voter with a draft War that has only 1 contestant
    When they attempt to activate
    Then the API's validation message is shown
    And the War is not activated

  Scenario: Activation is blocked when a contestant has no image
    Given an authenticated voter with a draft War whose contestants include one with no image
    When they attempt to activate
    Then the API's validation message is shown
    And the War is not activated

  Scenario: Review shows an image-attached indicator, not the image itself
    Given an authenticated voter with a draft War in progress
    When they add one contestant with an image and one contestant with no image
    And they proceed to the Review step
    Then the contestant with an image shows an image-attached indicator
    And the contestant with no image shows that it has none
    And no contestant's image is rendered on the Review step

  Scenario: Creating a War requires authentication
    Given no voter is authenticated
    When they navigate directly to "/wars/new"
    Then they are redirected to "/login"
    And the returnTo query param is "/wars/new"
