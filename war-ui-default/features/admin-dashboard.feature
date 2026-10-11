@admin-dashboard
Feature: Admin Dashboard

  Scenario: The Admin Dashboard requires authentication
    When a visitor opens the Admin Dashboard
    Then they are redirected to the login page with returnTo the Admin Dashboard

  Scenario: A plain Voter is redirected Home and sees no dashboard link
    Given an authenticated voter
    When they open the Admin Dashboard
    Then they are redirected to Home
    And no Admin Dashboard is shown
    When they open the identity menu
    Then the identity menu offers no "Admin Dashboard" link

  Scenario: A Moderator sees the dashboard link and the dashboard
    Given an authenticated Moderator
    When they open the identity menu
    Then the identity menu links "Admin Dashboard" to the Admin Dashboard
    When they select "Admin Dashboard" from the identity menu
    Then the Admin Dashboard is shown beneath the navigation header

  Scenario: An Admin reaches the dashboard
    Given an authenticated Admin
    When they open the Admin Dashboard
    Then the Admin Dashboard is shown beneath the navigation header

  Scenario Outline: The kill switch panel shows the current state
    Given the War-creation kill switch is off
    And an authenticated <staff>
    When they open the Admin Dashboard
    Then the kill switch is shown as off

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: Enabling the kill switch requires confirmation
    Given the War-creation kill switch is off
    And the API accepts changes to the kill switch
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they choose to enable the kill switch
    Then a confirmation is shown
    And the API has not been asked to change the kill switch
    When they confirm
    Then the kill switch is shown as on
    And the API has been asked to turn the kill switch on

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: Cancelling the confirmation leaves the kill switch unchanged
    Given the War-creation kill switch is off
    And the API accepts changes to the kill switch
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they choose to enable the kill switch
    And they cancel
    Then no confirmation is shown
    And the kill switch is still shown as off
    And the API has not been asked to change the kill switch

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: Disabling the kill switch needs no confirmation
    Given the War-creation kill switch is on
    And the API accepts changes to the kill switch
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they choose to disable the kill switch
    Then the kill switch is shown as off
    And no confirmation is shown

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: A failed kill switch update shows an error and leaves the state unchanged
    Given the War-creation kill switch is off
    And changing the kill switch fails with a server error
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they choose to enable the kill switch
    And they confirm
    Then the kill switch shows the error "Server error — please try again shortly"
    And the kill switch is still shown as off

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  # The last action is one the UI does not know: it is shown as its raw string.
  Scenario: The moderation log lists entries newest first with readable labels
    Given the moderation log holds these entries, newest first:
      | action           | target Voter | target War    | when                 |
      | ban_voter        | voter-banned |               | 2026-10-03T12:00:00Z |
      | remove_war       |              | Removed Title | 2026-10-02T12:00:00Z |
      | brand_new_action |              |               | 2026-10-01T12:00:00Z |
    And an authenticated Admin
    When they open the Admin Dashboard
    Then the moderation log lists these entries, newest first:
      | action label     | by           | target        | when                 |
      | Banned a Voter   | Stella Staff | voter-banned  | 2026-10-03T12:00:00Z |
      | Removed a War    | Stella Staff | Removed Title | 2026-10-02T12:00:00Z |
      | brand_new_action | Stella Staff | No target     | 2026-10-01T12:00:00Z |

  Scenario Outline: Load more appends the next page and hides once the log has no further entries
    Given the moderation log holds these entries, newest first, 1 per page:
      | action      | target Voter | when                 |
      | ban_voter   | v-2          | 2026-10-02T12:00:00Z |
      | unban_voter | v-1          | 2026-10-01T12:00:00Z |
    And an authenticated <staff>
    And they are on the Admin Dashboard
    Then the moderation log lists 1 entry
    When they select the "Load more" button
    Then the moderation log lists these entries, newest first:
      | action label    | by           | target | when                 |
      | Banned a Voter  | Stella Staff | v-2    | 2026-10-02T12:00:00Z |
      | Unbanned a Voter | Stella Staff | v-1   | 2026-10-01T12:00:00Z |
    And the next page of the moderation log was requested from where the first page ended
    And the "Load more" button is hidden

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: Toggling the kill switch adds its entry to the moderation log
    Given the War-creation kill switch is off
    And the API accepts changes to the kill switch
    And the moderation log holds these entries, newest first:
      | action    | target Voter | when                 |
      | ban_voter | v-1          | 2026-10-01T12:00:00Z |
    And the moderation log then holds these entries, newest first:
      | action                          | target Voter | when                 |
      | enable_war_creation_kill_switch |              | 2026-10-02T12:00:00Z |
      | ban_voter                       | v-1          | 2026-10-01T12:00:00Z |
    And an authenticated <staff>
    And they are on the Admin Dashboard
    Then the moderation log lists 1 entry
    When they choose to enable the kill switch
    And they confirm
    Then the moderation log lists these entries, newest first:
      | action label                         | by           | target    | when                 |
      | Enabled the War-creation kill switch | Stella Staff | No target | 2026-10-02T12:00:00Z |
      | Banned a Voter                       | Stella Staff | v-1       | 2026-10-01T12:00:00Z |

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario: A banned Voter's sign-in shows a banned message
    When sign-in ends with the account reported as banned
    Then a message says this account has been banned rather than that sign-in failed
    And the session is not refreshed

  Scenario Outline: A moderation log entry targeting a War links to its detail
    Given a moderation log entry targets a War titled "Alpha War"
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they select "Alpha War" in the moderation log
    Then that War's Staff detail page is shown
    And the heading "Alpha War" is shown

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: A moderation log entry targeting a deleted War shows no link
    Given a moderation log entry targets a War that no longer exists
    And an authenticated <staff>
    When they open the Admin Dashboard
    Then the entry says a deleted War was targeted, with its id and no link

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: A moderation log entry targeting an untitled live War links to it
    Given a moderation log entry targets a live War that has no title
    And an authenticated <staff>
    When they open the Admin Dashboard
    Then the entry names it as an untitled War and links to its Staff detail

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario Outline: A moderation log entry's Voter ids link to the Voter's detail
    Given a moderation log entry targets the Voter "Casey Creator"
    And an authenticated <staff>
    And they are on the Admin Dashboard
    When they select "Casey Creator" in the moderation log
    Then "/admin/voters/v-1" is shown
    And the heading "Casey Creator" is shown
    When they open the Admin Dashboard
    And they select "Stella Staff" in the moderation log
    Then "/admin/voters/staff-voter-1" is shown
    And the heading "Stella Staff" is shown

    Examples:
      | staff     |
      | Moderator |
      | Admin     |

  Scenario: The current Voter's identity is fetched once per visit to the Admin Dashboard
    Given an authenticated Moderator
    When they open the Admin Dashboard
    Then the Admin Dashboard is shown beneath the navigation header
    And the current Voter's identity was requested 1 time

  Scenario: Signing in as another Voter does not reuse the previous Voter's identity
    Given the first Voter to sign in is the Moderator "Staff Stu" and the next is the Voter "Plain Pat"
    And an authenticated voter
    And they are on the Admin Dashboard
    When they log out
    Then they are signed out
    When another voter signs in
    And they open the Admin Dashboard
    Then they are redirected to Home
    And the navigation shows the name "Plain Pat"
    And the current Voter's identity was requested 2 times
