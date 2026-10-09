Feature: Public Wars List Visibility

  Scenario: Anonymous listing excludes drafts, unlisted Wars, and unpublished Wars by default
    Given a voter has created a public published War, a public draft War, a public closed War, and a published unlisted War
    When anyone GETs /api/v1/wars
    Then only the public published War is returned

  Scenario: Being authenticated grants no extra visibility on its own
    Given a voter has created a public draft War
    When a different, authenticated voter GETs /api/v1/wars
    Then that draft War is not returned

  Scenario: An explicit status filter does not override visibility scoping
    Given a voter has created a closed, unlisted War
    When anyone GETs /api/v1/wars?status=closed
    Then that War is not returned

  Scenario: A War whose end date has passed is absent from the default listing before the close task runs
    Given a voter has created a public published War whose end date passed a minute ago and has not yet been closed by the close task
    When anyone GETs /api/v1/wars
    Then that War is not returned

  Scenario: A War whose end date has passed is listed as closed before the close task runs
    Given a voter has created a public published War whose end date passed a minute ago and has not yet been closed by the close task
    When anyone GETs /api/v1/wars?status=closed
    Then that War is returned
    And that War reports its status as "closed"

  Scenario: A draft War whose end date has passed is never listed publicly
    Given a voter has created a public draft War whose end date passed a minute ago
    When anyone GETs /api/v1/wars?status=closed
    Then that draft War is not returned
