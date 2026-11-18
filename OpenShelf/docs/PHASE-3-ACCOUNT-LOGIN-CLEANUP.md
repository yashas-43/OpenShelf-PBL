# OpenShelf — Phase 3: Retire old student logins safely

## Purpose

Phase 2 brought the approved **326 unique General Books** into the project. Phase 3 handles the separate request to start student registration from a fresh login slate while making `openshelfofficial01@gmail.com` the only configured administrator login.

### Critical distinction

**Student accounts and login sessions are not the same thing.** This release does **not** automatically delete any accounts, MongoDB records, or user loans. The administrator account is configured in `server/.env` (not registered as an ordinary MongoDB student). The reset script retires old student *login identities* rather than hard-deleting their MongoDB `_id` records. Historical borrowing/payment/exchange records can still refer to their correct IDs.

After a successful **manually confirmed** reset:

- Previously registered students cannot use their old passwords or tokens.
- Their full names, contact email addresses, and phone numbers are replaced/cleared in the User collection.
- Their old email addresses are freed for a new **six-digit Gmail OTP registration**.
- The old student identities remain **disabled, archived, and not listed** in the default Admin → Users screen.
- Email OTP/reset challenges and incomplete registrations are removed.
- Unsent email notifications are cancelled, public peer listings hidden, and private PDF reading history and in-app notifications for those students cleared.
- General Books, Student PDFs, textbook/General Book stock, original borrow/return records, past payment records, historical peer exchange records, fines and admin audit trails are retained.
- The admin email must be **`openshelfofficial01@gmail.com`**. The password is the **existing bcrypt admin hash** in `.env`.

The reset is **blocked** while any account has an active physical loan, an unresolved peer exchange, an unpaid assessed fine, an open/captured payment, or a completed purchase. These must be reconciled with the administrator first. The goal is to avoid losing money, copy inventory, or active book handovers.

## 1. Open the latest project

Extract `OpenShelf-Phase-3-Safe-Account-Login-Cleanup.zip` and open its inner `OpenShelf` folder in VS Code. Copy your **private** working `server/.env` and `client/.env` files; the ZIP contains `.env.example` only.

Make sure MongoDB runs as a PRIMARY replica-set member. Ensure your server isn't running when executing the apply operation. Do not remove or overwrite `openshelf` in Compass.

## 2. Set your sole administrator email

Edit **`server/.env`**:

```dotenv
ADMIN_NAME=OpenShelf Administrator
ADMIN_EMAIL=openshelfofficial01@gmail.com
ADMIN_PASSWORD_HASH=YOUR_EXISTING_PRIVATE_BCRYPT_HASH
MONGODB_URI=mongodb://127.0.0.1:27017/openshelf?replicaSet=rs0&directConnection=true
```

Preserve your other real secrets (`JWT_SECRET`, Gmail App Password, OTP secret). **Do not use the above placeholder literally.** Old admin sessions with a different email will be rejected by the existing authorization middleware; log in again using your configured admin credentials.

## 3. BACK UP MONGODB FIRST (required)

Use a verified MongoDB backup for the database (e.g. `mongodump` from MongoDB Database Tools if installed). Backups must be stored outside the project ZIP. Do not share or upload them publicly; they include users' personal data. Stop both servers before applying the reset. The script will not back up data automatically.

This operation cannot restore original student names, emails and phone numbers without a backup.

## 4. Preview the account cleanup (no changes)

Run in the **project root**:

```powershell
npm run install:all
npm run accounts:preview
```

The preview reports:

- How many existing student accounts would be retired.
- Whether there are active General Book/Student Textbook loans.
- Whether exchanges, pending/captured payments, purchases, or unpaid fines block the reset.
- How many pending Gmail registrations, password resets, peer listings and unsent notifications would change.

**If there are blockers, resolve them first.** Don't delete active loans in Compass to bypass safeguards.

## 5. Apply the cleanup only after approval

If the preview reports **N** eligible student accounts, a verified backup exists, and there are **zero blockers**, run:

```powershell
npm run accounts:reset -- --apply --backup-confirmed --confirm-account-retirement --expect-users=N
```

Replace `N` with the **exact integer** printed by preview. For example, if the preview reports `4`, use `--expect-users=4`.

The script rechecks account counts and all blockers inside a MongoDB transaction. If anything changed, the operation aborts and rolls back. It refuses `NODE_ENV=production` and will not run without the exact administrator address and a bcrypt hash configured.

## 6. Verify the cleaned account state

Run another preview:

```powershell
npm run accounts:preview
```

It should report `0` eligible previous student identities. The historical archived `_id` records remain in MongoDB for accounting references; this is intentional, **not an error**.

Start the website:

```powershell
npm test
npm run build
npm run dev
```

Visit `http://localhost:5173`. Test admin login with `openshelfofficial01@gmail.com`, student login with a retired account (must fail), new student Gmail OTP registration (must work if SMTP is configured), and reading/borrowing with a newly registered account. No Razorpay setup is needed; Student PDFs remain free.

## 7. File changes

- `server/src/services/accountRetirementRules.js` — pure validation, archival rules and safety checks
- `server/src/scripts/retireStudentAccounts.js` — preview and transaction-based reset
- `server/src/tests/phase3AccountRetirement.test.js` — automated safety tests
- `server/src/models/User.js` — archive timestamp
- `server/src/models/EmailLog.js` — cancelled outbox status
- `server/src/controllers/adminController.js` — hide retired students from ordinary account list, prohibit re-enabling them
- `server/package.json`, root `package.json` — script commands
- `docs/PHASE-3-ACCOUNT-LOGIN-CLEANUP.md` — these instructions

## 8. Known limitations

- Source tests do not prove live MongoDB transactions. Verify on your laptop before applying to a real database.
- Some historical audit reports and existing peer-to-peer messages may still contain historical non-account text. This is **account-login retirement**, not a complete legal personal-data-erasure workflow.
- Archived accounts cannot be restored without a backup. If a historical user has pending obligations or paid entitlements, the reset refuses to proceed.
- This does **not** stop students from registering **new** accounts. Public registration remains available via verified Gmail OTP.
