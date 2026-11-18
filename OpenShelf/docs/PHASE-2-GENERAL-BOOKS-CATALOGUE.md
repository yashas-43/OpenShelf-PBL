# OpenShelf — Phase 2: General Books catalogue

## What is included

This phase starts from **OpenShelf-Phase-1-Student-Borrowing-Repair.zip** and preserves the other features. It is deliberately limited to General Books; it does **not** delete or modify user accounts, email/login records, Student PDFs, or peer exchange data. Phase 3 account cleanup is separate.

- **326 real source catalogue entries** supplied in `OpenShelf-Combined-Books-Database.zip` under `all_books.json` (`collection: general`). No replacement books were generated.
- `data/General-Books-326.csv`: complete printable catalogue with original book IDs, title, author, source genre, approved OpenShelf genre, language, and description.
- `server/src/data/generalBooks326.json`: import-ready source, including original book ID and record ID.
- `data/General-Books-Genre-Map.json`: explicit mapping from 32 original genre labels to OpenShelf's approved genre names. The original label is preserved in `sourceGenre` on each record. The frontend still offers all 32 approved category filters; categories without books in the source remain empty rather than receiving invented books.
- **Shared book cover**: `client/public/openshelf-general-cover.jpg`. This is exactly the image supplied for OpenShelf. The General Books grid and details already use it for every title.
- **Idempotent catalogue importer** with a dry run. It reuses a matching title–author record instead of inserting another copy; it archives extra published catalogue records but never deletes their MongoDB documents or borrowing references.

## Before importing

1. Stop both OpenShelf frontend/backend to avoid concurrent borrowing or administrator edits.
2. **Back up your MongoDB `openshelf` database** before applying any changes. An administrator can use `mongodump` if MongoDB Database Tools are installed or their approved backup process.
3. Verify MongoDB is a running replica-set PRIMARY. Import transactions require this.
4. Copy your existing private `server/.env` and `client/.env` into the new extracted project. Never share `.env` or add it to the ZIP.
5. Install dependencies from the main `OpenShelf` directory: `npm run install:all`.

## Commands (VS Code terminal, Windows PowerShell)

```powershell
# 1. Check the original source file and mapping; does not connect to MongoDB.
npm run catalogue:check

# 2. Inspect changes against your existing openshelf MongoDB database.
#    This is READ ONLY.
npm run catalogue:preview

# 3. After reviewing the preview, resolving any blockers, and backing up:
npm run catalogue:apply -- --confirm-archive

# 4. View the site (backend and frontend).
npm run dev
```

If the preview reports blockers, **do not apply**. It means multiple duplicate records have active loans, an unlisted book has an active loan, or there is an ID/inventory conflict. Finish the physical return or resolve the conflicting records with a proper audit first. The script does not automatically move a student's loan to a different book ID.

## What the importer changes

- For each of the 326 approved title/author pairs, it reuses an existing matching book document when possible. Original MongoDB `_id` stays unchanged, so borrowing history keeps its original references.
- Existing book stock (`totalCopies`, `availableCopies`), borrowing availability flags, price and purchase settings are **preserved**.
- Missing approved titles are added with **zero physical copies** and borrowing disabled until an administrator verifies stock. Catalogue records alone do not prove copies exist.
- Source `book_id` and `record_id` are stored as `sourceBookId` and `sourceRecordId`; original genre is kept as `sourceGenre` while `genre` uses the approved OpenShelf taxonomy.
- Extra published duplicates and unrelated General Book records without active loans are **unpublished (archived)**, not deleted. Historical loans, users, fine records and their book IDs remain intact.
- The migration happens in a MongoDB transaction; if active borrowing conflicts are detected it stops before making changes.
- The migration can be rerun after successful completion and should not add duplicates.

### Important limits

The website's live MongoDB cannot be reached from this development environment; the importer has not yet run on your actual database. Local tests validate the migration plan logic, but you must check its preview and results using your own MongoDB service. Re-run the preview after applying; it should show zero inserts and archives. Do not run the older one-time stock seeding command as a shortcut unless physical books are confirmed.

## Verification checklist

- [ ] `npm run catalogue:check` validates 326 distinct source books.
- [ ] `npm run catalogue:preview` reports no blockers.
- [ ] An administrator has backed up MongoDB.
- [ ] Apply succeeds without errors.
- [ ] `npm run catalogue:preview` afterward reports 0 inserts and 0 archives.
- [ ] General Library shows **326** published book entries with **no duplicate cards**, when no other admin adds extra records after migration.
- [ ] All General Books show the supplied OpenShelf image.
- [ ] Original titles, authors, languages and descriptions are intact.
- [ ] Genre filters use the 32 approved options; no General Book has PDF links.
- [ ] Existing borrowing history and current stock still appear correctly.
- [ ] Run `npm test` and `npm run build` locally and correct any errors.

## Phase 3 remains pending

No user records or login history have been removed. The separate Phase 3 will require a scoped, backup-first account cleanup plan; administrator configuration is unchanged by Phase 2.
