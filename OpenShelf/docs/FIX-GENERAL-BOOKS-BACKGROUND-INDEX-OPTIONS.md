# General Books import: frozen-index-options error

## Symptom
`npm run catalogue:apply -- --confirm-archive` fails with:

`Cannot add property background, object is not extensible`

## Cause
The General Book text-index settings were defined as a frozen configuration object. Passing the same frozen object directly to Mongoose's schema index registration meant Mongoose could not add its own index-building options (including `background`).

## Changes
- `server/src/models/Book.js`: passes mutable copies of the fields and options to `bookSchema.index(...)`.
- `server/src/scripts/repairGeneralBookTextIndex.js`: passes mutable copies of the fields and options to the MongoDB driver for consistent handling.
- `server/src/tests/generalBookMutableIndexOptions.test.js`: regression test ensures the Mongoose index options are extensible.

The fix does **not** alter the original General Book language values, including Sanskrit. It also does not change or delete MongoDB records on its own.

## Windows / VS Code steps
1. Extract the corrected OpenShelf ZIP and open the inner `OpenShelf` project folder.
2. Copy your private `server/.env` and `client/.env` files into the corresponding folders. Do not include credentials when sharing ZIP files.
3. Make sure MongoDB is running and the existing replica set is primary.
4. Run `npm run install:all` from the project root if packages are not installed.
5. Run `npm run catalogue:text-index:preview` to check that the multilingual text index is healthy. If it is still legacy, make a verified backup and follow the existing index repair instructions. Do **not** rebuild a healthy index.
6. Run `npm run catalogue:preview`, review any blockers, and make a current MongoDB backup before applying.
7. Stop running OpenShelf servers before the migration, then run `npm run catalogue:apply -- --confirm-archive`.
8. Run `npm run catalogue:duplicates:preview` to inspect remaining duplicate records; do not remove records tied to borrowing history.
9. Run `npm run dev` and inspect General Library.

## Validation
Run `npm run verify:imports`, `npm test`, and `npm run build` locally. This package was source-checked and the dependency-free text-index tests passed in the preparation environment; live MongoDB integration and the full frontend build require a configured local project.
