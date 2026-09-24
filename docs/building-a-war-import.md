# Building a War Import File

This document is instructions for an AI assistant (Claude or similar) asked to **produce a
War import file** — a single `.zip` a user can upload through this app's existing **Import a
War** feature (My Wars → Import a War) to create a new draft War from raw material: a list of
contestants, facts about them, and (usually) photos.

This is **not** documentation of how the Import feature itself works internally, and this is
**not** a guide to building an import pipeline or calling the API. The Import feature already
exists and already works. Your job when given this task is narrower and more concrete:
gather what the user wants the War to contain, and assemble one correctly-shaped `.zip` file
they can hand to that existing feature. The deliverable is the file, not code, and not an API
call.

If anything here conflicts with [`war-spec.md`](../war-spec.md), the spec wins.

## Before you start: figure out what the War needs

Get this from the user, or reasonably infer it from what they've already told you:

- **Title** (can be left blank, but ask)
- **Category** — free text, optional (e.g. "Pageant", "Primary Election")
- **Visibility** — `public` or `invite_only`
- **Theme** — `arcade`, `fight_card`, or `scrapbook` (default to `arcade` if the user has no
  preference)
- **End date** — optional; omit if the War shouldn't close on its own
- **The contestants** — a name and, usually, a short bio for each. Any extra facts about a
  contestant (country, age, party, height, ...) belong in the bio's prose — there's no
  separate structured-field mechanism.
- **Photos** — one to ten per contestant. If the user hasn't supplied any and asks you to find
  or generate some, do that first and have the image files ready on disk before moving on.
- **Share image** — optional; a single 1200×630 image shown on the War's card and used as its
  link-preview thumbnail. Only include one if the user actually supplies or asks for one —
  don't invent a placeholder.

If the user's request is thin ("make a War for these 8 wrestlers"), it's fine to fill in
sensible defaults (public visibility, arcade theme, no end date) rather than interrogating them
over every field — but the contestant list and their names are never something to guess.

## What you're assembling

A `.zip` file containing:

- `war.json` at the root — the War's metadata and every contestant's data
- `media/<contestantId>/<mediaId>.<ext>` — one file per contestant photo, referenced by that
  exact path from `war.json`
- `share-image.<ext>` at the root — the War's share image, if there is one, referenced by
  `war.json`'s `share_image` field

`<contestantId>` and `<mediaId>` can be anything unique *within this file* — `c1`/`m1`, a
slugified name, whatever's convenient. They are not real database ids; the app assigns its own
when it imports the file. Their only job is keeping media paths unique and matching what
`war.json` points at.

## Step by step

### 1. Prepare each contestant's photos

For every contestant, gather one to ten images. Constraints the app enforces on the other end
— don't try to work around them, just make sure your files satisfy them:

- Format: JPEG, PNG, or WebP only. Convert anything else.
- At most 10 MB per file.
- At most 10 images per contestant.

Name each file with the extension that actually matches its real format (a JPEG must end
`.jpg`/`.jpeg`, a PNG `.png`, a WebP `.webp`) — this is checked from the file's bytes on
upload, not trusted from the name, but keeping them matched avoids confusing yourself while
building the zip.

### 2. Write `war.json`

```json
{
  "title": "Miss Universe 2026",
  "category": "Pageant",
  "visibility": "public",
  "theme": "arcade",
  "ends_at": null,
  "share_image": "share-image.jpg",
  "contestants": [
    {
      "name": "Ada",
      "bio": "A brilliant mathematician from the UK.",
      "media": [
        { "display_order": 0, "aspect_ratio": null, "path": "media/c1/m1.jpg" }
      ]
    }
  ]
}
```

Field notes:

- `title`, `category`, `ends_at` may be `null`.
- `visibility` must be exactly `"public"` or `"invite_only"`. `theme` must be exactly
  `"arcade"`, `"fight_card"`, or `"scrapbook"`. Don't invent other values.
- `share_image` is the path to the share image inside the zip, or `null`/omitted if there
  isn't one.
- Each contestant's `media` array lists its photos in display order, `display_order` starting
  at `0`. `aspect_ratio` can be `null` if you don't know it — it's not required. `path` must be
  the exact path you're using for that file inside the zip.
- Every `path` referenced anywhere in `war.json` (including `share_image`) must exist as a real
  file in the zip at that path, or the whole file is rejected.

### 3. Assemble the zip

Put `war.json` at the zip's root, every photo under `media/<contestantId>/<mediaId>.<ext>`,
and the share image (if there is one) at `share-image.<ext>` at the root, matching the paths
you wrote into `war.json`. In practice you'll do this with a short one-off script (Node's
`fflate`/`archiver`, Python's `zipfile`, or equivalent) that reads the prepared images and
writes the archive — that script is disposable tooling for this one task, not something to
hand back as a feature.

### 4. Check your own work before handing it over

- `war.json` is valid JSON.
- Every `contestants[].media[].path` exists as a real entry in the zip.
- If `share_image` is set, it exists as a real entry in the zip.
- `visibility` and `theme` are one of the exact allowed values above.
- No contestant has more than 10 images.
- Every image file is actually a JPEG, PNG, or WebP, and its extension matches.

### 5. Hand it off

Give the user the finished `.zip` and tell them: sign in, go to **My Wars**, choose **Import a
War**, and upload this file. It creates a new draft they own, which they can review, edit, add
or remove contestants and photos on, and publish whenever they're ready — importing never
touches whatever War (if any) the material originally came from.

## What not to do

- Don't call the API yourself or write code that talks to `POST /wars` and friends — the file
  is the deliverable, not a script that performs the import.
- Don't add fields to `war.json` beyond what's documented above.
- Don't guess at `visibility`/`theme` values outside their exact enums.
- Don't leave a `media[].path` dangling with no matching file in the zip, or vice versa.

## Ground truth, if you need more detail than this covers

This app's own Import feature validates and consumes exactly the file shape described above.
If some edge case isn't covered here, these are the authoritative source:

| File | What it shows |
|---|---|
| `war-ui-default/src/import/validateWarImport.ts` | Exactly what's required vs. optional in `war.json` |
| `war-ui-default/src/export/exportWar.ts` | The same shape, produced by this app's own Export |

---

© Tom Adams — [war on GitHub](https://github.com/tadams1138/war)
