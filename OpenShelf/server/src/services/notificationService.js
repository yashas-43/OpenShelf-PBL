import Notification from '../models/Notification.js';


/**
 * Persist an in-app message for one real student account.
 * Event keys make jobs and payment/borrowing retries idempotent.
 * When a MongoDB session is supplied, the notification commits with its event.
 */
export async function notifyStudent({ userId, type = 'system', title, message, eventKey, link }, session) {
  const record = {
    user: userId,
    type,
    title,
    message,
    ...(link ? { link } : {})
  };

  if (eventKey) {
    return Notification.updateOne(
      { user: userId, eventKey },
      { $setOnInsert: { ...record, eventKey } },
      { upsert: true, ...(session ? { session } : {}) }
    );
  }
  return Notification.create([record], session ? { session } : {});
}

