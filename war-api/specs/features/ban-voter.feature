Feature: Ban a Voter

  Scenario: An Admin bans a Voter and the ban is logged
    Given an Admin and a plain Voter
    When the Admin bans the Voter
    Then the response is 200 with the Voter banned and a ban_voter log entry names the Admin and the Voter

  Scenario: A banned Voter's existing access token stops working immediately
    Given an Admin and a plain Voter with a valid access token
    When the Admin bans the Voter
    Then the Voter's token gets 401 on an authenticated route and is anonymous on an optional-auth route

  Scenario: A banned Voter cannot refresh
    Given an Admin and a Voter who signed in
    When the Admin bans the Voter
    Then refreshing with the Voter's refresh token gets 401

  Scenario: A banned Voter cannot sign in
    Given an Admin and a Voter who signed in
    When the Admin bans the Voter
    And the Voter completes the OAuth callback again
    Then the callback redirects to the UI with error banned and issues no refresh token

  Scenario: Banning deletes every War the Voter created
    Given an Admin and a Voter who created a draft, a published and a removed War, each with contestants and images
    And another Voter voted in the Voter's published War
    When the Admin bans the Voter
    Then none of those Wars or their contestants, matchups, votes and media rows remain
    And their stored media objects are gone

  Scenario: Banning removes the Voter's votes and memberships elsewhere and leaves other data untouched
    Given an Admin, a Voter, and another Voter's published War in which both Voters voted differently
    When the Admin bans the Voter
    Then the Voter's votes and memberships are gone and the counters reflect only the remaining vote
    And the other Voter's War, vote and membership remain

  Scenario: Banning revokes every refresh-token family of the Voter
    Given an Admin and a Voter who signed in twice
    When the Admin bans the Voter
    Then every refresh token of the Voter is revoked

  Scenario: Unbanning restores sign-in but not the deleted data
    Given an Admin and a banned Voter whose War was deleted
    When the Admin unbans the Voter
    And the Voter completes the OAuth callback again
    Then the callback signs the Voter in and the War stays deleted and an unban_voter entry is logged

  Scenario: Banning an already-banned Voter is idempotent
    Given an Admin and a banned Voter whose War was deleted
    When the Admin bans the Voter
    Then the response is 200 with the Voter banned and the log holds two ban_voter entries

  Scenario: A plain Voter cannot ban
    Given two plain Voters with the second owning a War
    When the first Voter bans the second
    Then the response is 403 and nothing changed and nothing is logged

  Scenario: Staff cannot ban themselves
    Given an Admin who owns a War
    When the Admin bans themself
    Then the response is 403 and nothing changed and nothing is logged

  Scenario: Staff cannot ban other Staff
    Given an Admin and a Moderator who owns a War
    When the Admin bans the Moderator
    Then the response is 403 and nothing changed and nothing is logged

  Scenario: Banning an unknown Voter 404s
    Given an Admin
    When the Admin bans an unknown Voter id
    Then the response is 404 and nothing is logged

  Scenario: A storage failure after the commit does not fail the ban
    Given an Admin and a Voter who owns a War with images and the object store is failing
    When the Admin bans the Voter
    Then the response is 200 and the War rows are deleted and the Voter is banned
