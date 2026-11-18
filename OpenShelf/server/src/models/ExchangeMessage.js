import mongoose from 'mongoose';
const exchangeMessageSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeRequest', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: true });
exchangeMessageSchema.index({ request: 1, createdAt: 1 });
export default mongoose.model('ExchangeMessage', exchangeMessageSchema);
