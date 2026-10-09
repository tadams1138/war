Feature: Admin visibility

  Scenario: A Moderator lists every War whatever its status
    Given a Voter who created a draft, an invite-only, a closed and a removed War, the closed one with 2 unaddressed and 1 addressed report
    And a Moderator
    When the Moderator GETs the admin Wars
    Then the response lists all 4 Wars newest first with their status, visibility, creator, removed_at and unaddressed report count

  Scenario: Filtering the admin Wars by status removed lists only removed Wars
    Given a Voter who created a draft, an invite-only, a closed and a removed War, the closed one with 2 unaddressed and 1 addressed report
    And a Moderator
    When the Moderator GETs the admin Wars with status removed
    Then the response lists only the removed War

  Scenario: Filtering the admin Wars by another status excludes removed Wars
    Given a Voter who created a draft, an invite-only, a closed and a removed War, the closed one with 2 unaddressed and 1 addressed report
    And a Moderator
    When the Moderator GETs the admin Wars with status published
    Then the response lists only the published War that was not removed

  Scenario: Searching the admin Wars matches a title case-insensitively
    Given a Voter who created a draft, an invite-only, a closed and a removed War, the closed one with 2 unaddressed and 1 addressed report
    And a Moderator
    When the Moderator GETs the admin Wars with q "cLOSED"
    Then the response lists only the War titled "Closed War"

  Scenario: Searching the admin Wars matches a creator name
    Given a Voter "alice" with a War and a Voter "bob" with a War
    And a Moderator
    When the Moderator GETs the admin Wars with q "BOB"
    Then the response lists only bob's War

  Scenario: Searching the admin Wars lists a War matching on title and creator name once
    Given Voters "sam" and "tess" with Wars titled "Sam Rematch", "Sam Day" and "Other"
    And a Moderator
    When the Moderator GETs the admin Wars with q "sam"
    Then the response lists each of the three Wars exactly once, newest first

  Scenario: Searching the admin Wars treats wildcard characters literally
    Given a Voter with Wars titled "100% Cats" and "Dogs"
    And a Moderator
    When the Moderator GETs the admin Wars with q "%"
    Then the response lists only the War titled "100% Cats"

  Scenario: The admin Wars are returned a page at a time
    Given a Voter with 5 Wars created within the same millisecond
    And a Moderator
    When the Moderator pages through the admin Wars with limit 3 following each next cursor
    Then there are 2 pages, every War appears exactly once newest first, and the last cursor is null

  Scenario: A malformed cursor on the admin Wars is rejected
    Given a Moderator
    When the Moderator GETs the admin Wars with cursor "not-a-cursor"
    Then the response is 400

  Scenario Outline: A plain Voter cannot use the admin endpoints
    Given a plain Voter
    When that Voter GETs <path>
    Then the response is 403

    Examples:
      | path                                                         |
      | /admin/wars                                                  |
      | /admin/wars/00000000-0000-4000-8000-000000000000             |
      | /admin/voters                                                |
      | /admin/voters/00000000-0000-4000-8000-000000000000           |
      | /admin/voters/00000000-0000-4000-8000-000000000000/votes     |

  Scenario Outline: An unauthenticated caller cannot use the admin endpoints
    When an unauthenticated caller GETs <path>
    Then the response is 401

    Examples:
      | path                                                         |
      | /admin/wars                                                  |
      | /admin/wars/00000000-0000-4000-8000-000000000000             |
      | /admin/voters                                                |
      | /admin/voters/00000000-0000-4000-8000-000000000000           |
      | /admin/voters/00000000-0000-4000-8000-000000000000/votes     |

  Scenario: A Moderator views a removed War with its contestants and counters
    Given a removed War with contestants "Ann" (3 wins, 5 appearances) and "Bea" (2 wins, 5 appearances) and 3 reports, 1 of them addressed
    And a Moderator
    When the Moderator GETs that War from the admin endpoint
    Then the response shows the removed War with its contestants in order, their counters, and 3 reports of which 2 are unaddressed

  Scenario Outline: An unknown War or Voter is not found
    Given a Moderator
    When the Moderator GETs <path>
    Then the response is 404

    Examples:
      | path                                                         |
      | /admin/wars/00000000-0000-4000-8000-000000000000             |
      | /admin/wars/not-a-uuid                                       |
      | /admin/voters/00000000-0000-4000-8000-000000000000           |
      | /admin/voters/not-a-uuid                                     |
      | /admin/voters/00000000-0000-4000-8000-000000000000/votes     |
      | /admin/voters/not-a-uuid/votes                               |

  Scenario: A Moderator lists every Voter with their War count
    Given a Voter "alice" who created 2 Wars, one of them removed
    And a Moderator
    When the Moderator GETs the admin Voters
    Then the response lists the Moderator then alice, each with exactly the Voter fields and alice with a War count of 2

  Scenario Outline: A Moderator filters the Voters by status
    Given Voters alice, bob who is suspended, carol who is banned, and dave who is an Admin
    And a Moderator
    When the Moderator GETs the admin Voters with status <status>
    Then the response lists exactly <names> newest first

    Examples:
      | status    | names            |
      | suspended | bob              |
      | banned    | carol            |
      | staff     | moderator, dave  |

  Scenario Outline: A Moderator searches the Voters by display name
    Given Voters named alice and 100%pure
    And a Moderator
    When the Moderator GETs the admin Voters with q <q>
    Then the response lists exactly <name>

    Examples:
      | q   | name     |
      | LIC | alice    |
      | %   | 100%pure |

  Scenario: The admin Voters are returned a page at a time
    Given 5 Voters created within the same millisecond
    And a Moderator who joined earlier
    When the Moderator pages through the admin Voters with limit 3 following each next cursor
    Then there are 2 pages, every Voter appears exactly once newest first, and the last cursor is null

  Scenario: A Moderator views a Voter with all their Wars including removed ones
    Given a suspended Voter "alice" who created a kept War and then a removed War
    And a Moderator
    When the Moderator GETs that Voter from the admin endpoint
    Then the response shows alice with a War count of 2 and both Wars newest first, the removed one with its removal time

  Scenario: A Moderator reads a Voter's complete vote history
    Given a Voter who voted in a published War, then in another Voter's invite-only War, then in a War that was later removed
    And a Moderator
    When the Moderator GETs that Voter's admin vote history
    Then the response lists all 3 votes newest first, each with the War, winner and loser names and when it was cast

  Scenario: A Voter's admin vote history is returned a page at a time
    Given a Voter who cast 5 votes within the same millisecond
    And a Moderator
    When the Moderator pages through that Voter's admin vote history with limit 2 following each next cursor
    Then there are 3 pages, every vote appears exactly once newest first, and the last cursor is null

  Scenario: A malformed cursor on the admin Voters is rejected
    Given a Moderator
    When the Moderator GETs the admin Voters with cursor "not-a-cursor"
    Then the response is 400

  Scenario: A malformed cursor on a Voter's admin vote history is rejected
    Given a Moderator
    When the Moderator GETs their own admin vote history with cursor "not-a-cursor"
    Then the response is 400

  Scenario Outline: A limit outside 1 to 100 on an admin list is rejected
    Given a Moderator
    When the Moderator GETs <path> with limit 101
    Then the response is 400

    Examples:
      | path         |
      | /admin/wars   |
      | /admin/voters |

  Scenario: The public War route still hides a removed War from a Moderator
    Given a removed War
    And a Moderator
    When the Moderator GETs that War from the public endpoint
    Then the response is 404

  Scenario: Reading the admin endpoints writes nothing to the moderation log
    Given a Voter with a War and a vote
    And a Moderator
    When the Moderator GETs all 5 admin endpoints
    Then the moderation log is empty

  Scenario: The admin Wars report and filter by effective status before the close task runs
    Given a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task
    And a Moderator
    When the Moderator GETs the admin Wars with status closed
    Then the response lists that War with status "closed"
    When the Moderator GETs the admin Wars with status published
    Then the response does not list that War

  Scenario: The admin War detail reports effective status before the close task runs
    Given a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task
    And a Moderator
    When the Moderator GETs that War from the admin endpoint
    Then the response shows that War with status "closed"

  Scenario: The admin Voter detail reports each War's effective status before the close task runs
    Given a Voter who created a published War whose end date passed a minute ago and has not yet been closed by the close task
    And a Moderator
    When the Moderator GETs that Voter from the admin endpoint
    Then the response lists that War with status "closed"
