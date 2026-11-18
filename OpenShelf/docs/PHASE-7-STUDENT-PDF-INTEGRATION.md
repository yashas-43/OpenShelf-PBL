# OpenShelf — Student PDF Integration on top of Phase 9

**Status:** Code and bundled CSV are integrated. Your actual PDFs have **not** been copied into the ZIP or imported into MongoDB in this environment. Complete the local verification/import steps on the Windows computer containing your PDFs. Keep all Phase 9 borrowing functionality.

## What the provided CSV actually contains

Source: `data/Textbooks-Manifest.csv`, copied unchanged from the uploaded `Textbooks-Manifest(2).csv`.

| Exact level folder | PDF files | Subject folders |
|---|---:|---:|
| Class 8 | 11 | 6 |
| Class 9 | 12 | 6 |
| Class 10 | 12 | 6 |
| 1st Puc | 11 | 9 |
| 2nd Puc | 12 | 10 |
| **Total** | **58** | **37** |

- Class 8 `Social Science` contains **one** PDF; no Part 2 is invented.
- Class 9 `English` now contains `9th Eng SL Part - 1 2025-26.pdf` as well as `9th English SL Part - 2 2026-27.pdf`. **The publication years differ.** Check whether this is intentional before using both as a single edition.
- 2nd PUC `Physics` now lists `73 2nd PUC - Physics- Part-1--2022 (1).pdf`. There is **no Part 2 in the manifest**; it will not be invented.
- 2nd PUC `Electronics` is in its own folder, not in Physics.
- `1st Puc/Business Study`, `Class 9/Maths`, `Class 10/Maths`, etc. keep the **exact folder spellings** from the CSV.
- `2nd Puc/Mathematics/M1.pdf` has no explicit Part 1 label in the CSV. It remains an unlabeled PDF and is not automatically assigned a part number.
- Manifest file sizes total approximately 3,315 MB. The CSV has paths, names and approximate sizes, **not PDF bytes**.

## Local setup — Windows PowerShell in VS Code

1. Unzip the package and **open the `OpenShelf` project folder**, not its parent folder.
2. Install the existing dependencies:

   ```powershell
   npm run install:all
   ```

3. Configure MongoDB and authentication using the existing instructions. Keep existing `.env` files and credentials. Only if this is a fresh extraction, create them:

   ```powershell
   Copy-Item server\.env.example server\.env
   Copy-Item client\.env.example client\.env
   ```

   Add or update these lines in `server/.env` (the path must be the real folder on the computer **running the backend**):

   ```dotenv
   TEXTBOOKS_ROOT=D:\Library\Textbooks
   MONGODB_URI=mongodb://127.0.0.1:27017/openshelf?replicaSet=rs0
   ```

   The shown database URI is only an example. If your existing Phase 9 MongoDB URI works, keep it. Phase 9 and this importer rely on MongoDB transactions and therefore need a replica set (a single-node replica set is fine).

4. **First verify all 58 real files on your laptop.** This step only reads the CSV and the file headers and does not connect to MongoDB or change the collection:

   ```powershell
   npm run pdf:check -- --root "D:\Library\Textbooks"
   ```

   If any file is missing, moved, malformed or outside the root, it prints the exact failing relative path, exits with an error, and does not perform an import. If you changed any filenames or folders after generating the CSV, regenerate the manifest and compare it before importing. The included CSV reflects the 58 filenames above.

5. Once verification passes, **import the real files' metadata** into MongoDB. The physical PDFs remain in `D:\Library\Textbooks` and are streamed as needed; no 3.3-GB copy or upload occurs:

   ```powershell
   npm run pdf:import -- --root "D:\Library\Textbooks"
   ```

   Import is transactional. It updates existing paths instead of duplicating records, and archives removed local paths rather than permanently deleting history. Re-import as necessary after changing the collection. The script does not create substitute documents. Local storage must remain mounted whenever the backend runs.

6. Run OpenShelf:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:5173` in a browser, log in with a student account, and navigate **Student Library → School or PUC → level → original subject → View PDF**. You can also open the Student Library from the User Dashboard.

7. Run the available tests and client build:

   ```powershell
   npm test
   npm run build
   ```

   The importer does not need payment credentials. PDFs are **free**. No PDF endpoints were added to General Books.

## Reader behavior and privacy

- Subjects, part listings and exact filenames are returned from **MongoDB**, not hardcoded mock book records. Before local import, the Student Library shows a truthful empty state.
- PDF access requires an authenticated student or administrator. Reader access is issued using a **20-minute, HttpOnly, PDF-specific cookie**. No session token is placed into a public PDF URL. PDF file requests require that cookie and a still-active account; sign-out requests the cookie to be cleared.
- The API resolves only *relative paths* from the configured directory, rejects traversal and escaped symlinks, verifies `%PDF-`, and streams byte ranges for native browser PDF viewers. The frontend must be permitted as a frame ancestor (`CLIENT_URL`).
- The frontend uses the browser's native PDF viewer inside an iframe, with an OpenShelf jump-to-page form, previous/next buttons, and `ReadingHistory` in MongoDB. **Pages changed inside the native browser PDF toolbar cannot be automatically observed**. Use the OpenShelf Page controls to save progress, or open the PDF again and continue from the last saved position.
- After 20 minutes or a logout/password change, close and reopen the PDF to obtain new authorized access. The "Renew access" action refreshes the cookie.
- Production deployment: keep the frontend/API on compatible same-site HTTPS origins to allow the scoped secure cookies. Publish or share PDFs only where you have rights to do so. `rightsConfirmed` defaults to `false`, and the production API **will not show or stream unconfirmed PDFs**. After you confirm distribution rights for *every file*, the importer supports `--rights-confirmed` on a re-import. Do **not** use that flag without permission.
- The included manifest contains the supplied Windows absolute paths; only its **relative paths** are used by the backend importer.

## Endpoints added

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/student-pdfs/catalog?level=Class%208` | Published metadata (public) |
| POST | `/api/student-pdfs/:id/access` | Student/admin JWT, sets HttpOnly stream cookie |
| GET / HEAD | `/api/student-pdfs/files/:id` | Valid, scoped stream cookie |
| POST | `/api/student-pdfs/logout` | Clear scoped reader cookie at logout |
| PUT | `/api/student-pdfs/:id/progress` | Student JWT |
| GET | `/api/student-pdfs/history` | Student JWT |

**Models:** `StudentTextbook`, `StudentPDF`, and `ReadingHistory`. No PDF model references `GeneralBook` and no PDF API exists under `/api/books`.

## Created / modified files

**Added:** `data/Textbooks-Manifest.csv`; `server/src/services/studentPdfManifest.js`, `studentPdfFiles.js`; `server/src/models/StudentTextbook.js`, `StudentPDF.js`, `ReadingHistory.js`; `server/src/scripts/importStudentPdfs.js`; `server/src/controllers/studentPdfController.js`; `server/src/routes/studentPdfRoutes.js`; `server/src/tests/studentPdfManifest.test.js`; this document.

**Modified:** `client/src/pages/StudentLibrary.jsx`, `client/src/pages/UserDashboard.jsx`, `client/src/styles/index.css`, `server/src/app.js`, `server/.env.example`, `server/package.json`, project-root `package.json`, and `README.md`.

## Local manual test checklist

- [ ] Run `pdf:check` and verify **58/58** files without errors.
- [ ] Run `pdf:import` with a running replica-set MongoDB and verify the 58 records appear in 37 subject groups.
- [ ] Class 8 Social Science lists exactly one file.
- [ ] Class 9 English displays the two real filenames, including the **different edition years**.
- [ ] 2nd PUC Physics lists only the one real Part 1 PDF; Electronics appears separately.
- [ ] 2nd PUC Mathematics retains `M1.pdf` without a fabricated Part 1 label.
- [ ] Class 9/10 subject is `Maths`, while Class 8 subject is `Mathematics`.
- [ ] Not-logged-in visitors see a login prompt before PDF streaming.
- [ ] Log in and open PDFs, including a large file and a multipart subject; browser PDF range requests work.
- [ ] Save page 2 with the OpenShelf controls, close and reopen: page 2 is restored; Reading History shows the real record.
- [ ] Access denied for direct PDF file URL without a scoped, nonexpired cookie.
- [ ] General Books has no View PDF, Read PDF, PDF upload or PDF endpoint.
- [ ] Borrow and return functionality from Phase 9 still works.
- [ ] `npm test` and `npm run build` pass locally.

## Limitations not concealed

The uploaded input was a **CSV only**, not 58 actual PDF files. This environment cannot inspect their bytes or the Windows `D:` drive. Here, manifest metadata and synthetic local test files can be validated, but real PDF streaming, MongoDB import and the browser integration cannot be verified against your laptop until you run the commands above. If your folder changed since the manifest was generated, the importer will refuse partial registration and print errors. The UI does not claim unavailable books have been imported.
