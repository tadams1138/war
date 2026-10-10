@edit-war
Feature: Edit War

  Scenario: Metadata is shown by default
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    When they open that War's Edit page
    Then the metadata form is shown
    And no contestant editor is shown

  Scenario: Selecting a contestant shows only its editor
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    Then only the editor of "Ada" is shown
    And the metadata form is hidden
    When they select "Grace" in the sections list
    Then only the editor of "Grace" is shown

  Scenario: Unsaved metadata edits survive switching to a contestant and back
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's Edit page
    When they change the title to "Unsaved Title"
    And they change the category to "Unsaved Category"
    And they select "Ada" in the sections list
    And they select "Metadata" in the sections list
    Then the title shows "Unsaved Title"
    And the category shows "Unsaved Category"

  Scenario: Switching contestants shows fresh field values, not a leftover selection
    Given a draft War
    And that War has contestants:
      | name  | bio       |
      | Ada   | Ada bio   |
      | Grace | Grace bio |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they change the contestant's name to "Ada X"
    And they change the contestant's bio to "Ada scratch bio"
    And they select "Grace" in the sections list
    Then the contestant's name shows "Grace"
    And the contestant's bio shows "Grace bio"

  Scenario: Removing a contestant with no votes deletes it immediately and returns to Metadata
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And the API accepts a request to remove the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select the "Remove contestant" button
    Then no confirmation is shown
    And the API has been asked to remove the contestant "Ada"
    And the sections list does not include "Ada"
    And no contestant editor is shown
    And the metadata form is shown

  Scenario: A failed contestant removal shows an error and keeps the contestant
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And the API fails a request to remove the contestant "Ada" with a server error
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select the "Remove contestant" button
    Then an error is shown for the request to remove the contestant "Ada"
    And the sections list includes "Ada"

  Scenario: Removing a contestant with votes asks for confirmation, naming how many votes will be lost
    Given a published War
    And that War has contestants:
      | name  | votes |
      | Ada   | 3     |
      | Grace | 0     |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select the "Remove contestant" button
    Then a confirmation is shown
    And the confirmation says "3 votes"
    And nothing has been removed

  Scenario: Confirming removal of a contestant with votes deletes it
    Given a published War
    And that War has contestants:
      | name  | votes |
      | Ada   | 3     |
      | Grace | 0     |
    And the API accepts a request to remove the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select the "Remove contestant" button
    And they confirm
    Then the API has been asked to remove the contestant "Ada"
    And the sections list does not include "Ada"

  Scenario: Cancelling removal of a contestant with votes leaves it untouched
    Given a published War
    And that War has contestants:
      | name  | votes |
      | Ada   | 3     |
      | Grace | 0     |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select the "Remove contestant" button
    And they cancel
    Then no confirmation is shown
    And the sections list includes "Ada"
    And nothing has been removed

  Scenario: Adding a contestant adds it to the navigation and selects it
    Given a draft War
    And the API accepts a request to add a contestant
    And an authenticated voter
    And they are on that War's Edit page
    When they select "+ Add contestant" in the sections list
    And they change the new contestant's name to "Mae"
    And they select the "Add contestant" button
    Then the sections list includes "Mae"
    And only the editor of "Mae" is shown

  Scenario: Adding a contestant with a blank name is rejected client-side
    Given a draft War
    And an authenticated voter
    And they are on that War's Edit page
    When they select "+ Add contestant" in the sections list
    And they select the "Add contestant" button
    Then the message "Name is required" is shown
    And the API has not been asked to add a contestant

  Scenario: Saving metadata confirms with a toast that disappears on its own
    Given a draft War
    And the API accepts a request to save that War's details
    And an authenticated voter
    And they are on that War's Edit page
    When they change the title to "New Title"
    And they select the "Save" button
    Then the API has been asked to save that War's details with:
      | title | New Title |
    And a toast says "War details saved"
    And the toast disappears on its own

  Scenario: A blank title shows a validation error
    Given a draft War
    And an authenticated voter
    And they are on that War's Edit page
    When they change the title to ""
    And they select the "Save" button
    Then the message "Title is required" is shown

  Scenario: Metadata remains editable on a published War
    Given a published War
    And the API accepts a request to save that War's details
    And an authenticated voter
    And they are on that War's Edit page
    When they change the title to "New Title"
    And they select the "Save" button
    Then the API has been asked to save that War's details with:
      | title | New Title |

  Scenario: Saving a contestant shows a success toast
    Given a draft War
    And that War has contestants:
      | name | bio     |
      | Ada  | Old bio |
    And the API accepts a request to save the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they change the contestant's name to "Ada Lovelace"
    And they change the contestant's bio to "New bio"
    And they select the "Save" button
    Then the API has been asked to save the contestant "Ada" with:
      | contestant's name | Ada Lovelace |
      | contestant's bio  | New bio      |
    And a toast says "Contestant saved"

  Scenario: The bio toolbar wraps selected text in bold markdown syntax
    Given a draft War
    And that War has contestants:
      | name | bio         |
      | Ada  | hello world |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select "hello" in the contestant's bio
    And they select the "Bold" button
    Then the contestant's bio shows "**hello** world"

  Scenario: A heading toolbar button inserts a markdown heading, rendered live
    Given a draft War
    And that War has contestants:
      | name | bio           |
      | Ada  | Section title |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they select "Section title" in the contestant's bio
    And they select the "Heading 2" button
    Then the contestant's bio shows "## Section title"
    And the bio preview shows the level-2 heading "Section title"

  Scenario: The bio preview updates live as the bio changes, with no save required
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they change the contestant's bio to "*emphasis*"
    Then the bio preview shows "emphasis" emphasised

  Scenario: The bio editor links to the markdown syntax reference
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    Then a link to the markdown syntax reference is shown

  Scenario: The bio preview renders lists and a visibly distinct, underlined link
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they change the contestant's bio to:
      """
      - one
      - two

      1. first
      2. second

      [link](https://example.com)
      """
    Then the bio preview shows a bulleted list of 2 items
    And the bio preview shows a numbered list of 2 items
    And the bio preview shows the link "link", underlined unlike the text around it

  Scenario: A contestant with fewer than the image cap still shows a control to add more
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 1      |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    Then a control to add an image is shown

  Scenario: Adding an image shows it alongside the existing ones, in order
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 1      |
    And the API accepts a request to add an image to the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they add an image
    Then the gallery shows the first image then the second

  Scenario: A failed image upload shows an error
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And the API rejects a request to add an image to the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they add an image
    Then an error is shown for the request to add an image to the contestant "Ada"

  Scenario: Rate-limited image upload is shown as a wait, not an error
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And the API rate limits a request to add an image to the contestant "Ada" for 1 second
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they add an image
    Then a wait is shown, using the supplied delay, not an error
    And the add-image control re-enables on its own once the delay passes

  Scenario: Removing an image drops it from the gallery
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 2      |
    And the API accepts a request to remove the first image of the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they remove the first image
    Then the gallery shows only the second image

  Scenario: A failed image removal shows an error and keeps the image
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 2      |
    And the API fails a request to remove the first image of the contestant "Ada" with a server error
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they remove the first image
    Then an error is shown for the request to remove the first image of the contestant "Ada"
    And the gallery shows the first image then the second

  Scenario: A failed image reorder shows an error
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 2      |
    And the API fails a request to move up the second image of the contestant "Ada" with a server error
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they move up the second image
    Then an error is shown for the request to move up the second image of the contestant "Ada"

  Scenario: Reordering images persists the new order
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 2      |
    And the API accepts a request to move up the second image of the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they move up the second image
    Then the gallery shows the second image then the first
    And the API has been asked to move up the second image of the contestant "Ada"

  Scenario: At the per-contestant image cap, the add-more control is replaced by an explanation
    Given a draft War
    And that War has contestants:
      | name | images |
      | Ada  | 10     |
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    Then no control to add an image is shown
    And the message "Maximum of 10 images reached" is shown

  Scenario: Images remain editable on a published War
    Given a published War
    And that War has contestants:
      | name |
      | Ada  |
    And the API accepts a request to add an image to the contestant "Ada"
    And an authenticated voter
    And they are on that War's Edit page
    When they select "Ada" in the sections list
    And they add an image
    Then the API has been asked to add an image to the contestant "Ada"

  Scenario: Export is available on the Edit page
    Given a draft War
    And an authenticated voter
    When they open that War's Edit page
    Then the "Export" button is shown

  Scenario: Clicking Export downloads a zip of the draft War definition
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Export" button
    Then a zip of that War's definition downloads

  Scenario: Clicking Delete asks for confirmation before removing the War
    Given a draft War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Delete" button
    Then a confirmation is shown
    And the API has not been asked to delete that War

  Scenario: Confirming delete removes the War and returns to My Wars
    Given a draft War
    And the API accepts a request to delete that War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Delete" button
    And they confirm
    Then the API has been asked to delete that War
    And My Wars is shown

  Scenario: Cancelling delete leaves the War untouched
    Given a draft War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Delete" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to delete that War
    And that War's Edit page is shown

  Scenario: Deleting a published War works the same as deleting a draft
    Given a published War
    And the API accepts a request to delete that War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Delete" button
    And they confirm
    Then the API has been asked to delete that War
    And My Wars is shown

  Scenario: Publish is disabled with fewer than two contestants
    Given a draft War
    And that War has contestants:
      | name |
      | Ada  |
    And an authenticated voter
    When they open that War's Edit page
    Then the "Publish War" button is disabled
    And the message "To publish this War, add at least 2 contestants." is shown

  Scenario: A contestant with no image does not block publishing
    Given a draft War
    And that War has contestants:
      | name  | images |
      | Ada   | 0      |
      | Grace | 1      |
    And an authenticated voter
    When they open that War's Edit page
    Then the "Publish War" button is enabled
    And the message "To publish this War, add at least 2 contestants." is not shown

  Scenario: Publishing asks for confirmation, naming that the War becomes reachable by anyone
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Publish War" button
    Then a confirmation is shown
    And the confirmation says "reachable by anyone"
    And the API has not been asked to publish that War

  Scenario: Cancelling the publish confirmation leaves the draft untouched
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Publish War" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to publish that War
    And that War's Edit page is shown

  Scenario: Confirming publish publishes the War and moves to voting
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And the API accepts a request to publish that War
    And that War has a matchup to vote on
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Publish War" button
    And they confirm
    Then the API has been asked to publish that War
    And that War's vote page is shown

  Scenario: A failed publish shows the API's validation messages
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And the API rejects a request to publish that War, saying "every contestant needs media"
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Publish War" button
    And they confirm
    Then the message "every contestant needs media" is shown
    And that War's Edit page is shown

  Scenario: Unpublishing a published War asks for confirmation, naming that it becomes reachable only by them
    Given a published War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Unpublish War" button
    Then a confirmation is shown
    And the confirmation says "reachable only by you"
    And the API has not been asked to unpublish that War

  Scenario: Confirming unpublish returns the War to draft and stays on the Edit page
    Given a published War
    And the API accepts a request to unpublish that War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Unpublish War" button
    And they confirm
    Then the "Publish War" button is shown
    And that War's Edit page is shown

  Scenario: A closed War offers neither Publish nor Unpublish, and explains why
    Given a closed War
    And an authenticated voter
    When they open that War's Edit page
    Then the "Publish War" button is hidden
    And the "Unpublish War" button is hidden
    And the message "This War has closed and can no longer be published or unpublished." is shown

  Scenario: Clear Votes is available in any status
    Given a draft War
    And an authenticated voter
    When they open that War's Edit page
    Then the "Clear Votes" button is shown

  Scenario: Clicking Clear Votes asks for confirmation
    Given a published War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Clear Votes" button
    Then a confirmation is shown
    And the confirmation says "deletes every vote cast in this War"
    And the confirmation says "counters to zero"
    And the API has not been asked to clear the votes of that War

  Scenario: Confirming Clear Votes clears every vote and shows a success toast
    Given a published War
    And the API accepts a request to clear the votes of that War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Clear Votes" button
    And they confirm
    Then the API has been asked to clear the votes of that War
    And a toast says "Votes cleared"

  Scenario: Cancelling Clear Votes leaves votes untouched
    Given a published War
    And an authenticated voter
    And they are on that War's Edit page
    When they select the "Clear Votes" button
    And they cancel
    Then no confirmation is shown
    And the API has not been asked to clear the votes of that War

  Scenario: Changing the title persists it
    Given a draft War
    And the API accepts a request to save that War's details
    And an authenticated voter
    And they are on that War's Edit page
    When they change the title to "New Title"
    And they select the "Save" button
    Then the title shows "New Title"
    And the API has been asked to save that War's details with:
      | title | New Title |

  Scenario: Changing visibility to unlisted persists
    Given a draft War
    And the API accepts a request to save that War's details
    And an authenticated voter
    And they are on that War's Edit page
    When they change the visibility to "Unlisted"
    And they select the "Save" button
    Then the API has been asked to save that War's details with:
      | visibility | Unlisted |

  Scenario: The unlisted visibility option explains itself
    Given a draft War
    And an authenticated voter
    When they open that War's Edit page
    Then the visibility offers "Unlisted"
    And the visibility hint says "Unlisted: hidden from public lists; anyone with the link can view and vote"

  Scenario: Changing the theme persists it
    Given a draft War
    And the API accepts a request to save that War's details
    And an authenticated voter
    And they are on that War's Edit page
    When they change the theme to "Fight Card"
    And they select the "Save" button
    Then the API has been asked to save that War's details with:
      | theme | Fight Card |

  Scenario: Delete button is shown on the edit page
    Given a draft War
    And an authenticated voter
    When they open that War's Edit page
    Then the "Delete" button is shown

  Scenario: The top action row lays out horizontally, shares consistent button styling, and sets Delete apart
    Given a draft War
    And that War has contestants:
      | name  |
      | Ada   |
      | Grace |
    And an authenticated voter
    When they open that War's Edit page
    Then Export, Delete, Publish War and Clear Votes sit in one horizontal row, in that order
    And Export, Publish War and Clear Votes share consistent button styling
    And Delete is visually set apart from Export, Publish War and Clear Votes
