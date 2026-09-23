Feature: Edit War

  Scenario: Metadata is shown by default
    Given an authenticated voter viewing a draft War's Edit page
    Then the metadata form is shown
    And no contestant editor is shown

  Scenario: Selecting a contestant shows only its editor
    Given an authenticated voter viewing a draft War's Edit page with two contestants
    When they select a contestant from the nav
    Then only that contestant's editor is shown, not the metadata form
    When they select a different contestant
    Then only the newly selected contestant's editor is shown

  Scenario: Switching contestants shows fresh field values, not a leftover selection
    Given an authenticated voter has made unsaved edits to one contestant's name and bio
    When they switch to a different contestant
    Then that contestant's own name and bio are shown, not the previous edits

  Scenario: Removing a contestant with no votes deletes it immediately and returns to Metadata
    Given an authenticated voter viewing the editor of a contestant with no votes
    When they remove the contestant
    Then it is deleted and no longer appears in the nav
    And the metadata form is shown

  Scenario: Removing a contestant with votes asks for confirmation, naming what will be lost
    Given an authenticated voter viewing the editor of a contestant with votes
    When they choose to remove the contestant
    Then a confirmation is shown naming how many votes will be lost
    And nothing is removed yet

  Scenario: Confirming removal of a contestant with votes deletes it
    Given a contestant-with-votes removal confirmation is shown
    When the voter confirms
    Then it is deleted and no longer appears in the nav

  Scenario: Cancelling removal of a contestant with votes leaves it untouched
    Given a contestant-with-votes removal confirmation is shown
    When the voter cancels
    Then the contestant is not removed

  Scenario: Adding a contestant selects it immediately
    Given an authenticated voter on a draft War's Edit page
    When they add a new contestant with a name
    Then it appears in the nav and its editor is shown

  Scenario: Adding a contestant with a blank name is rejected client-side
    Given an authenticated voter adding a new contestant
    When they submit without a name
    Then a validation error is shown
    And no request is sent

  Scenario: Changing metadata persists it and confirms with a toast
    Given an authenticated voter viewing a draft War's Metadata form
    When they change the title, visibility, or theme and save
    Then the change is persisted
    And a success toast appears and disappears on its own

  Scenario: A metadata save failure shows a validation error
    Given an authenticated voter clears the title and saves
    Then a validation error is shown

  Scenario: Metadata remains editable on a published War
    Given an authenticated voter viewing a published War's Edit page
    When they change the title and save
    Then the change is persisted

  Scenario: Changing a contestant's name and bio persists both, confirmed by a toast
    Given an authenticated voter editing a contestant
    When they change its name and bio and save
    Then both changes are persisted
    And a success toast appears

  Scenario: The bio toolbar wraps selected text in markdown syntax
    Given an authenticated voter editing a contestant's bio
    When they select text and choose Bold from the toolbar
    Then the selection is wrapped in bold markdown syntax

  Scenario: A heading toolbar button inserts a markdown heading, rendered live
    Given an authenticated voter editing a contestant's bio
    When they select text and choose a heading level from the toolbar
    Then the bio gains that heading's markdown syntax
    And the live preview renders it as a heading

  Scenario: The bio preview updates live as the bio changes, with no save required
    Given an authenticated voter editing a contestant's bio
    When they type formatted text
    Then the live preview reflects it immediately

  Scenario: The bio editor links to the markdown syntax reference
    Given an authenticated voter editing a contestant's bio
    Then a link to the markdown syntax reference is shown

  Scenario: The bio preview renders lists and links with visible styling
    Given an authenticated voter enters bulleted, numbered, and linked text in a bio
    Then the preview renders real list markup and a visibly distinct, underlined link

  Scenario: A contestant with fewer than the image cap still shows a control to add more
    Given an authenticated voter editing a contestant with one image
    Then a control to add another image is shown

  Scenario: Adding an image shows it alongside the existing ones, in order
    Given an authenticated voter editing a contestant with one image
    When they add a second image
    Then both images are shown, in order

  Scenario: A failed image upload shows an error
    Given an authenticated voter editing a contestant
    When they add an image and the upload fails
    Then an error is shown

  Scenario: Rate-limited image upload is shown as a wait, not an error
    Given an authenticated voter editing a contestant
    When they add an image and the request is rate limited
    Then a wait is shown, using the supplied delay, not an error
    And the add-image control re-enables on its own once the delay passes

  Scenario: Removing an image drops it from the gallery
    Given an authenticated voter editing a contestant with two images
    When they remove one
    Then only the remaining image is shown

  Scenario: Reordering images persists the new order
    Given an authenticated voter editing a contestant with two images
    When they move the second image up
    Then the gallery reflects the new order
    And the new order is persisted

  Scenario: At the per-contestant image cap, the add-more control is replaced by an explanation
    Given an authenticated voter editing a contestant with the maximum number of images
    Then no control to add more images is shown
    And an explanation of the cap is shown

  Scenario: Images remain editable on a published War
    Given an authenticated voter editing a contestant on a published War
    When they add an image
    Then it is uploaded

  Scenario: Export is available on the Edit page
    Given an authenticated voter viewing a draft War's Edit page
    Then an Export control is shown

  Scenario: Exporting downloads the draft War's definition
    Given an authenticated voter viewing a draft War's Edit page
    When they choose Export
    Then a zip file of the War's definition downloads

  Scenario: Deleting a War asks for confirmation first
    Given an authenticated voter viewing a draft War's Edit page
    When they choose Delete
    Then a confirmation is shown
    And nothing is deleted yet

  Scenario: Confirming delete removes the War and returns to My Wars
    Given an authenticated voter has asked to delete a draft War
    When they confirm
    Then the War is deleted
    And they land on My Wars

  Scenario: Cancelling delete leaves the War untouched
    Given an authenticated voter has asked to delete a draft War
    When they cancel
    Then the War is not deleted
    And they remain on the Edit page

  Scenario: Deleting a published War works the same as deleting a draft
    Given an authenticated voter viewing a published War's Edit page
    When they delete it and confirm
    Then the War is deleted

  Scenario: Publish requires at least two contestants
    Given a draft War with fewer than two contestants
    Then Publish War is disabled
    And a message states what's missing

  Scenario: A contestant with no image does not block publishing
    Given a draft War where a contestant has no image
    Then Publish War is enabled

  Scenario: Publishing asks for confirmation
    Given a draft War ready to publish
    When the voter chooses Publish War
    Then a confirmation is shown, naming that it becomes reachable by anyone
    And publishing does not happen yet

  Scenario: Cancelling the publish confirmation leaves the draft untouched
    Given the publish confirmation is shown
    When the voter cancels
    Then publishing does not happen
    And they remain on the Edit page

  Scenario: Confirming publish publishes the War and moves to voting
    Given the publish confirmation is shown
    When the voter confirms
    Then the War is published
    And they land on its vote page

  Scenario: A failed publish shows the API's validation messages
    Given the voter confirms publishing
    When publishing is rejected
    Then the validation messages are shown
    And they remain on the Edit page

  Scenario: Unpublishing a published War asks for confirmation
    Given an authenticated voter viewing a published War's Edit page
    When they choose Unpublish War
    Then a confirmation is shown, naming that it becomes reachable only by them
    And unpublishing does not happen yet

  Scenario: Confirming unpublish returns the War to draft
    Given the unpublish confirmation is shown
    When the voter confirms
    Then the War becomes a draft
    And they remain on the Edit page

  Scenario: A closed War offers neither Publish nor Unpublish
    Given an authenticated voter viewing a closed War's Edit page
    Then no Publish or Unpublish control is shown
    And a note explains the War has closed

  Scenario: Clear Votes is available in any status
    Given an authenticated voter viewing a draft War's Edit page
    Then a Clear Votes control is shown

  Scenario: Clicking Clear Votes asks for confirmation
    Given an authenticated voter viewing a published War's Edit page
    When they choose Clear Votes
    Then a confirmation is shown naming that every vote and counter resets
    And votes are not cleared yet

  Scenario: Confirming Clear Votes clears every vote
    Given the Clear Votes confirmation is shown
    When the voter confirms
    Then every vote in the War is cleared
    And a success toast appears

  Scenario: Cancelling Clear Votes leaves votes untouched
    Given the Clear Votes confirmation is shown
    When the voter cancels
    Then votes are not cleared
