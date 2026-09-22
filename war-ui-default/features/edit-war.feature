Feature: Edit War

  Scenario: An active War shows a not-editable message, not the editor
    Given an authenticated voter navigates to the Edit page of a War that is no longer a draft
    Then they see a message that the War is no longer editable
    And no editing form is shown

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

  Scenario: Removing a contestant deletes it and returns to Metadata
    Given an authenticated voter viewing a contestant's editor
    When they remove the contestant
    Then it is deleted and no longer appears in the nav
    And the metadata form is shown

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

  Scenario: Export is available on the Edit page
    Given an authenticated voter viewing a draft War's Edit page
    Then an Export control is shown

  Scenario: Exporting downloads the draft War's definition
    Given an authenticated voter viewing a draft War's Edit page
    When they choose Export
    Then a zip file of the War's definition downloads

  Scenario: Deleting a draft asks for confirmation first
    Given an authenticated voter viewing a draft War's Edit page
    When they choose Delete
    Then a confirmation is shown
    And nothing is deleted yet

  Scenario: Confirming delete removes the draft and returns to My Wars
    Given an authenticated voter has asked to delete a draft War
    When they confirm
    Then the draft is deleted
    And they land on My Wars

  Scenario: Cancelling delete leaves the draft untouched
    Given an authenticated voter has asked to delete a draft War
    When they cancel
    Then the draft is not deleted
    And they remain on the Edit page

  Scenario: Activation requires at least two contestants
    Given a draft War with fewer than two contestants
    Then Activate is disabled
    And a message states what's missing

  Scenario: A contestant with no image does not block activation
    Given a draft War where a contestant has no image
    Then Activate is enabled

  Scenario: Activating asks for confirmation, since it is permanent
    Given a draft War ready to activate, with no unsaved edits
    When the voter chooses Activate
    Then a permanence warning is shown
    And activation does not happen yet

  Scenario: Cancelling the permanence warning leaves the draft untouched
    Given the permanence warning is shown
    When the voter cancels
    Then activation does not happen
    And they remain on the Edit page

  Scenario: Confirming activation activates the War and moves to voting
    Given the permanence warning is shown
    When the voter confirms
    Then the War activates
    And they land on its vote page

  Scenario: A failed activation shows the API's validation messages
    Given the voter confirms activation
    When activation is rejected
    Then the validation messages are shown
    And they remain on the Edit page

  Scenario: Activating with unsaved metadata edits asks whether to save or discard them first
    Given the voter has unsaved metadata edits
    When they choose Activate
    Then they are asked to save the edits, discard them, or cancel
    And activation does not happen yet

  Scenario: Cancelling that step leaves the draft untouched, edits intact
    Given that step is shown
    When the voter cancels
    Then the unsaved edits remain
    And activation does not happen

  Scenario: Discarding the edits proceeds to the permanence warning, then activates
    Given that step is shown
    When the voter discards the edits
    Then the permanence warning is shown
    And confirming it activates the War

  Scenario: Saving from that step saves the edits without activating
    Given that step is shown
    When the voter chooses to save
    Then the edits are persisted
    And activation does not happen
    And they remain on the Edit page
