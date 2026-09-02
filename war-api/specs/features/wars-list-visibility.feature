Feature: Public Wars List Visibility

  Scenario: Anonymous listing excludes drafts, invite-only Wars, and non-active Wars by default
    Given a voter has created a public active War, a public draft War, a public closed War, and an active invite-only War
    When anyone GETs /api/v1/wars
    Then only the public active War is returned

  Scenario: Being authenticated grants no extra visibility on its own
    Given a voter has created a public draft War
    When a different, authenticated voter GETs /api/v1/wars
    Then that draft War is not returned

  Scenario: An explicit status filter does not override visibility scoping
    Given a voter has created a closed, invite-only War
    When anyone GETs /api/v1/wars?status=closed
    Then that War is not returned
