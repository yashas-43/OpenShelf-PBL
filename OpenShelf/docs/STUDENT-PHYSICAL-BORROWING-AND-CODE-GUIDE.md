# OpenShelf — Student Category Physical Borrowing

## Scope

This update builds on the latest Gmail-OTP / Peer-Exchange project. It **does not restart OpenShelf** or change the existing General Books borrowing, PDF reader, Gmail account verification, or payment-disabled behavior.

Students can now choose **Borrow Book** and **View PDF** separately for the same textbook in:

- Class 8, Class 9, and Class 10
- 1st PUC and 2nd PUC
- Every actual subject present in the imported StudentTextbook catalogue

One subject is one physical textbook regardless of whether its digital PDF consists of one file or Part 1 and Part 2. The two PDF files **do not create two separate physical inventory items**.

## Physical stock is not invented

**Important:** A PDF's presence does not prove that OpenShelf owns a physical copy. For this reason, all student physical textbook inventory starts at **0**. Only an administrator can enter actual copies held by the library. Unlike General Books, no automatic "3 copies" migration is run for student textbooks.

To activate the Borrow Book button:

1. Log in to the Admin Dashboard.
2. Open **Student PDFs**.
3. Find the class/year and subject.
4. Enter the *real number of physical copies* under **Physical copies**.
5. Click **Save physical stock** and confirm.

The API calculates available copies from actual active student loans, so stock cannot be reduced below outstanding loans. The public interface shows available/unavailable **without displaying copy counts**.

## Student experience

1. Open Student Category → School/PUC → Class/Year → Subject.
2. Read the textbook PDF for free if a PDF part is published and the account is logged in.
3. To borrow a physical copy, click **Borrow Book** when stock is available.
4. Checkout is automatic for authenticated student accounts. The physical copy is reserved in an atomic MongoDB transaction.
5. The book appears under **User Dashboard → My Borrowed Books → My Student Book Loans**.
6. Staff record actual returns under **Admin Dashboard → Borrowings → Student textbook returns**.
7. Return deadline and remaining time use the saved loan due date. Overdue fines use the existing ₹10-per-started-day rule.

If all physical copies are borrowed, the button is disabled. Where recorded loan due dates exist, the website shows the earliest expected return and remaining time, **not a guarantee**.

## Files created

| File | Purpose |
| --- | --- |
| `server/src/models/StudentBorrowing.js` | Physical student-loan schema and unique active-loan index |
| `server/src/services/studentBorrowingRules.js` | Pure stock, visibility, and due-date rules |
| `server/src/services/studentBorrowingService.js` | MongoDB transactions for checkout, returns, extensions, and stock editing |
| `server/src/controllers/studentBorrowingController.js` | Public, student, and administrator request handlers |
| `server/src/routes/studentBorrowingRoutes.js` | Student-protected checkout, extension request, and public availability |
| `server/src/routes/adminStudentBorrowingRoutes.js` | Admin-only stock and return APIs |
| `server/src/scripts/auditStudentStock.js` | Read-only physical stock audit |
| `server/src/tests/studentPhysicalBorrowing.test.js` | Pure policy tests and fine checks |
| `client/src/components/dashboard/StudentPhysicalBorrowPanel.jsx` | Borrow Book button and availability, separated from PDF reader |
| `client/src/components/dashboard/StudentPhysicalBorrowings.jsx` | Student's actual physical-loan history |
| `client/src/components/admin/AdminStudentBorrowingDesk.jsx` | Administrator's student returns and extensions |

## Existing files updated

- `server/src/models/StudentTextbook.js` — optional physical inventory fields (default 0).
- `server/src/controllers/studentPdfController.js` — publishes physical availability per subject without publishing stock counts; subjects remain visible if no PDF part is published.
- `server/src/controllers/dashboardController.js` — dashboard metrics and student-loan API.
- `server/src/controllers/adminController.js` — admin statistics, student history, and overdue reports include student textbooks.
- `server/src/services/reminderService.js` — scheduled emails also include student physical loans.
- `server/src/services/borrowEmailNotifications.js` — fixes the existing missing borrowing event-key import.
- `server/src/app.js` — mounts the protected student-borrowing routes.
- `server/src/routes/dashboardRoutes.js` — registers student borrowing history route.
- `client/src/pages/StudentLibrary.jsx` — renders Borrow Book next to free PDF parts.
- `client/src/pages/UserDashboard.jsx` — displays student loans in My Borrowed Books.
- `client/src/pages/AdminDashboard.jsx` — displays staff returns and stock controls.
- `client/src/styles/index.css` — responsive styling for the new borrowing card.
- Root and server `package.json` — adds the read-only `audit:student-stock` script.

## Backend API

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/student-borrowings/:id/availability` | Public | Status and expected return; no copy count |
| POST | `/api/student-borrowings` | Student | `{ "textbookId": "..." }`; atomic checkout |
| POST | `/api/student-borrowings/:id/extension-request` | Loan owner | Request deadline extension |
| GET | `/api/dashboard/student-borrowings` | Student | Account-specific loan history |
| GET | `/api/admin/student-borrowings` | Admin | Student textbook loan management |
| POST | `/api/admin/student-borrowings/:id/return` | Admin | Return physical copy and assess fines |
| POST | `/api/admin/student-borrowings/:id/extension` | Admin | `{ "decision": "approve" }` or `"reject"` |
| PATCH | `/api/admin/student-borrowings/textbooks/:id/stock` | Admin | `{ "totalCopies": 3 }` |

The existing `/api/student-pdfs` endpoints still govern digital reading. **General Books still have no PDF access.**

## Code quality and explanation for demonstrations

New modules are written in conventional multi-line JavaScript/JSX with two-space indentation, descriptive names, and comment blocks describing the logic. Inline comments explain **why** a security or inventory decision is made; unnecessary comments on every punctuation token are avoided. The existing project also has `.editorconfig`, `.prettierrc.json`, `.prettierignore`, and `eslint.config.mjs`.

### Example: automatic physical checkout

```javascript
// 1. Require a valid StudentTextbook record before changing physical inventory.
const textbook = await StudentTextbook.findOne({
  _id: textbookId,
  isPublished: true
}).session(session);

// 2. Decrease stock only when a real physical copy remains.
const updated = await StudentTextbook.findOneAndUpdate(
  { _id: textbookId, availableCopies: { $gt: 0 } },
  { $inc: { availableCopies: -1 } },
  { new: true, session }
);

// 3. Create the loan in the SAME database transaction as the stock update.
const [loan] = await StudentBorrowing.create(
  [studentCheckoutDocument(userId, textbookId, new Date(), 14)],
  { session }
);
```

The example is shortened for teaching. The production implementation includes authorization, publication checks, duplicate-loan protection, notification queueing, and error handling in `studentBorrowingService.js`.

### Format code in VS Code

Install the **Prettier – Code formatter** VS Code extension and use **Shift + Alt + F** on a JavaScript or JSX file. Keep the project's `.prettierrc.json` settings. Do not run a bulk automatic rewrite on the entire working website without reviewing the changes; old components still use compact layouts.

## Install and run on Windows

1. Extract the ZIP and open the inner `OpenShelf` folder in VS Code.
2. **Back up** the current database and copy your working private `server/.env` and `client/.env` into this project. Do not put passwords in the ZIP.
3. Confirm MongoDB is PRIMARY: in Compass Shell, `rs.status().myState` should return `1`.
4. From the project root:

```powershell
node -v
npm -v
npm run install:all
npm test
npm run build
npm run dev
```

5. Open `http://localhost:5173` and sign in as your configured administrator.
6. Go to Student PDFs, pick one real textbook, and set physical stock to match books actually on hand.
7. Log in to a *separate student account* and test Borrow Book. Check the return date in My Borrowed Books.
8. Check inventory without changing it:

```powershell
npm run audit:student-stock
```

### Manual testing

- [ ] All five approved study levels are shown.
- [ ] Every imported subject has one Borrow Book button, including multipart textbooks.
- [ ] PDF access still works and does not decrement physical stock.
- [ ] Stock 0 displays "No physical copies available" and disables Borrow Book.
- [ ] Admin records actual stock, and borrow becomes enabled.
- [ ] First checkout decrements available stock; duplicate loans are blocked.
- [ ] Sold-out books show only recorded expected return dates and a countdown.
- [ ] My Borrowed Books shows General Books and Student Book Loans.
- [ ] Only admin can change stock and mark returns.
- [ ] Returning a book restores one physical copy.
- [ ] Extension decisions and ₹10/day overdue fines work.
- [ ] Email failures are recorded without falsely claiming delivery.
- [ ] Student cannot access admin APIs or another student's loan records.
- [ ] `npm run build` succeeds locally.

## Verification limits

The source-level tests, JavaScript/JSX parsing, CSS parsing, and archive integrity can be checked in this environment. **Live MongoDB transactions, actual physical inventory, Gmail SMTP delivery, and a full Vite build require local verification**. Do not treat an automated unit test as a successful real borrowing transaction.
