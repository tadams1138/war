Feature: Routing

  Scenario: API requests are routed to the API service
    When a request is made to /api/v1/wars
    Then the request is forwarded to the war-api service
    And the path is preserved without rewriting
    And the response is JSON

  Scenario: Default UI is served for unmatched paths
    When a request is made to /some/unknown/path
    Then index.html from the default UI is returned
    And the HTTP status is 200

  Scenario: Custom UI slug is routed to the shared bucket
    Given a registered slug "miss-universe-2026"
    When a request is made to /ui/miss-universe-2026/
    Then index.html is returned from the shared custom UI bucket under that slug's prefix

  Scenario: SPA deep links into the default UI return index.html
    Given the default UI is deployed
    When a request is made to /wars/some-war-id/vote
    Then index.html is returned with HTTP 200
    And the client-side router handles the route

  Scenario: SPA deep links into a custom UI return index.html with status 200
    Given a registered slug "miss-universe-2026"
    When a request is made to /ui/miss-universe-2026/rankings
    And no object exists at that key in storage
    Then that slug's index.html is returned
    And the HTTP status is 200

  Scenario: Two custom UIs are served from the same origin
    Given registered slugs "miss-universe-2026" and "best-pizza-nyc"
    When requests are made to /ui/miss-universe-2026/ and /ui/best-pizza-nyc/
    Then each returns its own bundle
    And both were served from a single storage origin

  Scenario: Registering a new slug requires no infrastructure change
    Given a new custom UI bundle for slug "best-pizza-nyc"
    When the bundle is uploaded under that slug's prefix
    And a ui_registrations row is inserted
    Then /ui/best-pizza-nyc/ serves that bundle
    And no infrastructure apply was required
    And no new bucket or origin was created
    And no existing component was redeployed

Feature: Scheduled Tasks

  Scenario: Expired Wars are closed by the nightly task
    Given an active War whose ends_at passed six hours ago
    When the close-expired-wars task runs
    Then the War's stored status becomes "closed"

  Scenario: Voting is rejected at expiry regardless of the task
    Given an active War whose ends_at passed one minute ago
    And the close-expired-wars task has not yet run
    When a voter casts a vote
    Then the response status is 403
    And the War is reported as closed

  Scenario: The task is idempotent
    Given the close-expired-wars task has already run successfully
    When it runs again with no newly expired Wars
    Then no War records are modified
    And the task reports success

  Scenario: Internal task endpoints reject unauthenticated callers
    When a request is made to /api/v1/internal/close-expired-wars without a valid internal token
    Then the request is rejected
    And no War records are modified

  Scenario: Internal task endpoints are not reachable from the public internet
    When an external client requests /api/v1/internal/close-expired-wars
    Then the request is blocked at the edge
    And it never reaches the API service

  Scenario: Repeated task failure raises an alert
    Given the close-expired-wars task has failed on two consecutive scheduled runs
    Then an alert is raised
    And the platform continues to reject votes on expired Wars

Feature: CI/CD Pipelines

  Scenario: API deploy pipeline runs all stages on merge to master
    Given a merged PR in war-api
    When the pipeline triggers
    Then lint, test, and build stages all pass
    And the image is pushed to the container registry
    And a deployment is triggered for staging
    And smoke tests pass before the production gate is reached

  Scenario: A failed migration aborts the deployment
    Given a migration that exits non-zero
    When the pre-deploy hook runs during a deployment
    Then the deployment is aborted
    And the previous revision continues serving traffic

  Scenario: Custom UI pipeline blocks on missing required template
    Given a war-ui-{slug} repo missing vote-mode.mustache
    When the pipeline runs the template-check stage
    Then the pipeline fails
    And no deployment occurs

  Scenario: Custom UI pipeline blocks on bundle size exceeded
    Given a war-ui-{slug} repo with a built output of 3MB
    When the pipeline runs the size-check stage
    Then the pipeline fails with a size error
    And no deployment occurs

  Scenario: Infrastructure changes require manual approval for production
    Given an infrastructure change merged to war-infra master
    When the pipeline reaches the apply-prod stage
    Then it pauses for manual approval
    And only proceeds after a team member approves

  Scenario: Concurrent infra applies to one environment are serialised
    Given an infrastructure apply is running for production
    When a second push to master triggers another apply
    Then the second run queues behind the first
    And neither run is cancelled

Feature: Concurrency Group Isolation

  Scenario: A concurrency group name shared by two different pipelines is flagged
    Given two different workflow files that each declare the same literal
      concurrency group name
    When the repository's concurrency groups are checked
    Then the check reports a violation naming both files and the shared group

  Scenario: A pipeline serialising its own jobs is not flagged
    Given a single workflow file whose own jobs deliberately share one
      concurrency group, as the infra pipeline's plan/apply job pairs do
    When the repository's concurrency groups are checked
    Then no violation is reported for that file

  Scenario: The api and ui-default pipelines no longer share a group
    Given the api and ui-default pipelines as delivered by this change
    When their staging and production concurrency groups are inspected
    Then all four group names are distinct
    And none of them is shared with any other workflow file

Feature: Secrets & Config

  Scenario: Secrets are never stored in repos
    Given any application repo
    When the repo is scanned for secret patterns
    Then no secrets, API keys, or credentials are found

  Scenario: API receives correct env vars at runtime
    Given the war-api service starts in staging
    When it initialises
    Then DATABASE_URL, JWT_SECRET, and OAuth credentials are available
    And DATABASE_URL points at the pooled connection, not the direct one

  Scenario: Infrastructure plan output redacts secret values
    Given a change to a secret environment variable
    When the plan runs in CI
    Then the plan output shows the value as sensitive
    And the cleartext value does not appear in pipeline logs

Feature: Data Protection

  Scenario: The database is not reachable from the public internet
    Given the managed PostgreSQL cluster is provisioned
    When a connection is attempted from an address outside the allowed sources
    Then the connection is refused

Feature: Edge Protection

  Scenario: Auth endpoints are rate limited at the edge
    Given a client issuing requests to /api/v1/auth/* above the configured threshold
    When the requests reach the edge
    Then excess requests are rejected before reaching the origin
    And the rate limit event is recorded in edge analytics
