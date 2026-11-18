import mongoose from 'mongoose';
const peerListingReportSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'PeerBookListing', required: true, index: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true, enum: ['spam', 'misleading', 'inappropriate', 'other'] },
  details: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });
peerListingReportSchema.index({ listing: 1, reporter: 1 }, { unique: true });
export default mongoose.model('PeerListingReport', peerListingReportSchema);
