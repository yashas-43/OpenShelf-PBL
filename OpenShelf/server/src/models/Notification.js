import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 1000 },
  readAt: { type: Date, default: null },
  type: { type: String, enum: ['system', 'borrow', 'return', 'due', 'exchange', 'announcement'], default: 'system' },
  eventKey: { type: String, maxlength: 240 },
  link: { type: String, maxlength: 100 }
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ user: 1, eventKey: 1 }, { unique: true, sparse: true });
export default mongoose.model('Notification', notificationSchema);
