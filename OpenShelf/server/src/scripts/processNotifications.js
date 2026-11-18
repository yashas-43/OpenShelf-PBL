import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { runInAppReminderScan } from '../services/inAppReminderService.js';

try {
  await connectDatabase();
  console.log('In-app reminder scan:', await runInAppReminderScan());
} catch (error) {
  console.error('In-app reminder scan failed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
