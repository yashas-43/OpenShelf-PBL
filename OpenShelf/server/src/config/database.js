import mongoose from "mongoose";
import Borrowing from "../models/Borrowing.js";
import StudentBorrowing from "../models/StudentBorrowing.js";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import PasswordResetCode from "../models/PasswordResetCode.js";
import ExchangeRequest from "../models/ExchangeRequest.js";
import Payment from "../models/Payment.js";
import Purchase from "../models/Purchase.js";
import DemoCheckout from "../models/DemoCheckout.js";

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured. Set server/.env before starting the API.');
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    // Phase 15: guarantee critical uniqueness constraints are actually installed.
    // Both loan types, email identities, one-time OTP challenges and peer request
    // concurrency depend on MongoDB indexes. Fail closed on an index conflict:
    // back up the database and fix conflicting records; never silently drop an index.
    for (const model of [User, Borrowing, StudentBorrowing,
      PendingRegistration, PasswordResetCode, ExchangeRequest, Payment, Purchase, DemoCheckout]) {
      await model.createIndexes();
    }
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
    return true;
  } catch (error) {
    throw new Error(`MongoDB connection or borrowing-index initialization failed: ${error.message}`);
  }
}
