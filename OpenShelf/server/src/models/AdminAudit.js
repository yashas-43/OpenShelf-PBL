import mongoose from 'mongoose';

/** No secrets or user passwords. Read-only forensic audit log for Phase 11 mutations. */
const schema = new mongoose.Schema({
  actor: { type: String, default: 'configured-admin', immutable: true },
  action: { type: String, required: true, maxlength: 80 },
  targetType: { type: String, required: true, maxlength: 40 },
  targetId: { type: String, required: true, maxlength: 40 },
  notes: { type: String, maxlength: 300, default: '' }
}, { timestamps: true });
schema.index({ createdAt: -1 });
export default mongoose.model('AdminAudit', schema);
