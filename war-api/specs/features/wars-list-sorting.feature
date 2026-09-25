Feature: Wars List Sorting and Pagination

  Scenario: Newest sort (the default) orders Wars by creation time, most recent first
    Given published Wars were created in order: "First War", "Second War", "Third War"
    When anyone GETs /api/v1/wars
    Then the Wars are returned in the order "Third War", "Second War", "First War"
    And next_cursor is null

  Scenario: Oldest sort orders Wars by creation time, earliest first
    Given published Wars were created in order: "First War", "Second War", "Third War"
    When anyone GETs /api/v1/wars?sort=oldest
    Then the Wars are returned in the order "First War", "Second War", "Third War"

  Scenario: Alphabetical sort orders titled Wars before an untitled War, sorted by title
    Given published Wars, created out of title order: an untitled War, then "Zebra Pageant", then "Apple Pageant"
    When anyone GETs /api/v1/wars?sort=alphabetical
    Then the Wars are returned in the order "Apple Pageant", "Zebra Pageant", then the untitled War

  Scenario: Expiring soonest sort orders Wars by end date, with never-ending Wars last
    Given published Wars, created out of end-date order: one with no end date, then one ending "2027-03-01T00:00:00Z", then one ending "2027-02-01T00:00:00Z"
    When anyone GETs /api/v1/wars?sort=expiring_soonest
    Then the Wars are returned in the order the War ending "2027-02-01T00:00:00Z", the War ending "2027-03-01T00:00:00Z", then the never-ending War

  Scenario: Pagination continues correctly across the null/non-null boundary under alphabetical sort
    Given six published Wars: titled "Alpha War", "Beta War", and "Gamma War", and three more with no title
    When anyone pages through /api/v1/wars?sort=alphabetical&limit=2 by following next_cursor until it is null
    Then every one of the six Wars is returned exactly once, across all pages
    And every titled War appears before every untitled War, in the order collected

  Scenario: An invalid cursor is rejected
    Given a published War
    When anyone GETs /api/v1/wars?cursor=not-a-real-cursor
    Then the response status is 400
    And the response body is exactly {"error": "invalid cursor"}

  Scenario: A cursor produced under one sort mode is rejected when replayed under another
    Given two published Wars
    When anyone GETs a first page of /api/v1/wars?sort=newest&limit=1, then reuses its next_cursor against /api/v1/wars?sort=oldest&limit=1
    Then the response status is 400
