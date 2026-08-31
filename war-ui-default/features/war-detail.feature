Feature: War Detail

  Scenario: War overview loads with its contestant gallery
    Given an active public War with 3 contestants
    When a visitor navigates to that War's detail page
    Then the War's title and category are shown
    And every contestant is shown with its primary image and name

  Scenario: The War detail page requires no authentication
    Given an active public War
    When an unauthenticated visitor navigates to its detail page
    Then the War overview and contestant gallery are shown

  Scenario: A War that doesn't exist shows a not-found message
    Given no War exists with a given id
    When a visitor navigates to that id's detail page
    Then the message "This War doesn't exist or has been removed" is shown
