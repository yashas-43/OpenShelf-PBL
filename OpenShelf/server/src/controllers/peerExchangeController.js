import mongoose from 'mongoose';
import { readPeerPhoto, savePeerPhoto, deletePeerPhoto } from '../services/peerPhotos.js';
import { cleanText, gmailComposeUrl, mayChangeListingStatus, OBJECT_ID_PATTERN,
  publicListing, REPORT_REASONS, validateListing, canMessage } from '../services/peerExchangeRules.js';
import PeerBookListing from '../models/PeerBookListing.js';
import ExchangeRequest from '../models/ExchangeRequest.js';
import ExchangeMessage from '../models/ExchangeMessage.js';
import PeerListingReport from '../models/PeerListingReport.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function validId(id) { if (!OBJECT_ID_PATTERN.test(id || '')) fail('Invalid record ID.'); return id; }
function listPage(query) {
  const page = Math.min(1000, Math.max(1, parseInt(query.page, 10) || 1));
  return { page, limit: 12, skip: (page - 1) * 12 };
}
function responsePage(items, total, page, limit) { return { success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }; }
function guarded(handler) { return (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
  if (error?.code === 11000) return res.status(409).json({ success: false, message: 'You already have an active request for this book or previously reported it.' });
  next(error);
}); }
const safeRequest = (record) => ({
  id: String(record._id), listingId: String(record.listing?._id || record.listing),
  title: record.listing?.title || 'Listing unavailable',
  exchangeType: record.listing?.exchangeType || 'exchange',
  status: record.status, ownerName: record.owner?.fullName || 'OpenShelf member',
  requesterName: record.requester?.fullName || 'OpenShelf member',
  createdAt: record.createdAt, acceptedAt: record.acceptedAt, completedAt: record.completedAt,
  // Participant email addresses are never included in requests or messages.
});
async function alertUser(user, title, message, session = null) {
  await Notification.create([{ user, title, message }], session ? { session } : {});
}

export const browse = guarded(async (req, res) => {
  const { page, limit, skip } = listPage(req.query);
  const filter = { status: 'available', approvalStatus: 'approved' };
  const search = cleanText(req.query.search || '', 100, false);
  if (search === null) fail('Search is too long.');
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { author: { $regex: escaped, $options: 'i' } }];
  }
  if (req.query.type) {
    if (!['lend', 'exchange'].includes(req.query.type)) fail('Invalid exchange filter.');
    filter.exchangeType = req.query.type;
  }
  const [listings, total] = await Promise.all([
    PeerBookListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName').lean(),
    PeerBookListing.countDocuments(filter)
  ]);
  res.json(responsePage(listings.map(publicListing), total, page, limit));
});

export const detail = guarded(async (req, res) => {
  const listing = await PeerBookListing.findOne({ _id: validId(req.params.id), status: { $in: ['available', 'reserved'] }, approvalStatus: 'approved' })
    .populate('owner', 'fullName').lean();
  if (!listing) fail('Listing unavailable.', 404);
  res.json({ success: true, data: publicListing(listing) });
});

export const photo = guarded(async (req, res) => {
  const listing = await PeerBookListing.findOne({ _id: validId(req.params.id), status: { $in: ['available', 'reserved'] }, approvalStatus: 'approved' }).select('photoExtension').lean();
  if (!listing?.photoExtension) fail('Photo not found.', 404);
  try {
    const bytes = await readPeerPhoto(req.params.id, listing.photoExtension);
    res.set({ 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[listing.photoExtension],
      'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  } catch (error) { if (error.code === 'ENOENT') fail('Photo not found.', 404); throw error; }
});

export const mine = guarded(async (req, res) => {
  const { page, limit, skip } = listPage(req.query);
  const filter = { owner: req.auth.sub };
  const [items, total] = await Promise.all([
    PeerBookListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PeerBookListing.countDocuments(filter)
  ]);
  res.json(responsePage(items.map(item => ({ ...publicListing(item), contactConsent: item.contactConsent, approvalStatus: item.approvalStatus || 'pending', reviewNote: item.reviewNote || '' })), total, page, limit));
});

export const createListing = guarded(async (req, res) => {
  const fields = validateListing(req.body);
  if (!fields) fail('Provide valid title, author, description, condition, exchange/lend type and contact consent.');
  const listing = await PeerBookListing.create({ ...fields, owner: req.auth.sub, approvalStatus: 'pending' });
  res.status(201).json({ success: true, message: 'Listing submitted for administrator approval. It is not public yet.', data: { ...publicListing(listing), approvalStatus: 'pending', contactConsent: listing.contactConsent } });
});

export const editListing = guarded(async (req, res) => {
  validId(req.params.id);
  const fields = validateListing(req.body);
  if (!fields) fail('Provide all valid listing fields.');
  const listing = await PeerBookListing.findOneAndUpdate({ _id: req.params.id, owner: req.auth.sub,
    status: { $in: ['available', 'unavailable'] } }, { $set: { ...fields, approvalStatus: 'pending', reviewedAt: null, reviewNote: '' } }, { new: true, runValidators: true });
  if (!listing) fail('Only the owner can edit an available or unavailable listing.', 403);
  res.json({ success: true, message: 'Updated listing sent back for administrator approval.', data: { ...publicListing(listing), approvalStatus: 'pending', contactConsent: listing.contactConsent } });
});

export const uploadPhoto = guarded(async (req, res) => {
  validId(req.params.id);
  if (!req.file) fail('Upload a JPG, PNG or WebP photo under 4 MiB.');
  const listing = await PeerBookListing.findOne({ _id: req.params.id, owner: req.auth.sub,
    status: { $in: ['available', 'unavailable'] } });
  if (!listing) fail('Only the owner can update the photo of an editable listing.', 403);
  const oldExtension = listing.photoExtension;
  const extension = await savePeerPhoto(String(listing._id), req.file.buffer);
  listing.photoExtension = extension;
  listing.approvalStatus = 'pending';
  listing.reviewedAt = null;
  listing.reviewNote = '';
  await listing.save();
  if (oldExtension && oldExtension !== extension) await deletePeerPhoto(String(listing._id), oldExtension);
  res.json({ success: true, message: 'Listing photo uploaded; administrator approval is required before it becomes public.', data: { hasPhoto: true } });
});

export const changeListingStatus = guarded(async (req, res) => {
  validId(req.params.id);
  const nextStatus = req.body?.status;
  const listing = await PeerBookListing.findOne({ _id: req.params.id, owner: req.auth.sub });
  if (!listing) fail('Listing not found for this owner.', 404);
  if (!mayChangeListingStatus(listing.status, nextStatus)) fail('This listing is reserved, removed, or has an invalid target status.', 409);
  if (nextStatus === 'available' && await ExchangeRequest.exists({ listing: listing._id, status: 'accepted' })) fail('Complete or cancel the accepted exchange first.', 409);
  const updated = await PeerBookListing.findOneAndUpdate({ _id: listing._id, owner: req.auth.sub, status: listing.status },
    { $set: { status: nextStatus, exchangedAt: nextStatus === 'exchanged' ? new Date() : null } }, { new: true });
  if (!updated) fail('Listing changed during your update. Refresh and retry.', 409);
  if (nextStatus !== 'available') {
    // Do not strand pending requests when a book is withdrawn or exchanged elsewhere.
    await ExchangeRequest.updateMany({ listing: updated._id, status: 'pending' }, { $set: { status: 'cancelled' } });
  }
  res.json({ success: true, message: `Listing marked ${nextStatus}.`, data: publicListing(updated) });
});

export const removeListing = guarded(async (req, res) => {
  validId(req.params.id);
  const updated = await PeerBookListing.findOneAndUpdate({ _id: req.params.id, owner: req.auth.sub,
    status: { $in: ['available', 'unavailable', 'exchanged'] } }, { $set: { status: 'removed' } }, { new: true });
  if (!updated) fail('Listing not found or has an accepted exchange. Cancel or complete it first.', 409);
  await ExchangeRequest.updateMany({ listing: updated._id, status: 'pending' }, { $set: { status: 'cancelled' } });
  res.json({ success: true, message: 'Listing removed from public discovery.' });
});

export const createRequest = guarded(async (req, res) => {
  const listing = await PeerBookListing.findOne({ _id: validId(req.params.id), status: 'available', approvalStatus: 'approved' })
    .populate('owner', 'email fullName isActive');
  if (!listing || !listing.owner?.isActive) fail('This book is not available for exchange.', 409);
  if (String(listing.owner._id) === req.auth.sub) fail('You cannot request your own book.');
  const existing = await ExchangeRequest.exists({ listing: listing._id, requester: req.auth.sub, status: { $in: ['pending', 'accepted'] } });
  if (existing) fail('You already have an active request for this book.', 409);
  const record = await ExchangeRequest.create({ listing: listing._id, requester: req.auth.sub, owner: listing.owner._id });
  await alertUser(listing.owner._id, 'New peer-to-peer request', `Someone has requested your listed book: ${listing.title}.`).catch(() => {});
  // Contact Gmail is returned only after the listing owner explicitly opted in.
  const composeUrl = listing.contactConsent ? gmailComposeUrl({ email: listing.owner.email, title: listing.title }) : null;
  res.status(201).json({ success: true, message: composeUrl
    ? 'Request saved. Gmail compose is optional: review the message and send it yourself.'
    : 'Request saved. Arrange the exchange through private OpenShelf messages; no email address was shared.',
    data: { id: String(record._id), composeUrl } });
});

export const myRequests = guarded(async (req, res) => {
  const { page, limit, skip } = listPage(req.query);
  const filter = { $or: [{ requester: req.auth.sub }, { owner: req.auth.sub }] };
  const [records, total] = await Promise.all([
    ExchangeRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('listing', 'title exchangeType').populate('owner', 'fullName').populate('requester', 'fullName').lean(),
    ExchangeRequest.countDocuments(filter)
  ]);
  res.json(responsePage(records.map(record => ({ ...safeRequest(record), direction: String(record.owner?._id || record.owner) === req.auth.sub ? 'incoming' : 'outgoing' })), total, page, limit));
});

export const contact = guarded(async (req, res) => {
  const request = await ExchangeRequest.findOne({ _id: validId(req.params.id), requester: req.auth.sub,
    status: { $in: ['pending', 'accepted'] } }).populate('listing', 'title contactConsent').populate('owner', 'email isActive');
  if (!request?.listing?.contactConsent || !request.owner?.isActive) fail('The listing owner has not consented to share an email address.', 403);
  res.json({ success: true, composeUrl: gmailComposeUrl({ email: request.owner.email, title: request.listing.title }),
    message: 'Gmail compose will open; no message has been sent by OpenShelf.' });
});

export const actionRequest = guarded(async (req, res) => {
  const id = validId(req.params.id);
  const action = req.params.action;
  if (!['accept', 'reject', 'cancel', 'complete'].includes(action)) fail('Invalid exchange action.');
  const actor = req.auth.sub;
  const session = await mongoose.startSession();
  let outcome;
  let notification = null;
  try {
    await session.withTransaction(async () => {
      const request = await ExchangeRequest.findById(id).session(session);
      if (!request) fail('Exchange request not found.', 404);
      const owner = String(request.owner) === actor;
      const requester = String(request.requester) === actor;
      if (!owner && !requester) fail('This exchange does not belong to your account.', 403);
      if (action === 'accept') {
        if (!owner || request.status !== 'pending') fail('Only the owner can accept a pending request.', 409);
        const changed = await PeerBookListing.findOneAndUpdate({ _id: request.listing, owner: request.owner, status: 'available', approvalStatus: 'approved' },
          { $set: { status: 'reserved' } }, { new: true, session });
        if (!changed) fail('The book is no longer available.', 409);
        request.status = 'accepted'; request.acceptedAt = new Date();
        await request.save({ session });
        await ExchangeRequest.updateMany({ listing: request.listing, _id: { $ne: request._id }, status: 'pending' },
          { $set: { status: 'rejected' } }, { session });
        notification = { recipient: request.requester, title: 'Exchange accepted', message: `Your request for ${changed.title} was accepted. Arrange the handover using private messages.` };
      } else if (action === 'reject') {
        if (!owner || request.status !== 'pending') fail('Only the owner can reject a pending request.', 409);
        request.status = 'rejected'; await request.save({ session });
      } else if (action === 'cancel') {
        if (!requester || !['pending', 'accepted'].includes(request.status)) fail('Only the requester can cancel an active request.', 409);
        const accepted = request.status === 'accepted';
        request.status = 'cancelled'; await request.save({ session });
        if (accepted) await PeerBookListing.updateOne({ _id: request.listing, status: 'reserved' }, { $set: { status: 'available' } }, { session });
      } else {
        if (!owner || request.status !== 'accepted') fail('Only the owner can complete an accepted exchange.', 409);
        const changed = await PeerBookListing.findOneAndUpdate({ _id: request.listing, status: 'reserved' },
          { $set: { status: 'exchanged', exchangedAt: new Date() } }, { session });
        if (!changed) fail('Listing is no longer reserved.', 409);
        request.status = 'completed'; request.completedAt = new Date(); await request.save({ session });
        notification = { recipient: request.requester, title: 'Exchange completed', message: `The owner marked ${changed.title} as exchanged.` };
      }
      outcome = { status: request.status, id: String(request._id) };
    });
  } finally { await session.endSession(); }
  // Notification delivery must never roll back an already committed exchange.
  if (notification) await alertUser(notification.recipient, notification.title, notification.message).catch(() => {});
  res.json({ success: true, message: `Exchange ${outcome.status}.`, data: outcome });
});

export const readMessages = guarded(async (req, res) => {
  const request = await ExchangeRequest.findById(validId(req.params.id)).select('owner requester');
  if (!request || ![String(request.owner), String(request.requester)].includes(req.auth.sub)) fail('Conversation unavailable.', 403);
  const messages = await ExchangeMessage.find({ request: request._id }).sort({ createdAt: 1 }).limit(150).select('sender body createdAt').lean();
  res.json({ success: true, data: messages.map(m => ({ id: String(m._id), mine: String(m.sender) === req.auth.sub, body: m.body, createdAt: m.createdAt })) });
});
export const sendMessage = guarded(async (req, res) => {
  const request = await ExchangeRequest.findById(validId(req.params.id)).select('owner requester status listing');
  if (!request || ![String(request.owner), String(request.requester)].includes(req.auth.sub)) fail('Conversation unavailable.', 403);
  if (!canMessage(request.status)) fail('This conversation is closed.', 409);
  const body = cleanText(req.body?.message, 1000);
  if (!body) fail('Enter a message up to 1000 characters.');
  const record = await ExchangeMessage.create({ request: request._id, sender: req.auth.sub, body });
  const recipient = String(request.owner) === req.auth.sub ? request.requester : request.owner;
  await alertUser(recipient, 'Exchange message', 'You have a new private message about your book exchange.').catch(() => {});
  res.status(201).json({ success: true, message: 'Private message saved.', data: { id: String(record._id), body: record.body } });
});

export const reportListing = guarded(async (req, res) => {
  const listing = await PeerBookListing.findOne({ _id: validId(req.params.id), status: { $in: ['available', 'reserved'] }, approvalStatus: 'approved' });
  if (!listing) fail('Listing not found.', 404);
  if (String(listing.owner) === req.auth.sub) fail('You cannot report your own listing.');
  if (!REPORT_REASONS.includes(req.body?.reason)) fail('Select a valid report reason.');
  const details = cleanText(req.body?.details || '', 500, false);
  if (details === null) fail('Report details must be under 500 characters.');
  await PeerListingReport.create({ listing: listing._id, reporter: req.auth.sub, reason: req.body.reason, details });
  res.status(201).json({ success: true, message: 'Report saved for administrator review.' });
});
