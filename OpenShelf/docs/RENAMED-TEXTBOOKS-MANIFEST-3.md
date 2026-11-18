# OpenShelf — Renamed Student Textbooks, November 2026

## What changed

This is a **cumulative update** of the last OpenShelf ZIP, not a replacement project. The complete Phase 9 automatic borrowing, three-copy inventory, login, User Dashboard, 3D homepage, admin borrowing desk, and student PDF reader remain in place.

`data/Textbooks-Manifest.csv` is the latest user-supplied `Textbooks-Manifest(3).csv`, copied without changing original folder names, filenames, subjects, paths, or recorded file sizes.

The supplied collection has **58 PDF files in 37 level/subject folders**: **16 textbooks** with `Textbook.pdf` and **21 textbooks** with `Textbook part1.pdf` and `Textbook part2.pdf`. Within a given level and subject, those two parts constitute **one textbook**, not two separate book listings. The printed book title is the supplied generic `Textbook`; the subject and class/year identify it. We do **not** infer publisher titles or editions from the generic filenames.

The reader now displays one textbook card and clear, separate `View Part 1`, `View Part 2` buttons when both parts are present, or `View PDF` for single-file subjects. The API and importer keep the original `FileName` and `RelativePath` values. No PDF files are included in the project ZIP.

The importer validates grouping (no missing partner, mismatched titles, or repeated part numbers). It updates real MongoDB records only **after verifying all local PDF files**. It conservatively reuses an old PDF record when a renamed PDF is uniquely matched by study level, subject, and part, preserving its `_id` and attached reading history. When ambiguous, it does **not** guess: old unmatched local documents are marked inactive and a new PDF record is created. Reading progress for such ambiguous renamed records may not transfer.

## Windows / VS Code setup

1. **Back up your MongoDB database** and current `server/.env` and `client/.env` before switching versions. Do not put private `.env` files in a shared ZIP.
2. Extract this ZIP, open the inner `OpenShelf` folder (the one containing `package.json`) in VS Code.
3. Transfer your existing private `.env` files *locally* into the matching `server` and `client` folders, or create them from the included `.env.example` files. Do not paste secrets into a chat or screenshot.
4. Confirm MongoDB is running as replica-set PRIMARY (`rs.status().myState` returns `1` in MongoDB Compass Shell). Use the existing `openshelf` database in `MONGODB_URI`.
5. Verify `TEXTBOOKS_ROOT=D:\Library\Textbooks` in `server/.env`. Your **actual PDFs must already have the new filenames**, precisely as listed in the CSV.
6. From the OpenShelf project root, run:

   ```powershell
   npm run install:all
   npm run pdf:check -- --root "D:\Library\Textbooks"
   ```

   **Do not import** until the check reports all 58 files verified and 0 errors. If your local filenames differ, fix the files or manifest first; the ZIP contains only metadata, not the PDFs.
7. Import the verified PDF metadata:

   ```powershell
   npm run pdf:import -- --root "D:\Library\Textbooks"
   ```

   This changes StudentTextbook and StudentPDF records in your existing MongoDB database. Old local path entries absent from the new manifest are set inactive; the importer does not delete your PDF files.
8. Start OpenShelf:

   ```powershell
   npm run dev
   ```

   Navigate to `http://localhost:5173`, then **Student Category → School / PUC → Class / Year → Subject**. Test a single-file subject and a two-part subject. Sign in before clicking the PDF reader.
9. Optionally check:

   ```powershell
   npm test
   npm run build
   npm run audit:stock
   ```

**If you previously initialized the three-copy stock inventory, do not rerun the stock migration to update PDF titles.** The PDF manifest importer does not touch physical General Book copies or borrowing records.

### Existing rights and safety limits

- These PDFs are **free** in Student Category, with secure backend streaming; there are **no General Books PDFs**.
- Production reading requires distribution permissions to be confirmed according to the project's documented workflow; imported records are not falsely marked rights-confirmed.
- Current `BookTitle` values are intentionally generic, not verified publication titles.
- Reading files requires the server running on the computer with `D:\Library\Textbooks` available, since the 3+ GB PDF content is **not** embedded in this ZIP.
- Gmail OTP, payments, and full peer-to-peer exchange remain later phases and have **not** been added here.

## Testing checklist

- [ ] Correct existing `openshelf` database used; no new database created
- [ ] MongoDB replica set PRIMARY
- [ ] `pdf:check` verifies 58/58 files and 0 errors
- [ ] `pdf:import` completes without database errors
- [ ] 5 study levels and 37 subjects listed
- [ ] Single-file `Class 8 / Social Science` shows one `View PDF` action
- [ ] Two-part `Class 8 / English` shows `View Part 1` and `View Part 2` within one textbook card
- [ ] `Class 9 / English` includes both parts
- [ ] `2nd Puc / Physics` and `2nd Puc / Electronics` stay in separate subject folders
- [ ] Exact folder labels such as `Maths`, `Mathematics` and `Business Study` are preserved
- [ ] General Books still have no PDF actions and physical borrowing works
- [ ] Student login and PDF reader access work on your laptop

## Changed / added files

- Updated: `data/Textbooks-Manifest.csv` (the newly supplied manifest)
- Updated: `server/src/services/studentPdfManifest.js` (textbook grouping validation)
- Updated: `server/src/scripts/importStudentPdfs.js` (group title and safe rename relinking)
- Updated: `server/src/tests/studentPdfManifest.test.js` (new 58-file / 37-textbook tests)
- Updated: `client/src/pages/StudentLibrary.jsx` (one textbook card with multiple part buttons)
- Updated: `client/src/styles/index.css` (matching card styles)
- Updated: `README.md` (setup pointer)
- Added: `docs/RENAMED-TEXTBOOKS-MANIFEST-3.md`
