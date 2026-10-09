Feature: War Detail

  War detail is one page (war-spec.md 10.1, 10.4): a single results list, ordered
  by rank, where each row carries that contestant's image, name, bio, wins, and
  appearances together. There is no separate contestant gallery and no separate
  "Results" section — one merged list is the whole page.

  Scenario: War overview loads with its results
    Given a published public War with 3 contestants
    When a visitor navigates to that War's detail page
    Then the War's title and category are shown
    And every contestant is shown with its primary image and name

  Scenario: The War detail page requires no authentication
    Given a published public War
    When an unauthenticated visitor navigates to its detail page
    Then the War overview and its results list are shown

  Scenario: A War that doesn't exist shows a not-found message
    Given no War exists with a given id
    When a visitor navigates to that id's detail page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: A contestant's formatted bio renders inline with their result
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

  Scenario: The detail page shows results with rank, image, wins, appearances, and a win-share bar
    Given a public published War with votes recorded
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

  Scenario: Results poll while the War is published
    Given a visitor viewing the detail page of a published War
    When 30 seconds elapse
    Then the detail page re-fetches results from the API
    And the leaderboard updates if the results changed

  Scenario: A failed results poll keeps the last loaded leaderboard on screen
    Given a visitor viewing the detail page of a published War with results already loaded
    When a poll to re-fetch results fails
    Then the previously loaded leaderboard remains displayed
    And no error state replaces it
    And the detail page continues polling every 30 seconds

  Scenario: The leaderboard recovers once a later results poll succeeds
    Given a visitor viewing the detail page of a published War whose last results poll failed
    When the next poll succeeds
    Then the leaderboard updates to reflect that response

  Scenario: Results do not poll once the War is closed
    Given a visitor viewing the detail page of a closed War
    When 30 seconds elapse
    Then the detail page does not re-fetch results from the API

  Scenario: A completed vote flow redirects to the War's results
    Given a voter who has just cast their final vote in a War
    Then they are redirected to that War's detail page
    And the completion notice is shown

  Scenario: The completion notice is shown to a voter who has finished voting
    Given an authenticated voter who has voted on every matchup in a published War
    When they navigate to that War's detail page
    Then the message "You've voted on every matchup — thank you!" is shown

  Scenario: The completion notice is not shown to a voter who hasn't finished voting
    Given an authenticated voter who hasn't finished voting in a published War
    When they navigate to that War's detail page
    Then the completion notice is not shown

  Scenario: The completion notice is not shown to an anonymous visitor
    Given an anonymous visitor viewing a published War's detail page
    Then the completion notice is not shown

  Scenario: A War's creator sees Edit and Delete on its results page, in any status
    Given a published War created by the viewing voter
    When they navigate to that War's detail page
    Then an Edit link and a Delete button are shown

  Scenario: A non-creator sees no Edit or Delete on a War's results page
    Given a published War created by someone else
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
    Given a published War the voter has joined and partially voted in
    When they navigate to that War's detail page
    Then a Vote link is shown

  Scenario: A voter who has finished voting sees no Vote entry point
    Given a published War the voter has fully voted in
    When they navigate to that War's detail page
    Then no Vote link is shown

  Scenario: An anonymous visitor sees a prominent Vote entry point on a published War
    Given a published War
    When an unauthenticated visitor navigates to its detail page
    Then a large, centered Vote entry point is shown

  Scenario: Tapping Vote as an anonymous visitor redirects to sign in
    Given a published War
    And an unauthenticated visitor viewing its detail page
    When they tap the Vote entry point
    Then they are redirected to sign in

  Scenario: An anonymous visitor sees no Vote entry point on a draft War
    Given a draft War
    When an unauthenticated visitor navigates to its detail page
    Then no Vote link is shown

  Scenario: The Vote entry point is a large, centered callout above the action row
    Given a published War the viewer created
    When they navigate to its detail page
    Then the Vote entry point is shown above Export, Edit, and Delete
    And it is visually larger than those buttons

  Scenario: The primary image is the display_order 0 item, regardless of array order
    Given a contestant whose images arrive out of display order
    When a visitor navigates to that War's detail page
    Then the contestant's primary image is the one with display order 0

  Scenario: A contestant's bio renders on the War detail page, but no attributes list -- even from a stale response that still carries a legacy attributes field
    Given a contestant whose response still carries a legacy attributes field
    When a visitor navigates to that War's detail page
    Then the contestant's bio is shown
    And no attributes list is shown

  Scenario: Paragraphs in a bio separated by a blank line render with visible vertical space
    Given a contestant whose bio has two paragraphs separated by a blank line
    When a visitor navigates to that War's detail page
    Then the paragraphs are separated by visible vertical space

  Scenario: An adversarial bio never executes and never renders as raw HTML
    Given a contestant whose bio contains script and HTML injection attempts
    When a visitor navigates to that War's detail page
    Then no script runs
    And the markup is shown as inert text rather than raw HTML

  Scenario: On a wide viewport, the results list is capped in width and centered
    Given a War with results
    When a visitor views its detail page on a wide viewport
    Then the results list is capped in width and centered

  Scenario: On a wide viewport, the wins/appearances/win-share group renders below the bio, not beside it
    Given a War with results
    When a visitor views its detail page on a wide viewport
    Then each result's statistics render below its bio

  Scenario: On a wide viewport, the poster renders beside the bio, not above it
    Given a War with results
    When a visitor views its detail page on a wide viewport
    Then each result's poster renders beside its bio

  Scenario: On a narrow but landscape viewport, the poster still renders beside the bio
    Given a War with results
    When a visitor views its detail page on a narrow landscape viewport
    Then each result's poster renders beside its bio

  Scenario: On a narrow portrait viewport under 900px, the poster still stacks above the bio
    Given a War with results
    When a visitor views its detail page on a narrow portrait viewport under 900px wide
    Then each result's poster stacks above its bio

  Scenario: There is visible space between the War's category and the first result
    Given a War with a category and results
    When a visitor navigates to that War's detail page
    Then there is visible space between the category and the first result

  Scenario: On a narrow viewport, a result's image is a large, prominent part of its card
    Given a War with results
    When a visitor views its detail page on a narrow viewport
    Then each result's image is a large, prominent part of its card

  Scenario: A long bio renders in full, with no truncation control
    Given a contestant with a very long bio
    When a visitor navigates to that War's detail page
    Then the whole bio is shown
    And no truncation control is offered

  Scenario: A creator sees Export on their own War's results page regardless of status
    Given the signed-in creator of a War of any status
    When they navigate to that War's detail page
    Then an Export button is shown

  Scenario: Clicking Export downloads a zip of the War definition
    Given the signed-in creator on their War's detail page
    When they click Export
    Then a zip of the War's definition is downloaded

  Scenario: A non-creator sees no Export button
    Given a signed-in voter who did not create a War
    When they navigate to that War's detail page
    Then no Export button is shown

  Scenario: The results-page action row lays out horizontally, shares consistent button styling, and sets Delete apart
    Given the signed-in creator on their War's detail page
    Then the action buttons sit in one horizontal row
    And they share consistent button styling
    And Delete is visually set apart from the others
