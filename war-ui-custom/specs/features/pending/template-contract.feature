Feature: Template Contract

  Scenario: A bundle missing a required template cannot deploy
    Given a custom UI repo without templates/vote-mode.mustache
    When the pipeline runs
    Then the template-check stage fails
    And no bundle is uploaded

  Scenario: An oversized bundle cannot deploy
    Given a custom UI whose dist/ totals 3MB
    When the pipeline runs
    Then the size-check stage fails
    And no bundle is uploaded

  Scenario: An unsafe slug is rejected before upload
    Given a slug containing a path traversal sequence
    When the pipeline resolves the slug
    Then the run fails
    And nothing is written to storage

Feature: Presentation Fidelity

  Scenario: Contestant sides are rendered as supplied
    Given a matchup context with contestant B as left and contestant A as right
    When vote-mode.mustache renders
    Then B appears in the left position
    And A appears in the right position

  Scenario: No skip control is offered
    Given a matchup context
    When vote-mode.mustache renders
    Then exactly two selectable choices are present
    And no skip or abstain control exists

  Scenario: Rankings are rendered in the supplied order
    Given a rankings context listing contestants in a given order
    When rankings.mustache renders
    Then rows appear in that order
    And no percentage is displayed

  Scenario: Unranked contestants render as supplied
    Given a rankings context where a contestant has is_unranked true
    When rankings.mustache renders
    Then that contestant shows "—" for rank
    And appears after all ranked contestants

  Scenario: Voting entry point is hidden when voting is unavailable
    Given a war-detail context with can_vote false
    When war-detail.mustache renders
    Then no vote entry point is present

Feature: Hosting

  Scenario: A registered custom UI is served at its slug path
    Given a registered slug "miss-universe-2026" with an uploaded bundle
    When a request is made to /ui/miss-universe-2026/
    Then that bundle's index.html is returned

  Scenario: Deep links into a custom UI resolve
    Given a registered custom UI
    When a request is made to a client-side route within it
    Then the slug's index.html is returned with HTTP 200

  Scenario: Registering a custom UI provisions nothing
    Given a new custom UI bundle
    When it is registered and uploaded
    Then it is served at its slug path
    And no infrastructure apply was required
    And no other custom UI was affected
