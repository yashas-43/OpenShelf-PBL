# PDF import conflict correction

This update fixes `Updating the path rightsConfirmed would create a conflict at rightsConfirmed` in `server/src/scripts/importStudentPdfs.js`.

The importer previously supplied `rightsConfirmed` in both `$set` and `$setOnInsert` for an existing renamed PDF. MongoDB rejects this. Now `$setOnInsert` sets only `source: 'local'`; the `StudentPDF` schema already defaults `rightsConfirmed` to `false` for new records. Renamed paths still reset rights confirmation to false, and `--rights-confirmed` continues to require an explicit opt-in. No database records were deleted or modified in the ZIP.

## On Windows

1. Preserve your existing private `server/.env` and `client/.env` in the updated project.
2. Start MongoDB and ensure its replica set is PRIMARY.
3. From the OpenShelf root, run:

```powershell
npm run pdf:check -- --root "D:\Library\Textbooks"
npm run pdf:import -- --root "D:\Library\Textbooks"
```

Import only after `pdf:check` reports all files valid. This package does not contain the local PDF files. The importer maintains textbook and reading-history document identities when it can unambiguously match renamed files. Confirm published rights before enabling public streaming.

## Verification limitations

Source syntax and tests are local checks. Actual MongoDB imports and PDF streaming must be confirmed on the user's computer.
