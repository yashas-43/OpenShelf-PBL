import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { validNotificationLink } from '../services/notificationRules.js';

const MAX_PAGE = 1000;
const PAGE_SIZE = 15;

/** Only the currently authenticated student's notifications are ever returned. */
export async function listNotifications(req, res, next) {
  try {
    const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const unread = req.query.unread === 'true';
    const filter = { user: req.auth.sub, ...(unread ? { readAt: null } : {}) };
    const [records, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select('title message type link readAt createdAt')
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.auth.sub, readAt: null })
    ]);
    return res.json({
      success: true,
      data: records,
      unreadCount,
      pagination: { page, limit: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) }
    });
  } catch (error) {
    return next(error);
  }
}

/** An ID is not sufficient to mark somebody else's notification as read. */
export async function markNotificationRead(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.auth.sub },
      { $set: { readAt: new Date() } },
      { new: true }
    ).select('_id readAt');
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
}

export async function markAllRead(req, res, next) {
  try {
    const result = await Notification.updateMany(
      { user: req.auth.sub, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    return next(error);
  }
}

/** Staff broadcast only in-app announcements, never unsolicited SMTP messages. */
export async function publishAnnouncement(req, res, next) {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const link = req.body?.link;
    if (!title || title.length > 160 || !message || message.length > 1000 ||
        (link && !validNotificationLink(link))) {
      return res.status(400).json({ success: false, message: 'Provide a title (1–160 characters), message (1–1000 characters), and an allowed in-app link.' });
    }
    const activeUsers = await User.find({ isActive: true, role: 'student' })
      .select('_id').lean().limit(1001);
    if (activeUsers.length > 1000) {
      return res.status(409).json({
        success: false,
        message: 'Broadcast is limited to 1000 active accounts. Use a batched delivery service before broadcasting to more accounts.'
      });
    }
    if (activeUsers.length) {
      await Notification.insertMany(activeUsers.map(({ _id }) => ({
        user: _id,
        type: 'announcement',
        title,
        message,
        ...(link ? { link } : {})
      })), { ordered: true });
    }
    return res.status(201).json({ success: true, deliveredTo: activeUsers.length,
      message: 'Announcement saved to active student notification inboxes.' });
  } catch (error) {
    return next(error);
  }
}
