# OpenShelf: PDF setup, login overlay and cool-blue improvements

## Why you see “Digital PDF not yet ready”
The source ZIP contains textbook catalogue metadata and `data/Textbooks-Manifest.csv`, **not** the copyrighted textbook PDF bytes. A published subject entry or physical inventory record does not mean a digital PDF has been uploaded. PDF reading requires an actual valid PDF on the backend, administrator-confirmed distribution permission, and a completed Razorpay **test** purchase. The app now distinguishes missing uploads, rights awaiting approval, incomplete multipart textbooks, and missing local files. It will not launch checkout unless every authorised part is present.

### Option A — upload via Admin Dashboard
Sign in as administrator, open **Student PDFs**, upload an authorised PDF and select its study level and subject. For a split textbook, add Part 1 and Part 2 to the **same subject**, mark both appropriately, and confirm the distribution rights. Check the admin interface for the exact upload fields available. Do not upload files without redistribution rights.

### Option B — existing textbook folder & manifest
1. Set `TEXTBOOKS_ROOT` in `server/.env` to the **absolute** folder containing the PDFs (for example, `D:\Library\Textbooks`, not your ZIP folder).
2. Place the PDF files at the exact relative paths given in `data/Textbooks-Manifest.csv` (for example `Class 8\English\...pdf`). Paths and names must match the manifest, including Part 1 and Part 2.
3. From the project root, with Node.js dependencies installed, run:

   ```powershell
   npm run pdf:check -- --root "D:\Library\Textbooks"
   ```

4. Only after checking that you are legally permitted to serve these files, import **and confirm the rights**:

   ```powershell
   npm run pdf:import -- --root "D:\Library\Textbooks" --rights-confirmed
   ```

5. The importer stores **metadata only**, not PDF bytes. Keep the folder available while the server is running. Refresh the Student Library page.

The importer checks the entire manifest; if files are missing, it aborts without silently creating broken entries. For one-by-one additions, use the Admin Dashboard instead.

## Payments and multi-part textbooks
Razorpay checkout remains **test mode only** at ₹10 **per subject**. Subject purchase records are stored against `StudentTextbook` (not each individual PDF). Once confirmed, Part 1 and Part 2 for that same subject both unlock with **no second payment**. Checkout is blocked while any part is incomplete, unapproved or unavailable on disk.

## Authentication modal
The sign-in/register modal is now rendered into `document.body` using a React portal and sits above the General Book detail dialog. You can click **Log in to borrow** without closing the book first.

## Theme
Primary blue `#0769D7`, crisp white and cool off-white `#F7F9FC`, subtle ice-blue backgrounds `#EAF2FC`. No yellow panels.

## Run and check
Copy `.env.example` to `.env` in **both** `client` and `server` and fill in the keys. Start MongoDB replica set. In the extracted project root run `npm run install:all` followed by `npm run dev`. In the browser use Ctrl+Shift+R to clear old CSS. Test the General Book **Log in to borrow** overlay, Student Library unavailable PDF state, 1/2-part PDF import, test purchase, and access to both parts.

## Limitations
This ZIP cannot include unlicensed textbook PDF files or your private `.env` secrets. A live Razorpay, MongoDB and email integration test must be performed on your laptop with your own credentials.
