Feature: OAuth Authentication

  Scenario: Same email, different provider creates separate voters
    Given voter A signed in with Google using "user@example.com"
    When a user signs in with Microsoft using "user@example.com"
    Then a separate Voter record is created
    And the two accounts are not linked
