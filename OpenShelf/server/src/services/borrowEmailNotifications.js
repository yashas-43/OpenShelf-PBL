import { borrowingEventKey } from './emailEventKeys.js';
import { deliverEmailByEvent } from './emailService.js';

export async function deliverBorrowingNotice(kind, recordId, suffix = '') {
  try {
    return await deliverEmailByEvent(borrowingEventKey(kind, recordId, suffix));
  } catch {
    // SMTP and logging failures must never turn a committed loan into an HTTP error.
    return { status: 'failed' };
  }
}

