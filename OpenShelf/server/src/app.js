import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import borrowingRoutes from "./routes/borrowingRoutes.js";
import adminBorrowingRoutes from "./routes/adminBorrowingRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import studentPdfRoutes from "./routes/studentPdfRoutes.js";
import studentBorrowingRoutes from "./routes/studentBorrowingRoutes.js";
import adminStudentBorrowingRoutes from "./routes/adminStudentBorrowingRoutes.js";
import peerExchangeRoutes from "./routes/peerExchangeRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import demoCheckoutRoutes from "./routes/demoCheckoutRoutes.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
// Account, borrowing and administrative API responses must never be cached by
// a shared browser/proxy. Public cover responses may override this later.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// PDF stream URLs never contain tokens; do not log PDF access paths or cookie values.
if (process.env.NODE_ENV !== "test") app.use(morgan("dev", { skip: (req) => req.path.startsWith("/api/student-pdfs/files/") }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Welcome to the OpenShelf API." });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/borrowings", borrowingRoutes);
app.use("/api/admin/borrowings", adminBorrowingRoutes);
app.use("/api/admin/student-borrowings", adminStudentBorrowingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student-pdfs", studentPdfRoutes);
app.use("/api/student-borrowings", studentBorrowingRoutes);
app.use("/api/peer-exchange", peerExchangeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
// Razorpay TEST mode only. Never use live credentials for this classroom demo.
app.use('/api/payments', paymentRoutes);
// Classroom-only mock checkout; never available in production.
app.use('/api/demo-checkout', demoCheckoutRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "API route not found." });
});

app.use((err, req, res, _next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413
    : err.name === 'MulterError' || err.name === 'CastError' || err.name === 'ValidationError' ? 400
      : err.code === 11000 ? 409
        : Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  // Log only structured diagnostics, not MongoDB payloads or SMTP secrets.
  console.error('OpenShelf API error', {
    name: err.name || 'Error', status, code: String(err.code || 'UNKNOWN').slice(0, 50),
    method: req.method, route: req.route?.path || 'unknown'
  });
  // Avoid returning MongoDB duplicate-index details containing private emails.
  const safeMessage = err.code === 11000 ? 'This record already exists.' : err.message;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === "production" && status >= 500 && err.status !== 503
      ? "An unexpected server error occurred."
      : safeMessage || "Internal server error."
  });
});

export default app;
