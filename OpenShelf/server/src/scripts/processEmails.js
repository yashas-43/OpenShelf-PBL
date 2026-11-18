import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { runEmailJobs } from '../services/reminderService.js';

try {
  await connectDatabase();
  const result = await runEmailJobs();
  console.log('Email delivery summary:', result);
} catch (error) {
  console.error('Email job failed:', error.code || error.message);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
