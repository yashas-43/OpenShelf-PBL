/** Small pure helpers: suitable for automated tests and independent review. */
export const CONDITIONS = ['new', 'like-new', 'good', 'fair'];
export const TYPES = ['exchange', 'lend'];
export const REPORT_REASONS = ['spam', 'misleading', 'inappropriate', 'other'];
export const OBJECT_ID_PATTERN = /^[\da-fA-F]{24}$/;
export function cleanText(value, max, required = true) {
  if (typeof value !== 'string') return required ? null : '';
  const text = value.trim();
  if ((required && text.length === 0) || text.length > max) return null;
  return text;
}
export function validateListing(body) {
  const title = cleanText(body?.title, 200);
  const author = cleanText(body?.author, 120);
  const description = cleanText(body?.description, 2000);
  const category = cleanText(body?.category || 'General', 60);
  const condition = body?.condition;
  const exchangeType = body?.exchangeType;
  if (!title || !author || !description || !category || !CONDITIONS.includes(condition) || !TYPES.includes(exchangeType)
    || typeof body?.contactConsent !== 'boolean') return null;
  return { title, author, description, category, condition, exchangeType, contactConsent: body.contactConsent };
}
export function publicListing(listing) {
  const owner = listing.owner && typeof listing.owner === 'object' ? listing.owner : null;
  return {
    id: String(listing._id), title: listing.title, author: listing.author, description: listing.description,
    category: listing.category, condition: listing.condition, exchangeType: listing.exchangeType,
    status: listing.status, ownerName: owner?.fullName || 'OpenShelf member',
    hasPhoto: Boolean(listing.photoExtension), createdAt: listing.createdAt,
    // Never return owner Gmail or contact consent in public discovery responses.
  };
}
export function gmailComposeUrl({ email, title }) {
  const subject = `OpenShelf Book Exchange Request — ${title}`;
  const body = `Hello,\n\nI found your book "${title}" on OpenShelf and would like to discuss an exchange or loan.\n\nPlease let me know if it is still available.\n\nThank you!`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function canMessage(status) { return status === 'pending' || status === 'accepted'; }
export function mayChangeListingStatus(status, next) {
  return ['available', 'exchanged', 'unavailable'].includes(next) && status !== 'removed' && status !== 'reserved';
}
