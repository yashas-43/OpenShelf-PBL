# General Books — Duplicate Catalogue Repair

## What was fixed

- Adds a read-only report for duplicate published General Book records (normalized title + author).
- Adds guarded archival of exact duplicates **without deleting MongoDB records or touching loan history**.
- Prevents an administrator from creating or renaming a published General Book to duplicate another published title + author.
- Reports same-title/different-author matches for manual review; these are **not** automatically hidden.
- Keeps the approved 326-book catalogue data, 32 genres, shared book cover, free PDFs and Razorpay-disabled settings unchanged.

## Local steps (from OpenShelf root, with MongoDB PRIMARY)

```powershell
npm run install:all
npm run catalogue:check
npm run catalogue:duplicates:preview
npm run catalogue:preview
```

Check the output. If the original 326-book migration has **not** been applied yet, its `catalogue:preview` command will show inserts, updates, archive candidates, and blockers. With a verified database backup and stopped website, use the existing documented `npm run catalogue:apply -- --confirm-archive` only when the preview has **zero blockers**.

If the approved catalogue has already been imported and **exact title/author duplicates remain**, use the targeted command below **only after** stopping the website and making a verified backup. The duplicate-preview output reports the proposed number `N` of archive candidates. Replace `N` with that exact count:

```powershell
npm run catalogue:duplicates:apply -- --backup-confirmed --expect=N
```

The targeted cleanup refuses to proceed when active loans or conflicting source identities make archiving unsafe. It archives extra published records (`isPublished=false`) but does not delete any records or reassign borrowings. Available/total stock counts on old archived rows are *not combined* with the remaining listing: an administrator must verify and reconcile physical inventory separately.

The title-only report will also identify cases where author names differ (which may represent genuinely distinct editions). Those must be reviewed manually. The program does not silently merge those records.

## After cleanup

```powershell
npm run catalogue:duplicates:preview
npm run audit:stock
npm test
npm run build
npm run dev
```

If duplicate cards remain, collect the `catalogue:duplicates:preview` output and the book titles/authors shown on the page. Exact duplicate title-and-author rows should no longer be published after a clean apply; visually identical titles credited to distinct authors require review.

**Caution:** An application-level duplicate check is not a substitute for a concurrent-write unique constraint. Before public deployment, resolve all legacy duplicates and add a canonical identity constraint or serialized admin writes.
