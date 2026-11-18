import Borrowing from '../models/Borrowing.js';
import Book from '../models/Book.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import StudentTextbook from '../models/StudentTextbook.js';
import { studentEmailKey } from './studentBorrowingService.js';
import { queueEmail, processEmailQueue } from './emailService.js';
import { notifyStudent } from './notificationService.js';
import { borrowingEventKey } from './emailEventKeys.js';

export async function queueDueReminders(now = new Date()) {
  const twoDays = new Date(now.getTime() + 48 * 60 * 60_000);
  const records = await Borrowing.find({
    status: { $in: ['borrowed', 'overdue'] },
    issuedAt: { $ne: null }, returnedAt: null, dueAt: { $ne: null, $lte: twoDays }
  }).select('user book dueAt').limit(1000).lean();
  const books = await Book.find({ _id: { $in: records.map((record) => record.book) } }).select('title').lean();
  const byId = new Map(books.map((book) => [String(book._id), book.title]));
  const result = { examined: records.length, remindersQueued: 0, overdueQueued: 0 };
  for (const record of records) {
    const kind = record.dueAt.getTime() < now.getTime() ? 'overdue' : 'due_soon';
    const eventKey = borrowingEventKey(kind, record._id, record.dueAt.toISOString());
    const row = await queueEmail({ userId: record.user, kind, eventKey,
      details: { bookTitle: byId.get(String(record.book)) || 'your borrowed book', dueAt: record.dueAt.toISOString() } });
    await notifyStudent({
      userId: record.user, type: 'due', eventKey: `alert:${eventKey}`,
      title: kind === 'overdue' ? 'Book overdue' : 'Book due soon',
      message: `${byId.get(String(record.book)) || 'Your book'}: ${kind === 'overdue' ? 'return deadline passed' : 'return deadline is approaching'} (${record.dueAt.toLocaleDateString('en-IN')}).`,
      link: '#dashboard'
    });
    if (row.status === 'pending') result[kind === 'overdue' ? 'overdueQueued' : 'remindersQueued'] += 1;
  }
  // Student physical-copy loans have a separate collection and event namespace.
  const studentRecords = await StudentBorrowing.find({
    status: { $in: ['borrowed', 'overdue'] },
    returnedAt: null,
    dueAt: { $ne: null, $lte: twoDays }
  }).select('user textbook dueAt').limit(1000).lean();
  const textbooks = await StudentTextbook.find({
    _id: { $in: studentRecords.map((loan) => loan.textbook) }
  }).select('level subject').lean();
  const textbookNames = new Map(textbooks.map((item) => [
    String(item._id), `${item.level} · ${item.subject}`
  ]));

  for (const record of studentRecords) {
    const kind = new Date(record.dueAt) < now ? 'overdue' : 'due_soon';
    const row = await queueEmail({
      userId: record.user,
      kind,
      eventKey: studentEmailKey(kind, record._id, record.dueAt.toISOString()),
      details: {
        bookTitle: textbookNames.get(String(record.textbook)) || 'your student textbook',
        dueAt: record.dueAt.toISOString()
      }
    });
    await notifyStudent({
      userId: record.user, type: 'due',
      eventKey: `alert:${studentEmailKey(kind, record._id, record.dueAt.toISOString())}`,
      title: kind === 'overdue' ? 'Student textbook overdue' : 'Textbook due soon',
      message: `${textbookNames.get(String(record.textbook)) || 'Your textbook'}: ${kind === 'overdue' ? 'return deadline passed' : 'return deadline is approaching'} (${new Date(record.dueAt).toLocaleDateString('en-IN')}).`,
      link: '#dashboard'
    });
    if (row.status === 'pending') {
      result[kind === 'overdue' ? 'overdueQueued' : 'remindersQueued'] += 1;
    }
  }
  return result;
}

let running = false;
export async function runEmailJobs() {
  if (running) return { skipped: 'already_running' };
  running = true;
  try {
    const reminders = await queueDueReminders();
    const deliveries = await processEmailQueue(100);
    return { reminders, deliveries };
  } finally { running = false; }
}

export function scheduleEmailJobs() {
  if (process.env.EMAIL_JOBS_ENABLED !== 'true') return;
  const everyMinutes = Math.min(1440, Math.max(5, Number.parseInt(process.env.EMAIL_JOBS_INTERVAL_MINUTES || '60', 10) || 60));
  const perform = () => runEmailJobs().catch((error) => console.error('Email job failed:', error.code || 'JOB_FAILED'));
  // Run once after startup and then periodically while the API process is running.
  perform();
  const timer = setInterval(perform, everyMinutes * 60_000);
  timer.unref();
}
