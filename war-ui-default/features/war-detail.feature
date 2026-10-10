@war-detail
Feature: War Detail

  War detail is one page (war-spec.md 10.1, 10.4): a single results list, ordered
  by rank, where each row carries that contestant's image, name, bio, wins, and
  appearances together. There is no separate contestant gallery and no separate
  "Results" section — one merged list is the whole page.

  Scenario: War overview loads with its results
    Given a published War
    And that War has contestants:
      | name  | rank | wins | appearances |
      | Ada   | 1    | 2    | 2           |
      | Grace | 2    | 1    | 2           |
      | Mae   | 3    | 0    | 2           |
    When a visitor opens that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the message "Pageant" is shown
    And the results list shows, in order:
      | name  |
      | Ada   |
      | Grace |
      | Mae   |
    And each result shows an image

  Scenario: The War detail page requires no authentication
    Given a published War
    And that War has contestants:
      | name |
      | Ada  |
    When a visitor opens that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the results list shows, in order:
      | name |
      | Ada  |

  Scenario: A War that doesn't exist shows a not-found message
    Given no War exists
    When a visitor opens that War's detail page
    Then the message "This War doesn't exist or has been removed" is shown

  Scenario: A contestant's formatted bio renders inline with their result
    Given a published War
    And that War has contestants:
      | name | bio                                                                                      |
      | Ada  | A **brilliant** mathematician.\n\n- Loves *logic*\n- [Her work](https://example.test/ada) |
    When a visitor opens that War's detail page
    Then the bio of "Ada" shows "brilliant" in bold
    And the bio of "Ada" shows "logic" emphasised
    And the bio of "Ada" shows a bulleted list of 2 items
    And the bio of "Ada" links "Her work" to "https://example.test/ada"

  Scenario: A contestant with multiple images is browsable in place
    Given a published War
    And that War has contestants:
      | name | images |
      | Ada  | 3      |
    When a visitor opens that War's detail page
    Then the result of "Ada" offers paging controls
    And the result of "Ada" shows image 1
    When they click the next-image arrow on the result of "Ada"
    Then the result of "Ada" shows image 2
    And that War's detail page is shown

  Scenario: A contestant with no media shows no image at all
    Given a published War
    And that War has contestants:
      | name | images |
      | Ada  | 0      |
    When a visitor opens that War's detail page
    Then the result of "Ada" shows no image and no placeholder

  Scenario: The detail page shows results with rank, image, wins, appearances, and a win-share bar
    Given a published War
    And that War has contestants:
      | name           | rank | wins | appearances |
      | Contestant One | 1    | 10   | 12          |
      | Contestant Two | 2    | 8    | 12          |
    When a visitor opens that War's detail page
    Then the results list shows, in order:
      | rank | name           | wins | appearances | win bar |
      | 1    | Contestant One | 10   | 12          | 100%    |
      | 2    | Contestant Two | 8    | 12          | 80%     |
    And each result shows an image
    And the result of "Contestant One" shows image 1
    And no win percentage is displayed anywhere

  Scenario: The UI renders results in the order and ranks the API returns
    Given a published War
    And that War has contestants:
      | name         | rank | wins | appearances |
      | Contestant B | 2    | 5    | 9           |
      | Contestant A | 1    | 9    | 9           |
    When a visitor opens that War's detail page
    Then the results list shows, in order:
      | rank | name         |
      | 2    | Contestant B |
      | 1    | Contestant A |

  Scenario: Unranked contestants are shown at the bottom of results
    Given a published War
    And that War has contestants:
      | name         | rank | wins | appearances |
      | Contestant A | 1    | 5    | 6           |
      | Contestant C |      | 0    | 0           |
    When a visitor opens that War's detail page
    Then the results list shows, in order:
      | rank | name         |
      | 1    | Contestant A |
      | —    | Contestant C |

  Scenario: Results poll while the War is published
    Given the clock is controlled
    And a published War
    And that War has contestants:
      | name         | wins | appearances |
      | Contestant A | 5    | 6           |
    And the next poll of that War's results shows:
      | name         | wins | appearances |
      | Contestant A | 6    | 7           |
    And they are on that War's detail page
    When 30 seconds elapse
    Then that War's results were requested 2 times
    And the results list shows, in order:
      | name         | wins | appearances |
      | Contestant A | 6    | 7           |

  Scenario: A failed results poll keeps the last loaded leaderboard on screen
    Given the clock is controlled
    And a published War
    And that War has contestants:
      | name         | wins | appearances |
      | Contestant A | 5    | 6           |
    And the next poll of that War's results fails
    And the next poll of that War's results shows:
      | name         | wins | appearances |
      | Contestant A | 9    | 10          |
    And they are on that War's detail page
    When 30 seconds elapse
    Then the results list shows, in order:
      | name         | wins | appearances |
      | Contestant A | 5    | 6           |
    And no error message is shown
    When 30 seconds elapse
    Then the results list shows, in order:
      | name         | wins | appearances |
      | Contestant A | 9    | 10          |
    And that War's results were requested 3 times

  Scenario: The leaderboard recovers once a later results poll succeeds
    Given the clock is controlled
    And a published War
    And that War has contestants:
      | name         | wins | appearances |
      | Contestant A | 5    | 6           |
    And the next poll of that War's results fails
    And the next poll of that War's results shows:
      | name         | wins | appearances |
      | Contestant A | 9    | 10          |
    And they are on that War's detail page
    When 30 seconds elapse
    And 30 seconds elapse
    Then the results list shows, in order:
      | name         | wins | appearances |
      | Contestant A | 9    | 10          |

  Scenario: Results do not poll once the War is closed
    Given the clock is controlled
    And a closed War
    And that War has contestants:
      | name         | wins | appearances |
      | Contestant A | 5    | 6           |
    And they are on that War's detail page
    When 30 seconds elapse
    Then that War's results were requested 1 time

  Scenario: A completed vote flow redirects to the War's results
    Given a published War
    And that War has a matchup to vote on
    And that matchup is the last one the voter has to decide
    And the API accepts votes
    And an authenticated voter
    And they are on that War's vote page
    When they vote for "Left Contestant"
    Then they are redirected to that War's detail page
    And the message "You’ve voted on every matchup — thank you!" is shown
    And the results list shows, in order:
      | name           |
      | Contestant One |
      | Contestant Two |

  Scenario: The completion notice is shown to a voter who has finished voting
    Given a published War
    And the voter has voted on 3 of 3 matchups in that War
    And an authenticated voter
    When they open that War's detail page
    Then the message "You’ve voted on every matchup — thank you!" is shown

  Scenario: The completion notice is not shown to a voter who hasn't finished voting
    Given a published War
    And the voter has voted on 1 of 3 matchups in that War
    And an authenticated voter
    When they open that War's detail page
    Then the voter's progress in that War was requested 1 time
    And the message "You’ve voted on every matchup — thank you!" is not shown

  Scenario: The completion notice is not shown to an anonymous visitor
    Given a published War
    When a visitor opens that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the message "You’ve voted on every matchup — thank you!" is not shown

  Scenario Outline: A War's creator sees Edit and Delete on its results page, in any status
    Given a <status> War
    And the voter created that War
    And an authenticated voter
    When they open that War's detail page
    Then the "Edit" link is shown
    And the "Delete" button is shown

    Examples:
      | status    |
      | draft     |
      | published |
      | closed    |

  Scenario: A non-creator sees no Edit or Delete on a War's results page
    Given a published War
    When a visitor opens that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the "Edit" link is hidden
    And the "Delete" button is hidden

  Scenario: Delete from the results page asks for confirmation before removing the War
    Given a draft War
    And the voter created that War
    And an authenticated voter
    And they are on that War's detail page
    When they select the "Delete" button
    Then a confirmation is shown
    And nothing has been removed

  Scenario: Confirming delete removes the War and returns to My Wars
    Given a draft War
    And the voter created that War
    And the API accepts a request to delete that War
    And an authenticated voter
    And they are on that War's detail page
    When they select the "Delete" button
    And they confirm
    Then the API has been asked to delete that War
    And they are redirected to My Wars

  Scenario: Cancelling delete leaves the War untouched
    Given a draft War
    And the voter created that War
    And an authenticated voter
    And they are on that War's detail page
    When they select the "Delete" button
    And they cancel
    Then no confirmation is shown
    And nothing has been removed
    And that War's detail page is shown

  Scenario: An authenticated voter who hasn't finished voting sees a Vote entry point
    Given a published War
    And the voter has voted on 1 of 3 matchups in that War
    And an authenticated voter
    When they open that War's detail page
    Then the "Vote" link is shown

  Scenario: A voter who has finished voting sees no Vote entry point
    Given a published War
    And the voter has voted on 3 of 3 matchups in that War
    And an authenticated voter
    When they open that War's detail page
    Then the voter's progress in that War was requested 1 time
    And the "Vote" link is hidden

  Scenario: An anonymous visitor sees a prominent Vote entry point on a published War
    Given a published War
    When a visitor opens that War's detail page
    Then the "Vote" link is shown
    And the "Vote" link is centered on the page
    And the "Vote" link is larger than an ordinary button

  Scenario: Tapping Vote as an anonymous visitor redirects to sign in
    Given a published War
    And they are on that War's detail page
    When they select the "Vote" link
    Then they are redirected to the login page with returnTo that War's vote page

  Scenario: An anonymous visitor sees no Vote entry point on a draft War
    Given a draft War
    When a visitor opens that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the "Vote" link is hidden

  Scenario: The Vote entry point is a large, centered callout above the action row
    Given a published War
    And the voter created that War
    And the voter has voted on 1 of 3 matchups in that War
    And an authenticated voter
    When they open that War's detail page
    Then the "Vote" link is above Export, Edit and Delete
    And the "Vote" link is centered on the page
    And the "Vote" link is larger than an ordinary button

  Scenario: The primary image is the display_order 0 item, regardless of array order
    Given a published War
    And that War has contestants:
      | name | images |
      | Ada  | 2      |
    And the images of "Ada" arrive out of display order
    When a visitor opens that War's detail page
    Then the result of "Ada" shows image 1

  Scenario: A contestant's bio renders on the War detail page, but no attributes list -- even from a stale response that still carries a legacy attributes field
    Given a published War
    And that War has contestants:
      | name | bio                        |
      | Ada  | A brilliant mathematician. |
    And the API still sends "Ada" a legacy attributes field
    When a visitor opens that War's detail page
    Then the bio of "Ada" says "A brilliant mathematician."
    And no attributes list is shown

  Scenario: Paragraphs in a bio separated by a blank line render with visible vertical space
    Given a published War
    And that War has contestants:
      | name | bio                                |
      | Ada  | First paragraph.\n\nSecond paragraph. |
    When a visitor opens that War's detail page
    Then the bio of "Ada" separates its paragraphs with visible vertical space

  Scenario: An adversarial bio never executes and never renders as raw HTML
    Given a published War
    And that War has contestants:
      | name | bio                                                                                          |
      | Ada  | hello<script>window.__pwned = true</script>world<img src=x onerror="window.__pwned = true"> |
    When a visitor opens that War's detail page
    Then no script runs
    And the bio of "Ada" renders none of its markup as a script, an image or an event handler

  Scenario: On a wide viewport, the results list is capped in width and centered
    Given a wide screen
    And a published War
    And that War has contestants:
      | name | bio                        | wins | appearances |
      | Ada  | A brilliant mathematician. | 1    | 1           |
    When a visitor opens that War's detail page
    Then the results list is capped in width and centered

  Scenario: On a wide viewport, the wins/appearances/win-share group renders below the bio, not beside it
    Given a wide screen
    And a published War
    And that War has contestants:
      | name | bio                        | wins | appearances |
      | Ada  | A brilliant mathematician. | 1    | 1           |
    When a visitor opens that War's detail page
    Then each result's statistics render below its bio

  Scenario: On a wide viewport, the poster renders beside the bio, not above it
    Given a wide screen
    And a published War
    And that War has contestants:
      | name | bio                        | wins | appearances |
      | Ada  | A brilliant mathematician. | 1    | 1           |
    When a visitor opens that War's detail page
    Then each result's poster renders beside its bio

  Scenario: On a narrow but landscape viewport, the poster still renders beside the bio
    Given a narrow landscape screen
    And a published War
    And that War has contestants:
      | name | bio                        | wins | appearances |
      | Ada  | A brilliant mathematician. | 1    | 1           |
    When a visitor opens that War's detail page
    Then each result's poster renders beside its bio

  Scenario: On a narrow portrait viewport under 900px, the poster still stacks above the bio
    Given a narrow portrait screen
    And a published War
    And that War has contestants:
      | name | bio                        | wins | appearances |
      | Ada  | A brilliant mathematician. | 1    | 1           |
    When a visitor opens that War's detail page
    Then each result's poster stacks above its bio

  Scenario: There is visible space between the War's category and the first result
    Given a published War
    And that War has contestants:
      | name | wins | appearances |
      | Ada  | 1    | 1           |
    When a visitor opens that War's detail page
    Then there is visible space between the category and the first result

  Scenario: On a narrow viewport, a result's image is a large, prominent part of its card
    Given a phone screen
    And a published War
    And that War has contestants:
      | name | wins | appearances |
      | Ada  | 1    | 1           |
    When a visitor opens that War's detail page
    Then each result's image is a large, prominent part of its card

  Scenario: A long bio renders in full, with no truncation control
    Given a published War
    And that War has contestants:
      | name | bio                                                                                                                                                                  |
      | Ada  | Luke Skywalker leads a mission to rescue his friend Han Solo from the clutches of Jabba the Hutt, while the Emperor prepares to crush the Rebellion with a more powerful Death Star. |
    When a visitor opens that War's detail page
    Then the bio of "Ada" says "Death Star"
    And no truncation control is offered

  Scenario Outline: A creator sees Export on their own War's results page regardless of status
    Given a <status> War
    And the voter created that War
    And an authenticated voter
    When they open that War's detail page
    Then the "Export" button is shown

    Examples:
      | status    |
      | draft     |
      | published |
      | closed    |

  Scenario: Clicking Export downloads a zip of the War definition
    Given a draft War
    And the voter created that War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's detail page
    When they select the "Export" button
    Then a zip of that War's definition downloads

  Scenario: A non-creator sees no Export button
    Given a published War
    And an authenticated voter
    When they open that War's detail page
    Then the heading "Miss Universe 2026" is shown
    And the "Export" button is hidden

  Scenario: The results-page action row lays out horizontally, shares consistent button styling, and sets Delete apart
    Given a draft War
    And the voter created that War
    And an authenticated voter
    When they open that War's detail page
    Then Edit, Delete and Export sit in one horizontal row, in that order
    And Edit and Export share consistent button styling
    And Delete is visually set apart from Edit and Export
