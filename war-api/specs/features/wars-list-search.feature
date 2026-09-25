Feature: Wars List Search

  Scenario: q matches a War's title, case-insensitively, anywhere in the title
    Given a published War titled "Great Pastry Showdown" and a published War titled "Something Else Entirely"
    When anyone GETs /api/v1/wars?q=PASTRY
    Then only the pastry War is returned

  Scenario: q matches a War's creator's display name, case-insensitively, anywhere in the name
    Given a voter named "Alexandria Rivera" has created a published War titled "Unrelated Title"
    And a voter named "Someone Else" has created a published War titled "Another Unrelated Title"
    When anyone GETs /api/v1/wars?q=rivera
    Then only Alexandria's War is returned

  Scenario: creator_name is present on every returned War summary
    Given a voter named "Creator Name" has created a published War
    When anyone GETs /api/v1/wars
    Then that War's creator_name is "Creator Name"

  Scenario: A War with no title still matches search by its creator's display name
    Given a published War with no title, created by a voter named "Searchable Creator"
    And a published War titled "Other Title" created by a voter named "Other Voter"
    When anyone GETs /api/v1/wars?q=searchable
    Then only the untitled War is returned

  Scenario: A whitespace-only title never matches search, even for that literal whitespace
    Given a published War titled "   " created by a voter named "Nobody Special"
    And a published War titled "Space Explorers" created by a voter named "Someone Else"
    When anyone GETs /api/v1/wars?q=%20%20%20
    Then neither War is returned

  Scenario: A literal percent sign in the search text is not treated as a wildcard
    Given a published War titled "100% Off" and a published War titled "Full Price"
    When anyone GETs /api/v1/wars?q=%25
    Then only the "100% Off" War is returned

  Scenario: A literal underscore in the search text is not treated as a single-character wildcard
    Given a published War titled "A_B" and a published War titled "AXB"
    When anyone GETs /api/v1/wars?q=A_B
    Then only the "A_B" War is returned
