# OpenShelf — Phase 14: Notifications, Search and Reports

## Source and scope

This phase extends `OpenShelf-Student-Physical-Borrowing-Formatted-Code.zip` rather than replacing it. All earlier source files are retained. **Razorpay remains disabled**, and Student Category PDFs remain free. No Gmail/OTP secrets, bank details, or private `.env` files are included.

## Features delivered

### Student in-app notifications

- Every authenticated student can open **Dashboard → Notifications**.
- MongoDB-backed paginated inbox, unread-only filter, unread count, **mark read** and **mark all read**.
- The top-bar bell and sidebar unread count update while the dashboard is open.
- The API checks user ownership on every read update.
- Automatic checkout, returns, extension decisions, peer exchange requests/messages and reminders generate actual persisted alerts.
- Reminder records use unique event keys to avoid duplicates from repeated jobs or server restarts.
- The `notifications:process` command scans due/overdue General and Student loans even when Gmail is unconfigured; the server also runs this scan on a configurable interval.

### Global search

- Open **Search** from the homepage header or from the User Dashboard.
- Searches published General Books, published Student Textbook subjects, and available peer exchange listings.
- `All collections` gives a six-result preview in each collection; tabs provide real pagination for full results.
- Filters for physical availability; the Student tab also supports class/year filtering.
- No student accounts, mobile numbers, recipient Gmail addresses or PDF file paths appear in public search results.
- Searches use escaped regular expressions, bounded inputs, category filters and paginated MongoDB queries.

### Admin reports and announcements

- Existing detailed borrowing/overdue report is retained.
- Adds collection breakdowns by genre, study level and loan status, plus real account/exchange statistics.
- Outstanding fine display is **clearly marked as a bounded recent-loan sample** when the collection has over 500 records in either loan type. It must not be misread as total revenue or full outstanding balance.
- `Admin Dashboard → Announcements` sends plain-text in-app messages to up to 1,000 active students with confirmation before publication. No automatic emails or SMS are sent.

## API routes

| Method | Route | Authentication | Function |
|---|---|---|---|
| GET | `/api/notifications?page=1&unread=true` | Student | Paginated personal notifications + unread count |
| PATCH | `/api/notifications/:id/read` | Student owner | Mark one read |
| PATCH | `/api/notifications/read-all` | Student | Mark all own notifications read |
| GET | `/api/search?q=term&type=all` | Public | Three public catalogue previews |
| GET | `/api/search?q=term&type=student&page=2` | Public | Search one collection with pagination |
| GET | `/api/admin/reports/summary` | Administrator | New database-backed reports |
| POST | `/api/admin/announcements` | Administrator | Broadcast in-app notification to active students |

## New source files

- `server/src/models/Notification.js` (updated existing model with type, event key and indexes)
- `server/src/services/notificationRules.js`, `notificationService.js`, `inAppReminderService.js`, `searchRules.js`
- `server/src/controllers/notificationsController.js`, `searchController.js`, `reportingController.js`
- `server/src/routes/notificationRoutes.js`, `searchRoutes.js`
- `server/src/scripts/processNotifications.js`
- `server/src/tests/phase14Rules.test.js`
- `client/src/pages/GlobalSearch.jsx`
- `client/src/components/notifications/NotificationsPanel.jsx`
- `client/src/components/admin/Phase14AdminTools.jsx`

Modified existing API setup, model, borrowing/reminder services, dashboards, homepage, CSS and npm scripts.

## Windows PowerShell / VS Code setup

From the extracted OpenShelf root:

```powershell
node -v
npm -v
npm run install:all
npm test
npm run build
npm run dev
```

Keep your private working `server/.env` and `client/.env` from the last project. The MongoDB URI should still target the existing `openshelf` database in replica-set mode. Continue using `TEXTBOOKS_ROOT=D:\Library\Textbooks` for locally hosted PDFs.

Optional `server/.env` settings:

```dotenv
NOTIFICATION_JOBS_ENABLED=true
NOTIFICATION_JOBS_INTERVAL_MINUTES=60
```

In-app reminders do **not** require SMTP. The backend process needs to be running for automatic scans. To scan manually:

```powershell
npm run notifications:process
```

This command does not send emails or modify borrowing/stock records; it inserts idempotent in-app reminders for applicable real loans.

## Manual testing checklist

1. Log in as Student A and open **Notifications**. Empty accounts should show a real empty state.
2. Borrow a General Book or stocked Student Textbook. A checkout notification should appear.
3. Verify **Unread only**, one-item read, **Mark all read**, and the sidebar badge.
4. Log in as Student B; confirm Student A's notifications cannot be seen or marked read by Student B.
5. Open **Search**, search a known General Book, textbook subject, and peer-listed book.
6. Test tabs, pagination, the study-level filter and the available-only filter.
7. Confirm no private email/phone appears in public search response data.
8. Log in as administrator and open **Reports**. Compare counts with MongoDB Compass.
9. Publish a test announcement, then verify delivery to an active student account.
10. Run `npm run notifications:process` twice. Confirm no duplicate due reminder for the same book and due date.
11. Confirm PDF reading remains free, borrowing still works, and Razorpay stays disabled.
12. Run `npm test` and `npm run build` on the local machine.

## Known limits / verification

- Code-level tests and parsing can be run here. Live MongoDB transactions, SMS/Gmail delivery, and an actual build require installed dependencies and a configured local service.
- Search opens the corresponding collection page, not a new deep link to an individual record.
- Announcements are limited to 1,000 active accounts per action; a large deployment needs a background, batched outbox.
- In-app reminders scan a maximum of 1,000 open loans per collection each run. At larger scale, add cursor-based batching.
- End-to-end security and mobile-browser testing remain Phase 15 work.
