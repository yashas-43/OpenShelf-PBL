# OpenShelf — Bulk Student Textbook Physical Stock Save

## Added

The Admin Dashboard → Student PDFs screen now has a **Save All Changes** button. Change physical stock for any number of subjects (including across pagination and level filters). Inputs remain unsaved until the administrator saves them together.

Each textbook still has **Enter 3 copies** as a convenience; this only changes the input, and does not assert that physical copies exist. The administrator must confirm the physical inventory before saving.

## Endpoint

`PATCH /api/admin/student-borrowings/textbooks/stock/bulk`

Requires a valid administrator token. Payload example:

```json
{
  "updates": [
    { "id": "507f1f77bcf86cd799439011", "totalCopies": 3, "expectedTotalCopies": 0 },
    { "id": "507f1f77bcf86cd799439012", "totalCopies": 2, "expectedTotalCopies": 0 }
  ]
}
```

The server checks that there are 1–100 unique textbook IDs and integer quantities between 0 and 10000. Each row is reconciled against active physical loans and its previously loaded `totalCopies`. Changes and audit records run inside one MongoDB transaction, so an invalid or stale row rolls back the entire batch. It does not alter PDFs or General Books. A MongoDB replica set is required.

## Test it on Windows

1. Extract the updated ZIP. Copy your existing private `.env` files to `server` and `client`.
2. Run `npm run install:all`, `npm test`, `npm run build`, `npm run dev`.
3. Log in as the administrator and select **Student PDFs**.
4. Change stock on one page. Navigate to another page, edit another subject, and return to the first page to confirm the draft persists.
5. Click **Save All Changes** and confirm the physical book counts. Check that both edits persist after refreshing.
6. Test a reduction below the number of currently borrowed copies. The save should reject the whole batch without partial changes.
7. Test using another administrator session to change one quantity before saving stale edits. The batch should show a conflict.

## Important

Only enter quantities for real physical books in your library. Digital PDF access is independent of physical stock. Razorpay is still disabled.
