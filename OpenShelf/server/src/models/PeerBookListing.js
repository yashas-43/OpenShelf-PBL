import mongoose from 'mongoose';

/** Physical, user-owned books only. No PDFs, payments, or private contact details. */
const peerBookListingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  author: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  category: { type: String, trim: true, maxlength: 60, default: 'General' },
  condition: { type: String, enum: ['new', 'like-new', 'good', 'fair'], required: true },
  exchangeType: { type: String, enum: ['exchange', 'lend'], required: true },
  contactConsent: { type: Boolean, default: false },
  photoExtension: { type: String, enum: ['', 'jpg', 'png', 'webp'], default: '' },
  status: { type: String, enum: ['available', 'reserved', 'exchanged', 'unavailable', 'removed'], default: 'available' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '', maxlength: 300 },
  exchangedAt: { type: Date, default: null }
}, { timestamps: true });
peerBookListingSchema.index({ owner: 1, createdAt: -1 });
peerBookListingSchema.index({ status: 1, approvalStatus: 1, createdAt: -1 });
peerBookListingSchema.index({ title: 'text', author: 'text' });
export default mongoose.model('PeerBookListing', peerBookListingSchema);
