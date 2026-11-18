# OpenShelf — Three Physical Copies, Automatic Borrowing & PDF Title CSV

This is an incremental change to the **Phase 9 + Student PDF** project. It preserves the login, MongoDB collection, other dashboard pages, existing borrowing history, and the PDF reader. No books, fake users, payments, or emails are created.

## Changes made

1. New physical General Book records default to `totalCopies=3` and `availableCopies=3`.
2. A **one-time migration** sets **each existing physical General Book** to three total copies while subtracting the actual number of open loans/requests. It refuses to run if any book has more than three open loans, or an open loan points to a missing/nonphysical book.
3. Student **Borrow Book** creates a real `borrowed` record with `issuedAt` and `dueAt` in the *same transaction* as decrementing stock. It does not require staff approval or an extra issue action. The online click now represents immediate checkout; it does **not** independently verify that a physical handover has taken place.
4. The public General Books API and interface never expose `totalCopies` or `availableCopies`: they show **Available to borrow** or **No physical copies available**.
5. When sold out, the interface shows the **earliest upcoming stored due date** and a countdown. If some borrowers are overdue, that warning appears too. Actual return times are **estimates**, and cannot be guaranteed. If none of the remaining active loans has a future deadline, the website correctly says a return date is unavailable.
6. Staff still record actual physical **returns**, which restore one available copy. Existing historical `requested`/`approved` records can still be administered; the new checkout path bypasses those states. Extension approval remains a staff action.
7. Gmail sending is **not** implemented by this change. The checkout message explicitly says so.
8. A PowerShell CSV generator scans the actual Student Category PDFs and adds an optional `BookTitle` field for a clean catalogue display label. It never edits/renames the actual PDFs. This title is preserved in MongoDB as `StudentPDF.displayTitle` upon import. The original filename remains the local file path.

## Important: update EXISTING inventory once

1. Back up your existing MongoDB data; **stop `npm run dev`** before running this migration so other people are not borrowing during the update.
2. Ensure MongoDB is running as a **PRIMARY replica-set member** (`rs.status().myState` returns `1`).
3. Extract the updated ZIP and open **OpenShelf** in VS Code, then install dependencies if necessary:
   ```powershell
   npm run install:all
   ```
4. Keep your existing secret-bearing `server/.env` and `client/.env` files **on your own computer**; they are intentionally excluded from the ZIP. Confirm the `MONGODB_URI` points to your *existing* `openshelf` database (for example `mongodb://127.0.0.1:27017/openshelf?replicaSet=rs0&directConnection=true`).
5. Check the proposed changes (read-only):
   ```powershell
   npm run stock:set-three
   ```
6. If the dry run succeeds and reports the expected book count, apply the change once:
   ```powershell
   npm run stock:set-three -- --apply
   ```
7. Check the stock invariant:
   ```powershell
   npm run audit:stock
   ```
8. Start the website:
   ```powershell
   npm run dev
   ```

**Migration example:** Book A has zero active loans ⇒ total 3, available 3. Book B has one active loan ⇒ total 3, available 2. Book C has three active loans ⇒ total 3, available 0. The migration does not delete any existing borrowing record. Running the command twice is idempotent, but you should only need to apply it once. Never execute it on a live public server without a maintenance window and a verified backup.

## How to test the new checkout

- Sign in as student A; open **General Books**. No numeric physical stock counts should be visible.
- Borrow a book. The response should confirm immediate borrowing and display a real due date in **User Dashboard → My Borrowed Books**.
- Verify staff did not need to approve the request.
- Sign in as student B and student C, borrowing the **same** title using distinct accounts. After the third borrow, the catalogue should say **No physical copies available**.
- Confirm the earliest upcoming return deadline and countdown come from stored MongoDB dates, not a fixed countdown.
- A fourth student must not be able to borrow the out-of-stock title; the API responds with conflict 409 if attempted.
- Admin marks one *actually returned* loan as **Returned**. The book becomes borrowable again.
- Check duplicates are blocked for the same student while a loan is open, and `npm run audit:stock` reports no mismatches.

## Rename Student PDF files / generate fresh CSV

If you rename or move a PDF on your laptop, the old manifest path is no longer correct. Use the bundled script to regenerate the real manifest (after renaming all files) from the OpenShelf project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Generate-TextbooksManifest.ps1 -Root "D:\Library\Textbooks"
```

This overwrites **`data/Textbooks-Manifest.csv`** in the extracted project, containing columns:
`Level`, `Subject`, `FileName`, `RelativePath`, `FullPath`, `SizeMB`, `BookTitle`.

The `BookTitle` value initially comes from the PDF's **filename without `.pdf`**. Review it in Excel/VS Code and correct it to the **verified** textbook title when necessary. The script does **not** read PDF cover pages, change the embedded metadata, or rename PDF files. Save as **CSV UTF-8**.

From the project root, check and reimport the updated manifest:

```powershell
npm run pdf:check -- --root "D:\Library\Textbooks"
npm run pdf:import -- --root "D:\Library\Textbooks"
```

The importer checks every path and PDF header before changing records. Unlisted old local PDF paths become inactive; it does not delete the PDF bytes. The original folder/subject structure and filename stay exact. PDF access is only for Student Category, free for now, and subject to distribution rights. **Do not upload your 3+ GB PDF collection** to obtain the CSV.

## Change inventory policy later

An automatic online checkout is not a verified physical handover, so the site should be run locally or under a clear library handover policy until that operational step is formalized. If physical copies are lost, damaged, or admin inventory changes, re-evaluate the three-copy assumption instead of rerunning a default stock reset without inspection.

## Tests and limitations

Run from the project root:

```powershell
npm test
npm run build
npm run audit:stock
```

Pure tests cover stock migration rules, immediate checkout dates, safe public book responses, due-date estimates, PDF manifest parsing and earlier borrowing lifecycle policies. Real MongoDB transactions, browser PDF streaming, and the production Vite build require testing on your actual Windows computer with dependencies and your configured database. Email and full admin dashboard remain outside this change.

### Relevant files

- `server/src/models/Book.js`, `server/src/models/Borrowing.js`
- `server/src/services/borrowingRules.js`, `borrowingService.js`, `inventoryPlan.js`, `publicBookAvailability.js`
- `server/src/controllers/borrowingController.js`, `bookController.js`
- `server/src/scripts/setThreeCopyInventory.js`
- `client/src/components/dashboard/BookAvailability.jsx`, `client/src/pages/GeneralBooks.jsx`
- `client/src/pages/UserDashboard.jsx`, `client/src/components/admin/AdminBorrowingDesk.jsx`
- `scripts/Generate-TextbooksManifest.ps1`
- `server/src/services/studentPdfManifest.js`, `server/src/scripts/importStudentPdfs.js`
- `server/src/models/StudentPDF.js`, `server/src/controllers/studentPdfController.js`, `client/src/pages/StudentLibrary.jsx`
- `server/src/tests/autoBorrowInventory.test.js`, `server/src/tests/studentPdfManifest.test.js`
