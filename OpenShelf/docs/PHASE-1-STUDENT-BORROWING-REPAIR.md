# OpenShelf – Phased updates: Phase 1, Student Category physical borrowing

## Scope

This phase repairs the Student Category borrowing experience without modifying
General Book records or existing MongoDB accounts. Phase 2 will address the
unique 326-book General Books catalogue and shared cover. Phase 3 will review
the requested account/login cleanup; no user records are deleted in this phase.

## Root cause

Imported Student Textbooks have `totalCopies: 0`, `availableCopies: 0`, and
`isAvailableForBorrow: false` until a librarian confirms actual physical stock.
A digital PDF is not evidence that a physical textbook is owned. The previous
Borrow Book button was disabled whenever the originally loaded catalogue
reported zero copies, so it could stay disabled even after an administrator
updated stock elsewhere.

## Changes

1. `client/src/components/dashboard/StudentPhysicalBorrowPanel.jsx`
   - The Borrow Book button is clickable and checks current backend availability
     before attempting checkout when the displayed availability is out of date.
   - When no copies exist, the student sees a truthful explanation instead of a
     silent disabled button.
   - A dedicated Refresh availability control lets students check for recently
     returned or newly registered physical copies.
   - The backend still performs the final stock, authenticated-user, duplicate
     loan, and three-book-limit checks atomically in MongoDB.

2. `client/src/pages/AdminDashboard.jsx`
   - Added **Enter 3 copies** as a convenient input value in each Student
     Textbook physical-stock editor.
   - Saving still requires the librarian to confirm the *actual* physical
     quantity. No stock is created by merely pressing Enter 3 copies.

## How to activate a real physical textbook

1. Sign in as the administrator configured in `server/.env`.
2. Open **Admin Dashboard → Student PDFs**.
3. Find the class/subject and set its actual physical-copy count. If the library
   owns three physical copies, choose **Enter 3 copies**, then click
   **Confirm physical stock & enable borrowing**, and confirm the prompt.
4. Sign in as a student. Open Student Category, select that subject, and click
   **Refresh availability** (or simply click **Borrow Book**, which rechecks).
5. A successful checkout starts the existing return due date and appears under
   **My Borrowed Books**. No administrator approval is required for checkout.
6. A student can hold at most three active physical books combined across
   General Books and Student Textbooks. PDF reading does not count.
7. Returns still require administrator confirmation of the physical handover;
   only then does stock go back up and the account free a borrowing slot.

### Optional bulk inventory procedure

Only if the library actually has three physical copies **of every published
textbook**, use the existing preview and explicit-confirmation commands:

```powershell
npm run stock:student-three
npm run stock:student-three -- --apply --confirm-physical-stock
npm run audit:student-stock
```

Back up MongoDB before changing inventory. The preview changes no records.
Never use bulk setup merely to make the button look available when no books
physically exist.

## Run and test

From the extracted `OpenShelf` project root:

```powershell
npm run install:all
npm test
npm run build
npm run dev
```

Check:
- Borrow Book displays for each imported Student Category subject.
- With zero physical copies, clicking it reports that no copies are available.
- After confirming stock for one subject, refreshing shows Available to borrow.
- A student can borrow that subject and receives a due date; stock decreases.
- A fourth active physical-book checkout fails, without reducing stock.
- A confirmed return restores physical availability.
- Both parts of a textbook's PDF remain free and unchanged.

## Verification performed here

- `npm test`: 92 passing tests total (88 backend, 4 frontend utilities).
- Modified JSX files parsed with TypeScript's JSX parser: 0 syntax errors.
- `npm run build`: NOT verified; Vite is not installed in the build environment.
- Live MongoDB stock/checkout: NOT tested; requires your own database and physical inventory.

No `.env` credentials or PDF contents are included in the ZIP.
