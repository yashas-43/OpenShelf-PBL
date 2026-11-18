import mongoose from 'mongoose';
import { GENERAL_BOOK_TEXT_FIELDS, GENERAL_BOOK_TEXT_OPTIONS } from '../services/generalBookTextIndex.js';

const bookSchema = new mongoose.Schema({
  // Source IDs preserve both the original supplied book and record identifiers.
  sourceBookId: { type: String, trim: true, unique: true, sparse: true },
  sourceRecordId: { type: String, trim: true },
  sourceGenre: { type: String, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  author: { type: String, required: true, trim: true, maxlength: 120, index: true },
  isbn: { type: String, trim: true, default: '', index: true },
  genre: { type: String, required: true, trim: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  coverUrl: { type: String, trim: true, default: '' },
  coverFileExtension: { type: String, enum: ['','jpg','png','webp'], default: '' },
  language: { type: String, trim: true, default: 'English', index: true },
  publisher: { type: String, trim: true, default: '' },
  publishedYear: { type: Number, min: 0, max: 2100, default: null },
  price: { type: Number, min: 0, default: 0 },
  totalCopies: { type: Number, min: 0, default: 3 },
  availableCopies: { type: Number, min: 0, default: 3 },
  isAvailableForBorrow: { type: Boolean, default: true },
  isAvailableForPurchase: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true, index: true },
  format: { type: String, enum: ['physical'], default: 'physical', immutable: true }
}, { timestamps: true });

// Preserve the original book language (including Sanskrit) independently of search stemming.
// Mongoose may add options such as `background` while building indexes.
// The shared constants are intentionally frozen, so pass mutable copies here.
bookSchema.index({ ...GENERAL_BOOK_TEXT_FIELDS }, { ...GENERAL_BOOK_TEXT_OPTIONS });
export default mongoose.model('Book', bookSchema);
