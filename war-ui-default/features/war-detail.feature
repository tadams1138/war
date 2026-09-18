Feature: War Detail

  War detail is one page (war-spec.md 10.1, 10.4): a single results list, ordered
  by rank, where each row carries that contestant's image, name, bio, wins, and
  appearances together. There is no separate contestant gallery and no separate
  "Results" section — one merged list is the whole page.

  Scenario: War overview loads with its results
    Given an active public War with 3 contestants
    When a visitor navigates to that War's detail page
    Then the War's title and category are shown
    And every contestant is shown with its primary image and name

  Scenario: The War detail page requires no authentication
    Given an active public War
    When an unauthenticated visitor navigates to its detail page
    Then the War overview and its results list are shown

  Scenario: A War that doesn't exist shows a not-found message
    Given no War exists with a given id
    When a visitor navigates to that id's detail page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: A contestant's bio renders inline with their result, not full-size media
    Given a War with 2 contestants, each with a bio
    When a visitor navigates to that War's detail page
    Then each contestant's media is no wider than a thumbnail
    And each contestant's bio is visible right alongside it

  Scenario: A contestant with multiple images is browsable in place
    Given a contestant with 3 images
    When a visitor navigates to that War's detail page
    Then paging controls are shown for that contestant's result row
    And selecting the next control shows that contestant's second image
    And the visitor is still on the War's detail page

  Scenario: A contestant with no media shows no image at all
    Given a contestant with no images
    When a visitor navigates to that War's detail page
    Then that contestant's result row shows no image and no placeholder

  Scenario: The detail page shows results with rank, image, wins, and appearances
    Given a public active War with votes recorded
    When an unauthenticated visitor navigates to that War's detail page
    Then the leaderboard is shown with rank, image, name, wins, and appearances for each contestant
    And no win percentage is displayed anywhere

  Scenario: The UI renders results in the order and ranks the API returns
    Given the API returns contestants in a given order with given ranks
    When the War detail page renders
    Then result rows appear in that exact order
    And the displayed ranks match the API response exactly

  Scenario: Unranked contestants are shown at the bottom of results
    Given a War where a contestant has received no votes
    When the War detail page loads
    Then that contestant appears at the bottom of the results with rank "—"

  Scenario: Results poll while the War is active
    Given a visitor viewing the detail page of an active War
    When 30 seconds elapse
    Then the detail page re-fetches results from the API
    And the leaderboard updates if the results changed

  Scenario: A failed results poll keeps the last loaded leaderboard on screen
    Given a visitor viewing the detail page of an active War with results already loaded
    When a poll to re-fetch results fails
    Then the previously loaded leaderboard remains displayed
    And no error state replaces it
    And the detail page continues polling every 30 seconds

  Scenario: The leaderboard recovers once a later results poll succeeds
    Given a visitor viewing the detail page of an active War whose last results poll failed
    When the next poll succeeds
    Then the leaderboard updates to reflect that response

  Scenario: Results do not poll once the War is closed
    Given a visitor viewing the detail page of a closed War
    When 30 seconds elapse
    Then the detail page does not re-fetch results from the API

  Scenario: An invite-only War's results require sign-in
    Given an invite-only War
    When an unauthenticated visitor navigates to that War's detail page
    Then the message "Please log in to continue" is shown
    And they are redirected to /login

  Scenario: A completed vote flow links back to the War's results
    Given a voter who has just cast their final vote in a War
    When the completion screen is shown
    And they select the results link
    Then that War's detail page is shown with results

  Scenario: A War's creator sees Edit and Delete on its results page while it's a draft
    Given a draft War created by the viewing voter
    When they navigate to that War's detail page
    Then an Edit link and a Delete button are shown

  Scenario: A non-creator sees no Edit or Delete on a draft War's results page
    Given a draft War created by someone else
    When the viewer navigates to that War's detail page
    Then no Edit link and no Delete button are shown

  Scenario: Delete from the results page asks for confirmation before removing the War
    Given a draft War created by the viewing voter
    When they click Delete on its results page
    Then a confirmation dialog is shown
    And no delete request has been sent yet

  Scenario: Confirming delete removes the War and returns to My Wars
    Given a draft War created by the viewing voter, with its Delete confirmation open
    When they confirm the deletion
    Then the War is deleted
    And they are returned to My Wars

  Scenario: Cancelling delete leaves the War untouched
    Given a draft War created by the viewing voter, with its Delete confirmation open
    When they cancel
    Then no delete request has been sent
    And they remain on the results page

  Scenario: An authenticated voter who hasn't finished voting sees a Vote entry point
    Given an active War the voter has joined and partially voted in
    When they navigate to that War's detail page
    Then a Vote link is shown

  Scenario: A voter who has finished voting sees no Vote entry point
    Given an active War the voter has fully voted in
    When they navigate to that War's detail page
    Then no Vote link is shown

  Scenario: An anonymous visitor sees no Vote entry point
    Given an active War
    When an unauthenticated visitor navigates to its detail page
    Then no Vote link is shown
