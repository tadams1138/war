# Building a War Import Feature

This document is instructions for an AI coding assistant (Claude or similar) tasked with
building an **Import** feature for a War client that doesn't have one yet — most likely
`war-ui-custom` (not built as of this writing; see the repo root [`README.md`](../README.md))
or a brand-new client written in a different stack entirely. It is deliberately
implementation-agnostic: nothing here assumes React, TypeScript, or any particular HTTP
library. Where a concrete example is useful, it points at `war-ui-default`'s working
implementation as a reference, not as something to copy line for line.

If anything here conflicts with [`specs/war-spec.md`](../specs/war-spec.md), the spec wins —
that document is the contract, this one is a build guide.

## What Import does (the contract)

From `specs/war-spec.md` §10.4:

> **Import** reverses Export. Given a previously exported file, it creates a brand-new draft
> War — metadata, contestants, and their images — owned by the importing voter, entirely
> independent of whatever War the export came from; nothing about the original is referenced
> or affected. The file is validated in full before anything is created: a malformed or
> incomplete file is rejected with one clear message and creates nothing at all. Once the new
> draft exists, any later failure (a contestant, an image) leaves it in place with its error
> shown, rather than discarding what already succeeded — the creator lands on its Edit page
> and finishes repairing it by hand, the same way an abandoned Create War draft is already
> just findable, never lost.

Four rules fall out of that paragraph, and every one of them is load-bearing — don't relax
any of them for convenience:

1. **Validate everything before any network call.** If the file is unreadable, malformed, or
   references an image that isn't actually in the file, reject it with one message and make
   zero API requests. A user should never end up with a half-created War because their file
   was bad.
2. **No rollback.** Once `POST /wars` has succeeded, the draft is real and stays real no
   matter what fails afterward. Don't try to delete it on a later failure — that's more
   surface area for a second failure, and the spec explicitly wants the partial draft to
   survive so the creator can fix it by hand.
3. **The imported War is independent.** It gets new ids for everything. There is no link,
   reference, or foreign key back to whatever War was originally exported.
4. **Full success routes to the new draft's Edit page; partial failure shows the error and
   stops.** Either way the draft is reachable afterward through the ordinary My Wars list —
   this isn't a special state that needs its own recovery UI.

## The file format (the wire contract between Export and Import)

Whatever produced the file — `war-ui-default`'s own Export, or someone else's — Import must
accept it as long as it matches this shape. This is the actual interoperability contract, so
get it exact.

A War export is a **zip file** containing:

- `war.json` — the War's metadata and contestant data
- `media/<contestantId>/<mediaId>.<ext>` — one file per contestant image, referenced by path
  from `war.json`

`war.json` looks like this:

```json
{
  "title": "Miss Universe 2026",
  "category": "Pageant",
  "visibility": "public",
  "theme": "arcade",
  "contestant_schema": [],
  "ends_at": null,
  "contestants": [
    {
      "name": "Ada",
      "bio": "A brilliant mathematician.",
      "attributes": [
        { "key": "country", "label": "Country", "type": "string", "value": "UK" }
      ],
      "media": [
        { "display_order": 0, "aspect_ratio": 0.75, "path": "media/c-1/m-1.webp" }
      ]
    }
  ]
}
```

Field notes:

- `title`, `category`, `ends_at` may be `null`.
- `visibility` and `theme` are free-form strings at this layer — Import validates their
  *shape* (they're strings), not their enum membership. An invalid value surfaces later as an
  ordinary validation error from the real `POST /wars` call. Don't duplicate the API's enum
  validation on the client; you'll just drift out of sync with it.
- `contestant_schema` is the War's ordered field-definition list (see `war-spec.md` §4,
  "Contestant Schema"). Pass it straight through to `POST /wars` unchanged — it needs no
  transformation.
- Each contestant's `attributes` are stored in **resolved** form — `{key, label, type, value}`
  per entry, matching what a `GET /wars/:id` response already carries. This is *not* the shape
  `POST /wars/:id/contestants` expects (see below) — you must transform it.
- Each media entry's `path` must exist as a real file in the zip. If any path referenced from
  `war.json` is missing from the archive, the whole file is invalid — reject it, per rule 1
  above.
- Don't assume the file extension. Media files are conventionally `.webp` (the API always
  re-encodes uploaded images to WebP internally), but the contract doesn't guarantee it.
  Derive the MIME type from the actual extension in the path when you re-upload the file (see
  the gotcha below) — never hardcode `image/webp`.

## Build order

Implement these steps, in this order, and don't parallelize across them:

### 1. Validate the file completely

- Confirm the file unzips.
- Confirm `war.json` exists inside it and parses as JSON.
- Confirm it has the required shape: `title`/`category`/`ends_at` are strings or null,
  `visibility`/`theme` are strings, `contestant_schema` exists, `contestants` is an array
  where every entry has a string `name`, a nullable string `bio`, an array `attributes`, and
  an array `media` where every entry has a numeric `display_order` and a string `path`.
- Confirm every `media[].path` referenced actually exists among the zip's files.
- If any of this fails, stop. Surface one clear error message. Make no network calls at all.

This step should be pure, synchronous, and fully unit-testable without a network or a server
— see `war-ui-default/src/import/validateWarImport.ts` for the reference implementation and
`validateWarImport.test.ts` for the shape of its test coverage.

### 2. Create the War

`POST /wars` with the metadata, owned by whoever is currently authenticated (the importing
voter — this is not configurable, it's just whoever is logged in). This becomes the new
draft's id; every subsequent call is scoped under it.

From here on, if anything fails, **do not undo this War.** Surface the error and stop where
you are — see "Partial failure," below.

### 3. Create each contestant

For each contestant in `war.json`, in the order they appear, `POST /wars/:id/contestants`
with `name`, `bio`, and `attributes`.

**Transform attributes before sending.** `war.json` stores each contestant's attributes as
the *resolved* array (`{key, label, type, value}[]`), but `POST /wars/:id/contestants` expects
a flat `{ [key]: value }` object. Build that object from the resolved array; don't pass the
array through as-is.

### 4. Upload each contestant's images

For each contestant, for each of its media entries **in `display_order` order**,
`POST /wars/:id/contestants/:cId/images` as a `multipart/form-data` request carrying the raw
file bytes from the zip.

**Upload sequentially, not in parallel**, and **in order**. The API assigns each image's
`display_order` as "the next one" at the time it receives the request — if two uploads for
the same contestant race, the order becomes non-deterministic. One request must complete
before the next for the same contestant starts.

**Set the correct Content-Type on the upload.** The most common bug here: constructing the
upload from raw bytes without setting a MIME type (for example, JavaScript's `new File([bytes],
name)` leaves `type` as an empty string — it does **not** infer one from the filename). The
API's upload validation rejects an upload whose declared type isn't `image/jpeg`,
`image/png`, or `image/webp`, so an untyped upload gets rejected with a 422 that looks
unrelated to the real cause. Derive the MIME type explicitly from the media path's extension
(`.jpg`/`.jpeg` → `image/jpeg`, `.png` → `image/png`, `.webp` → `image/webp`) and set it on
the upload yourself. See `war-ui-default/src/import/importWar.ts`'s `mimeTypeFor` for the
reference fix, and the commit that introduced it for the exact failure mode.

Other server-side constraints your client should be ready to surface as ordinary errors, not
pre-validate redundantly: at most 10 images per contestant, 10 MB per file, and only
`image/jpeg`/`image/png`/`image/webp` accepted.

### 5. Partial failure

If contestant creation or an image upload fails partway through, stop processing further
contestants/images, but **leave the War exactly as far as it got.** Show the error. Do not
retry automatically, do not roll back, do not delete the draft. It stays reachable afterward
the same way any other draft is (My Wars → Edit).

### 6. Full success

Take the creator to the new draft's Edit page. There's nothing else to do — the draft behaves
like any other from this point on.

## API calls this feature makes

All three already exist; Import calls them exactly the way any other part of a War client
would (nothing import-specific was added to the API for this feature).

| Call | Method & path | Body | Notes |
|---|---|---|---|
| Create the War | `POST /wars` | `{ title, category, visibility, theme, ends_at, contestant_schema }` | Owned by the current voter |
| Create a contestant | `POST /wars/:id/contestants` | `{ name, bio, attributes }` — `attributes` as `{ [key]: value }` | One call per contestant, in order |
| Upload an image | `POST /wars/:id/contestants/:cId/images` | `multipart/form-data`, one file field | One call per image, sequential, in `display_order` order |

Full request/response shapes are in the API's published OpenAPI document (see
`war-api/scripts/dumpOpenApi.ts` and `war-ui-default/package.json`'s `generate:api` — the same
document war-ui-default's own client is generated from).

## Testing this feature

This repo builds every feature test-first (see the root `CLAUDE.md`). For Import specifically:

1. Unit-test the pure validation/transform logic (file-shape validation, the
   resolved-attributes-to-record transform, the extension-to-MIME-type mapping) without any
   network — these are ordinary pure functions.
2. Acceptance-test the end-to-end flow against a mocked API: a valid file creates a War,
   its contestants, and their images, in order, and navigates to the new draft; a malformed
   file makes zero requests and shows one error; a failure partway through leaves the partial
   draft in place with its error shown.
3. Write the Gherkin scenario(s) first if this client follows the same
   spec-then-implementation flow war-ui-default does — see `war-ui-default/features/`.

## Reference implementation

`war-ui-default` already has a working Import feature. Read it as ground truth for anything
this document doesn't cover in enough detail — it's the same contract described above, just
in TypeScript/React:

| File | What it does |
|---|---|
| `war-ui-default/src/import/validateWarImport.ts` | Step 1 — unzips, validates shape, checks every media path exists |
| `war-ui-default/src/import/importWar.ts` | Steps 2–5 — orchestrates War/contestant/image creation and the attribute/MIME-type transforms |
| `war-ui-default/src/import/useWarImport.ts` | Wires validation + orchestration to this client's real API calls and success/failure UI state |
| `war-ui-default/src/pages/ImportWar.tsx` | The file-picker page itself |
| `war-ui-default/src/export/exportWar.ts` | The producing side — read this to see exactly what shape a real export file has |

---

© Tom Adams — [war on GitHub](https://github.com/tadams1138/war)
