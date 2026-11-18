import "dotenv/config";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { validateStartupSecurity } from "./services/startupSecurity.js";
import { scheduleEmailJobs } from './services/reminderService.js';
import { scheduleInAppReminderScan } from './services/inAppReminderService.js';

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  // Fail before opening a port if credentials or public origins are unsafe.
  validateStartupSecurity();
  await connectDatabase();
  scheduleEmailJobs();
  scheduleInAppReminderScan();
  app.listen(PORT, () => {
    console.log(`OpenShelf API running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start OpenShelf API:", error);
  process.exit(1);
});
