import Borrowing from '../models/Borrowing.js';
import StudentBorrowing from '../models/StudentBorrowing.js';
import Book from '../models/Book.js';
import StudentTextbook from '../models/StudentTextbook.js';
import { notifyStudent } from './notificationService.js';
import { borrowingEventKey } from './emailEventKeys.js';

/** Generate due-soon/overdue in-app reminders even when Gmail SMTP is disabled. */
export async function queueInAppReminders(now = new Date()) {
  const within48Hours = new Date(now.getTime() + 48 * 60 * 60_000);
  const openLoanFilter = {
    status: { $in: ['borrowed', 'overdue'] },
    returnedAt: null,
    dueAt: { $ne: null, $lte: within48Hours }
  };
  const [generalLoans, studentLoans] = await Promise.all([
    Borrowing.find(openLoanFilter).select('user book dueAt').limit(1000).lean(),
    StudentBorrowing.find(openLoanFilter).select('user textbook dueAt').limit(1000).lean()
  ]);
  const [books, textbooks] = await Promise.all([
    Book.find({ _id: { $in: generalLoans.map((loan) => loan.book) } }).select('title').lean(),
    StudentTextbook.find({ _id: { $in: studentLoans.map((loan) => loan.textbook) } })
      .select('level subject').lean()
  ]);
  const bookNames = new Map(books.map((item) => [String(item._id), item.title]));
  const subjectNames = new Map(textbooks.map((item) => [
    String(item._id), `${item.level} · ${item.subject}`
  ]));

  for (const loan of generalLoans) {
    const overdue = new Date(loan.dueAt) < now;
    const kind = overdue ? 'overdue' : 'due_soon';
    await notifyStudent({
      userId: loan.user,
      type: 'due',
      title: overdue ? 'Book overdue' : 'Book due soon',
      message: `${bookNames.get(String(loan.book)) || 'Your borrowed book'}: ${overdue ? 'the return deadline passed' : 'please return soon'} (${new Date(loan.dueAt).toLocaleDateString('en-IN')}).`,
      eventKey: `alert:${borrowingEventKey(kind, loan._id, new Date(loan.dueAt).toISOString())}`,
      link: '#dashboard'
    });
  }
  for (const loan of studentLoans) {
    const overdue = new Date(loan.dueAt) < now;
    const kind = overdue ? 'overdue' : 'due_soon';
    await notifyStudent({
      userId: loan.user,
      type: 'due',
      title: overdue ? 'Student textbook overdue' : 'Student textbook due soon',
      message: `${subjectNames.get(String(loan.textbook)) || 'Your textbook'}: ${overdue ? 'the return deadline passed' : 'please return soon'} (${new Date(loan.dueAt).toLocaleDateString('en-IN')}).`,
      eventKey: `alert:student:${borrowingEventKey(kind, loan._id, new Date(loan.dueAt).toISOString())}`,
      link: '#dashboard'
    });
  }
  return { generalLoansExamined: generalLoans.length, studentLoansExamined: studentLoans.length };
}

let running = false;
export async function runInAppReminderScan() {
  if (running) return { skipped: true };
  running = true;
  try {
    return await queueInAppReminders();
  } finally {
    running = false;
  }
}

export function scheduleInAppReminderScan() {
  if (process.env.NOTIFICATION_JOBS_ENABLED === 'false') return;
  const requested = Number.parseInt(process.env.NOTIFICATION_JOBS_INTERVAL_MINUTES || '60', 10);
  const minutes = Math.max(5, Math.min(1440, Number.isFinite(requested) ? requested : 60));
  const invoke = () => runInAppReminderScan()
    .catch((error) => console.error('In-app reminder check failed:', error.code || 'REMINDER_ERROR'));
  invoke();
  const timer = setInterval(invoke, minutes * 60_000);
  timer.unref();
}
