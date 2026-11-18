# General Books import — Sanskrit text-index fix

## Problem

The original 326-book General Books source includes Sanskrit, Kannada, Hindi and other
legitimate catalogue languages. MongoDB's **old** book text index uses the document
field `language` as its *search-stemming language override*. When a Sanskrit book is
inserted, MongoDB returns `language override unsupported: Sanskrit`.

Do **not** change the books to English or delete your database. The fix changes only
how the text index tokenizes titles and descriptions. All 326 titles, authors,
source IDs and original language names remain intact.

## Exact Windows PowerShell steps

From the extracted `OpenShelf` directory in VS Code:

1. Ensure `server/.env` has the correct `MONGODB_URI` and MongoDB is running.
2. Install dependencies once with `npm run install:all` if necessary.
3. Keep the website/server stopped while rebuilding the index.
4. Preview the repair (no writes):

   ```powershell
   npm run catalogue:text-index:preview
   ```

5. Back up the MongoDB **openshelf** database using MongoDB Database Tools:

   ```powershell
   $backup = "D:\Library\openshelf-before-text-index-$(Get-Date -Format 'yyyyMMdd-HHmmss').archive.gz"
   mongodump --uri "mongodb://127.0.0.1:27017/openshelf?replicaSet=rs0&directConnection=true" --archive="$backup" --gzip
   if ($LASTEXITCODE -ne 0) { throw 'Backup failed: do not proceed.' }
   Get-Item $backup
   ```

   If `mongodump` is missing, install the official MongoDB Database Tools first.
   Check that the backup is not empty. The URI in the example applies only to
   the existing local `openshelf` setup; use your private `MONGODB_URI` for a
   different deployment, without exposing credentials.

6. Apply **only after you have a verified backup**:

   ```powershell
   npm run catalogue:text-index:apply -- --backup-confirmed
   ```

   The command drops only the inspected **old text-search index** and creates an
   index that does not interpret `Book.language` as a MongoDB stemming language.
   It does not delete or change book records or stock. Search tokenization
   changes to language-neutral matching (no language-specific stemming).

7. Verify the catalogue preview and import:

   ```powershell
   npm run catalogue:check
   npm run catalogue:preview
   npm run catalogue:apply -- --confirm-archive
   ```

   Review the preview and blockers before the final command. **If the import
   has already inserted some books, don't delete them: the importer reuses
   matching source records.** If the index repair fails after removing the old
   index, rerun its repair command; no book records have been removed.

8. Check duplicates, then start the site:

   ```powershell
   npm run catalogue:duplicates:preview
   npm run dev
   ```

Only apply duplicate cleanup after preview, a verified backup, and zero blockers.
Newly inserted books begin with zero physical stock until real copies are verified.

## Verification limitations

Unit tests validate detection and safe refusal of unfamiliar indexes. Real index
rebuilding and the 326-book MongoDB import must be run and verified on your laptop.
