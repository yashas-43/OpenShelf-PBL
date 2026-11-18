# OpenShelf — ₹10 Razorpay Test Mode and Peer Listing Moderation

## Scope of this ZIP

- **Digital textbooks:** One fixed ₹10 test transaction per student textbook **subject** (includes all parts). Prices are set on the backend in integer paise, and the frontend cannot override them.
- **Test credentials only:** Set `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...` in the private `server/.env`. Live Razorpay keys are **blocked** by the code. Never commit your secrets.
- **No real money:** Test payments use Razorpay's sandbox UI; they cannot be used as a real payment collection workflow.
- **Download/read permission:** Student PDF access requires an authenticated account, a captured/verified test purchase, an administrator-confirmed distribution right, and a real PDF on the local server. This check is done during ticket issuance **and** on each stream request. Do not sell PDFs you are not entitled to distribute.
- **Late returns:** A physical loan returned after its due timestamp incurs a **flat ₹10 fine**, not ₹10 for every day late. This applies to general books and student textbooks. Outstanding fines are shown in borrowing dashboards; **online collection/settlement of fines is not implemented**. Staff can later record settlements. Previously-assessed historical fines are preserved.
- **Peer book listings:** New listings and any edited listing/photo become `pending` and are invisible in discovery, details, photos, and exchange requests until the admin reviews them. Admin → Peer Exchange has **Approve / Reject** controls. Rejected listings can be edited and resubmitted. Pre-existing listings without a review status also stay hidden until reviewed.

## Setup

1. Extract the ZIP. Install packages with `npm install` from the project root (see main README).
2. Copy `server/.env.example` to `server/.env`, then configure MongoDB as a local **replica set**, JWT/admin secrets, and your Razorpay **test** keys. Never put keys in frontend files.
3. Start the backend/frontend using the project README.
4. Log in as admin; upload or import textbook PDF files and confirm rights for files you are permitted to distribute. Unlicensed/missing PDFs cannot be purchased.
5. Log in with a student account → Student Library → Class/PUC → subject → **Buy access — ₹10 test payment**.
6. Use Razorpay's documented test payment methods and confirm the purchase to unlock all PDF parts for the subject. A failed payment never unlocks them.
7. To test peer moderation: student adds a book → listing says Pending; another account cannot find it → admin approves → visible publicly. Editing/photo re-upload makes it pending again.
8. For fines: borrow a physical copy, return it after its due date, and have staff confirm the actual return. The dashboard shows an outstanding ₹10 fine. Do **not** expect to pay fines online yet.

## Caveats

- This ZIP contains source code and book metadata, **not the actual textbook PDF files**, private keys or a seeded MongoDB database.
- Existing loans, payment records and purchase entitlements are retained. Older open ₹1 orders are marked obsolete and cannot be reused as ₹10 orders; historical assessed fines are not retroactively changed.
- Test mode still requires a reachable Razorpay API and internet for checkout. Database transactions need MongoDB replica-set support.
- If you deploy publicly, first conduct end-to-end security, legal-rights and payment tests, and arrange actual licensing before any real checkout.
