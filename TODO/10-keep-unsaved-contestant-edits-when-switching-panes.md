# 10 — Keep unsaved contestant edits when switching panes

## Summary
Unsaved name and bio edits in a contestant's editor, and in the add-contestant form, are
discarded when the creator selects another pane. The War metadata form keeps its unsaved edits.

## Acceptance criteria
- Edit a contestant's name or bio, select another pane, come back: the unsaved edits remain.
- The same for the add-contestant form.

## Technical notes
- Components: `war-ui-default/src/pages/EditWar.tsx` (holds `selected`; renders the detail pane
  in `EditWarDetailPane` and `SelectedContestantEditor`), `src/editWar/EditWarContestant.tsx`,
  `src/editWar/AddContestantForm.tsx`, `src/editWar/useEditWar.ts`.
- How the metadata form does it (candidate approach): `EditWarDetailPane` always renders
  `EditWarMetadataForm` and only sets `hidden` on its wrapper, so the form's state survives.
  The contestant editor and add form are conditionally rendered (e.g. `selected === 'add'`),
  so they unmount. Candidates: hide instead of unmount (one mounted editor per contestant,
  heavier with many contestants), or lift the draft state into `useEditWar`, keyed by
  contestant id.
- Add a Gherkin scenario to `war-ui-default/features/edit-war.feature` first (steps in
  `tests/acceptance/steps/edit-war.steps.ts`).

## Open questions
- Whether to also warn on leaving unsaved edits.
