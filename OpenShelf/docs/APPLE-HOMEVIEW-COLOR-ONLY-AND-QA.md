# OpenShelf — Apple HomeView Color-Only Update and QA

## Scope

This release is based directly on `OpenShelf_Razorpay_Test_Rs10_Late_Fine_Admin_Approval.zip`.
It applies **only the colors** from the attached Apple HomeView reference. The original
Inter/Space Grotesk typography, page layout, spacing, components, content, animations,
React logic, Express routes and database models are preserved.

The attached guide's palette:

| Role | Hex |
|---|---|
| Primary action | `#0071E3` |
| Secondary action | `#0066CC` |
| Main text | `#1D1D1F` |
| White page | `#FFFFFF` |
| Light panel | `#F5F5F7` |
| Muted text | `#86868B` |
| Borders | `#E5E7EB` |
| Error | `#D92D20` |

Where a surface, highlight or shadow needs transparency, it uses an RGBA version
of the same palette. Semantic text/button contrast adjustments are also colors only.

## Files changed

- `client/src/styles/apple-homeview-colors.css` — new layer overriding **color declarations only**.
- `client/src/main.jsx` — imports the new palette after the existing stylesheet.
- `client/tailwind.config.js` — existing named Tailwind colours are updated to the palette.
- `client/src/components/home/HeroScene.jsx` — existing decorative book materials use blue/neutral colours.
- `client/src/pages/StudentLibrary.jsx` — Razorpay checkout's accent colour is blue.
- `client/index.html` — browser theme colour is white.
- `server/src/tests/studentPhysicalBorrowing.test.js` — corrected one stale **test expectation**
  from a superseded ₹10/day fine to the existing flat ₹10 late-return policy. The
  actual overdue-fine implementation was **not changed**.

The original `client/src/styles/index.css`, application components, all feature
controllers, services, models and routes remain unchanged from the source ZIP.

## Features preserved

- General Books collection and search
- Student Library, subject browsing and PDF access
- Borrowing and returns (general and student physical copies)
- Three-book active borrowing limit
- ₹10 flat overdue fine on an overdue return
- Razorpay **test-mode** ₹10 textbook subject checkout and verified PDF unlocking
- Peer-to-peer exchange listings and exchange requests
- Admin approval/rejection before peer listings are publicly visible
- Authentication, notifications, account/profile, and admin tools

## Automated QA performed

- **134 unit checks passed** when running all backend test files except the one
  requiring the missing runtime Mongoose package. This covers borrow and fine
  logic, peer-exchange approval, payment test mode, and PDF gates.
- **156 JavaScript and JSX files** parsed without syntax errors.
- **Source import audit passed** (`node scripts/verifySourceImports.mjs`).
- **New CSS** parsed without errors, including nested media queries.
- Byte comparison against the original ZIP confirms only the listed files differ.
- Archive file-integrity check passed.

## Checks to run on your own laptop

A complete browser/end-to-end run needs **Node dependencies, MongoDB, your own
Razorpay test-mode credentials, and uploaded/licensed PDF files**. Those were not
available in the testing environment, so *a live payment or database-backed UI
run has not been claimed*.

From the extracted project root:

```sh
npm run install:all
npm test
npm run verify:imports
npm run build
npm run dev
```

Configuration: copy `server/.env.example` to `server/.env`, add your local
MongoDB connection, app secret and **Razorpay TEST keys**. Do not use production
Razorpay credentials in a PBL test project and do not commit `.env`.

Then test manually: student login, catalogue search, school/PUC selection,
borrowing with due-date handling, a late return with ₹10 fine, a pending peer
listing that remains hidden before admin approval, approval/rejection in admin,
₹10 test checkout, rejected/failed checkout, and PDF unlock only after server
verification. A real browser smoke test was attempted but the execution
sandbox blocked the browser from opening local pages.
