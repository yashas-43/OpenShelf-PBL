# OpenShelf: Primary Blue + Very Light Yellow (Screenshot Fixes)

This release is based on `OpenShelf_Apple_HomeView_Colors_QA_Checked.zip`. It preserves authentication, physical borrowing, ₹10 flat overdue fines, ₹10 Razorpay **test mode** subject checkout, purchased PDF access, peer exchange with mandatory admin approval, and all prior administrative functionality.

## Visual fixes
- Primary blue `#0769D7`, darker blue links `#0758AD`, secondary light yellow `#FFF9E6`, warm borders `#E9DDAF`, deep ink text `#1C2940`.
- Restored gradient text clipping in hero, discovery, student and peer headers; this fixes opaque blue rectangles covering words on the homepage.
- Changed success messages in the Student Library to calm informational blue, retaining red for errors.
- Corrected the physical textbook panel's outdated statement that PDFs were free. Digital access requires an approved ₹10 test purchase when a legitimate PDF is published; physical borrowing remains separate.
- Real `coverUrl` metadata is displayed for general books when available; the previous OpenShelf image remains a fallback. Missing publisher, ISBN and year fields no longer appear as empty boxes.

## Run
1. Extract ZIP. Copy `client/.env.example` → `client/.env` and `server/.env.example` → `server/.env`, edit with valid MongoDB/SMTP and **Razorpay test** settings.
2. Run `npm run install:all` once in the project root, then `npm run dev`.
3. Open `http://localhost:5173` and use hard refresh (`Ctrl+Shift+R`) to clear cached CSS.
4. Backend needs a configured, reachable MongoDB replica set; test payment needs working `rzp_test_` keys and network.

## Important limits
Tests in this environment cannot simulate real Gmail delivery, Razorpay's hosted test checkout, MongoDB transactions or local textbook PDF files. Complete an end-to-end manual test with your own test credentials and legal PDF files before deploying.
