# OpenShelf — Navigation, PDF, Borrowing and Return Fixes

This update builds on the **Phase 14 three-book-limit project** and preserves the previous source files, the Phase 13 Peer Exchange feature, and free Student Category PDFs. It does not activate Razorpay.

## Fixed / added in this package

1. **Navigation text:** Consistent top-bar font sizes with nowrap styling and responsive menu behavior.
2. **Whole-card navigation:** Clicking or keyboard-activating any part of the General Library or Student Library homepage cards navigates correctly.
3. **PDFs renamed after import:** When the old database filename is missing, the protected reader searches the **same subject folder only** for a **single unambiguous PDF of the same part number**. It validates the PDF header, size, and directory boundary before reading. An ambiguous file selection fails safely; it never guesses.
4. **Physical Student Textbook borrowing:** The Borrow Book control uses real inventory; no PDF implies a physical copy exists. Administrator stock must first be registered. The user gets a clear explanation when stock is zero. A new preview/apply command can set exactly three **confirmed** physical copies of each subject.
5. **Return Book in both dashboard loan lists:** The student can request a return. The administrator's borrowing desks show pending requests and confirm actual receipt. The stock counter and three-book limit **do not change** until staff confirmation. Existing ₹10/day overdue fines are preserved.
6. **Administrator email:** `server/.env.example` now includes `ADMIN_EMAIL=openshelfofficial01@gmail.com`. This is not a password. Update your **private** `server/.env` separately to use this email; never send your `.env` file to anyone.

## Run the updated project

Extract the ZIP, open the inner `OpenShelf` folder in VS Code, and copy `server/.env` and `client/.env` from your current working project into the corresponding new folders. Keep all private JWT and SMTP secrets out of the ZIP.

```powershell
node -v
npm -v
npm run install:all
npm test
npm run build
npm run dev
```

MongoDB must be running as replica-set PRIMARY (`rs.status().myState` returns `1`). Navigate to `http://localhost:5173`.

### Update the administrator login email

In `server/.env`, change only the email line:

```dotenv
ADMIN_EMAIL=openshelfofficial01@gmail.com
```

Keep the **existing bcrypt password hash** if you want the same admin password. Save the file and restart the server. Existing JWTs issued under the previous administrator email will no longer work; log in again using the new email. `EMAIL_USER` is the Gmail *sending* account and is configured separately.

### Restore PDF reading

Your screenshot shows a **missing local PDF path**, not a payment requirement. Check that your actual files exist and that the backend runs on the laptop containing them:

```powershell
Test-Path "D:\Library\Textbooks"
npm run pdf:check -- --root "D:\Library\Textbooks"
```

The bundled `data/Textbooks-Manifest.csv` expects **58 PDFs / 37 grouped textbooks**. The check must succeed for the files you actually have. After verification, with MongoDB PRIMARY:

```powershell
npm run pdf:import -- --root "D:\Library\Textbooks"
```

If you renamed PDFs **after the previous import**, the temporary unique-match fallback can open them immediately, but the import is still needed to persist updated filenames. If any file, subject folder, or class is different from the bundled CSV, regenerate the manifest from the corrected folder first. Never create placeholder PDFs. Note that *published* reading access in production mode still requires confirmed distribution rights.

### Make Student Category Borrow Book usable

**The Borrow Book button is not broken if the library has no recorded physical copies.** The old project correctly initialized Student Textbook stock to zero. You must enter copies that the library actually owns.

Option A: In **Admin Dashboard → Student PDFs → Physical copies**, set a subject's real quantity (for example, 3). The button will then become available to students.

Option B: If the library **really holds three physical copies for every listed textbook**, preview the bulk update and explicitly confirm it:

```powershell
npm run stock:student-three
npm run stock:student-three -- --apply --confirm-physical-stock
npm run audit:student-stock
```

Do not run `--apply` if you own only digital PDFs. Existing active physical loans are accounted for, and any subject with more than three active loans blocks the update. The physical cap is still **three simultaneous books per student across General + Student categories**, not three copies per student.

### Test the return action

1. Log in with a student account and borrow an in-stock physical book.
2. Go to **My Dashboard → My Borrowed Books → Return Book**.
3. Request a return. The dashboard should display **Return requested — awaiting staff confirmation**.
4. Log in with the administrator account. In the General Borrowing Desk choose **Return requests**, or in Student Textbook Returns select **Show only student-requested returns**.
5. Confirm actual physical receipt. Only then does the loan close, stock increase and one of the student's three borrowing slots become available again.
6. Check return email behavior if SMTP is configured, and verify late fines are recorded at real receipt time.

## Files changed or added

- `client/src/App.jsx`, `client/src/styles/index.css`: responsive top navigation and whole-card clicks.
- `client/src/pages/StudentLibrary.jsx`: renamed-PDF status guidance.
- `server/src/services/studentPdfFiles.js`, `server/src/controllers/studentPdfController.js`: safe same-folder PDF recovery.
- `client/src/components/dashboard/StudentPhysicalBorrowPanel.jsx`: real physical stock instructions.
- `client/src/pages/UserDashboard.jsx`, `client/src/components/dashboard/StudentPhysicalBorrowings.jsx`: Return Book actions.
- `server/src/models/Borrowing.js`, `server/src/models/StudentBorrowing.js`: return request timestamps.
- `server/src/services/borrowingService.js`, `server/src/services/studentBorrowingService.js`, `server/src/services/physicalReturnRules.js`: atomic return-request handling.
- `server/src/controllers/borrowingController.js`, `server/src/controllers/studentBorrowingController.js`, `server/src/controllers/dashboardController.js`: return request/status APIs.
- `server/src/routes/borrowingRoutes.js`, `server/src/routes/studentBorrowingRoutes.js`: student-only return request routes.
- `client/src/components/admin/AdminBorrowingDesk.jsx`, `client/src/components/admin/AdminStudentBorrowingDesk.jsx`: return-request administration and filters.
- `server/src/scripts/setStudentPhysicalInventory.js` and both project `package.json` scripts: explicit bulk physical inventory setup.
- `server/.env.example`: new administrator email (without secrets).
- `server/src/tests/pdfFileRecoveryAndReturns.test.js`, `server/src/tests/paymentsPaused.test.js`: PDF recovery and return filter verification.

## Verification limits

Tests and JavaScript syntax checks run in the packaging workspace. The full React production build and actual Windows PDF/MongoDB operations **must** be checked on your computer because this workspace has no project npm dependencies, live MongoDB, or your PDF collection. Never interpret a source-level test pass as proof that a real PDF was delivered or a physical book was returned.
