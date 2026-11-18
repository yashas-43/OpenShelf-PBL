# Phase 13 — Peer-to-Peer Book Exchange and default General Book cover

**This release adds Phase 13 only. Phase 12 payment integration is deliberately deferred.**

## Files and preservation

This cumulative ZIP is built directly from `OpenShelf-Phase-11-Complete-Admin-Dashboard.zip`; every original Phase 11 file remains present, along with the latest textbook manifest and Gmail/OTP features. No existing private `.env` values are included. The uploaded OpenShelf cover is bundled at `client/public/openshelf-general-cover.jpg` and is used on **every General Book card**, **General Book details**, and **student borrowed-General-Book histories** regardless of the book's old `coverUrl`. Database cover records are preserved and editable if future requirements change.

New source files:

- `client/src/pages/PeerExchange.jsx`
- `client/public/openshelf-general-cover.jpg` (user-supplied image)
- `server/src/controllers/peerExchangeController.js`
- `server/src/routes/peerExchangeRoutes.js`
- `server/src/services/peerExchangeRules.js`
- `server/src/services/peerPhotos.js`
- `server/src/models/ExchangeMessage.js`
- `server/src/models/PeerListingReport.js`
- `server/src/tests/peerExchangeRules.test.js`
- `docs/PHASE-13-PEER-EXCHANGE.md`

Updated files: `client/src/App.jsx`, `client/src/pages/GeneralBooks.jsx`, `client/src/pages/UserDashboard.jsx`, `client/src/pages/AdminDashboard.jsx`, `client/src/styles/index.css`, `server/src/app.js`, `server/src/models/PeerBookListing.js`, `server/src/models/ExchangeRequest.js`, `server/src/controllers/adminController.js`, `server/src/routes/adminRoutes.js`, `server/.env.example`, `README.md`, `.gitignore`.

## Setup on Windows 10/11 and VS Code

1. Make a backup of your **existing** project and MongoDB before switching releases. Extract this ZIP and open its `OpenShelf` folder in VS Code.
2. Copy **only your local private** `server/.env` and `client/.env` from the old project. Never upload or email those files. Keep `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `TEXTBOOKS_ROOT`, `EMAIL_*` and `RESET_TOKEN_SECRET` from your working installation.
3. Use a local MongoDB replica set (your previous `rs0` PRIMARY). MongoDB is required for listing/request persistence; transaction support is required for accepted/cancelled/completed exchanges.
4. From the new OpenShelf project root, in **PowerShell**:

   ```powershell
   node -v
   npm -v
   npm run install:all
   npm test
   npm run build
   npm run dev
   ```

5. Open `http://localhost:5173`, select **Peer exchange** from the header or homepage, or open **User Dashboard → Peer-to-Peer Exchange / My Listed Books / My Exchange Requests**. Register or sign in as a normal student to list/request. The admin user manages reports at **Admin Dashboard → Exchange Moderation**.
6. Book photos are stored by default in a private `peer-photo-uploads` directory relative to the backend working directory. The optional `PEER_PHOTO_ROOT` variable can override it with a dedicated writable folder (for example `D:\Library\PeerPhotos`). Keep it private. Files are **not** inside the ZIP; back them up separately. Only JPG/PNG/WebP of up to 4 MiB are accepted; no PDFs.

No new dependencies beyond Phase 11 were added. No database seeding or fake listings are required. Old database records are not deleted. New MongoDB collections are created when real records are saved.

## API reference

Public:

- `GET /api/peer-exchange?page=1&search=title&type=exchange` — public available listings, without owner email
- `GET /api/peer-exchange/:id` — listing details without private contact data
- `GET /api/peer-exchange/:id/photo` — visible listing photo, where provided

JWT authenticated student (`Authorization: Bearer <student JWT>`):

- `GET /api/peer-exchange/mine` — own listings, including status and own consent flag
- `POST /api/peer-exchange` — create physical listing; requires `title`, `author`, `description`, `category`, `condition`, `exchangeType`, and boolean `contactConsent`
- `PATCH /api/peer-exchange/:id` — update own available/unavailable listing (same fields)
- `POST /api/peer-exchange/:id/photo` — multipart form field `photo` (optional image)
- `PATCH /api/peer-exchange/:id/status` — available/unavailable/exchanged when permissible
- `DELETE /api/peer-exchange/:id` — soft remove owner listing, no accepted active exchange
- `POST /api/peer-exchange/:id/requests` — create a real interest request, returns `composeUrl` only if listing owner explicitly opted into Gmail sharing
- `GET /api/peer-exchange/requests/mine` — incoming and outgoing requests; no email in response
- `POST /api/peer-exchange/requests/:id/accept|reject|cancel|complete` — role-restricted state transitions
- `GET /api/peer-exchange/requests/:id/contact` — opt-in only, requester-only Gmail compose link; **never sends** email
- `GET /api/peer-exchange/requests/:id/messages` — owner/requester-only private conversation
- `POST /api/peer-exchange/requests/:id/messages` — save a private message (up to 1,000 characters)
- `POST /api/peer-exchange/:id/reports` — submit one report per account/listing

JWT authenticated administrator:

- `GET /api/admin/peer-listings` and `DELETE /api/admin/peer-listings/:id` (existing moderation tools enhanced)
- `GET /api/admin/peer-reports` and `PATCH /api/admin/peer-reports/:id/resolve` (new)

## Privacy and safety notes

- A public listing contains book details, status, and owner's display name, **never a personal email address**.
- The owner **opts in explicitly** to Gmail disclosure. The email is retrieved from MongoDB after authentication. If opted out, users can send private in-app messages instead. A compose link opens Gmail with editable fields, and does not send a message automatically.
- Only the listing owner can change its fields/status. Only its requester and owner can read/send messages. Only the owner may accept/reject/complete, and only the requester may cancel. Admin moderation is role protected.
- A single accepted request reserves the listing inside a MongoDB transaction; competing pending requests are rejected. Owner completion marks the listing exchanged; the owner can relist later. An informal lending listing is **not** a formal dated physical-loan record and does not modify library borrowing stock.
- User reports do not automatically prove misconduct; an admin reviews them. Moderated/removed listings cease public discovery. An accepted exchange should be completed or cancelled before owner deletion.
- Student PDFs remain free, separate and protected; General Books and peer-listed books have no PDF functionality. Razorpay/payment capability remains deferred.

## Local manual testing checklist

- [ ] Open General Books and confirm **every** displayed book has the same uploaded OpenShelf cover (catalogue, details, borrowing dashboard).
- [ ] Sign in with student A; create a genuine physical listing, toggle Gmail consent on/off, upload a small JPG/PNG.
- [ ] Open the public catalogue and see no owner Gmail. Search for student A's actual title/author.
- [ ] Student B sends an exchange request; student A sees it in Incoming requests and can accept or reject.
- [ ] With consent **off**, student B receives no owner email; verify private messages between A and B.
- [ ] With consent **on**, student B sees a link to open Gmail compose, and no email is sent automatically.
- [ ] Student A accepts; only one request can reserve a listing; complete the exchange and relist.
- [ ] Student B cancels a pending or accepted request, and reserved listing returns to available.
- [ ] Student B reports a listing; admin reviews/removes the listing and resolves the report.
- [ ] A different student cannot edit a listing or read private messages by calling the APIs directly.
- [ ] Verify student PDFs and automatic three-copy General Book borrowing are unchanged.
- [ ] `npm test` and `npm run build` finish without errors on your machine.

## Verification limits

Source-level unit tests and parsing can be run without MongoDB. End-to-end user requests, image files, transactions, browser rendering, and SMTP configuration require a running local environment. A production build must be tested using installed npm dependencies. **Nothing here represents fake listings, fake Gmail delivery, or a completed payment.**
