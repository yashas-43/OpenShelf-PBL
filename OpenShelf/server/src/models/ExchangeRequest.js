import mongoose from 'mongoose';
const exchangeRequestSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'PeerBookListing', required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'], default: 'pending' },
  acceptedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
exchangeRequestSchema.index({ requester: 1, status: 1 });
exchangeRequestSchema.index({ owner: 1, status: 1 });
// A user may submit another request only after their prior request is closed.
exchangeRequestSchema.index({ listing: 1, requester: 1 }, {
  unique: true, partialFilterExpression: { status: { $in: ['pending', 'accepted'] } }
});
export default mongoose.model('ExchangeRequest', exchangeRequestSchema);
