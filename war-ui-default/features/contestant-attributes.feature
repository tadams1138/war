Feature: Contestant Attributes

  Scenario: Declared fields render on the War detail page
    Given a War declaring country, age, and height
    When the War detail page loads
    Then each contestant shows those labels with the values it supplied

  Scenario: The same component renders an entirely different campaign
    Given a War declaring party, state, and office
    When the War detail page loads
    Then each contestant shows those labels with the values it supplied

  Scenario: Omitted fields are not rendered
    Given a contestant that supplied no value for height
    When the War detail page loads
    Then no height row is displayed for that contestant

  Scenario: A url-typed attribute renders as a safe link
    Given a War declaring a field of type url
    And a contestant supplying an http or https value for it
    When the War detail page loads
    Then that field renders as a link with rel="noopener noreferrer"

  Scenario: Attributes do not appear on vote cards
    Given a War declaring several contestant fields
    When the vote screen renders a matchup
    Then each card shows only the image and the contestant name
    And no attribute labels or values are shown
