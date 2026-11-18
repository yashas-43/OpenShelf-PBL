/** All user-provided text is escaped before insertion into branded HTML emails. */
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const readableDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
    : 'the due date shown in your account';
};

export function buildMail(kind, user, details = {}) {
  const name = user.fullName || 'Reader';
  const title = details.bookTitle || 'your book';
  const due = readableDate(details.dueAt);
  const templates = {
    registration: ['Welcome to OpenShelf', `Hello ${name}, your OpenShelf account has been created successfully. Discover. Borrow. Read. Grow.`],
    borrow_checkout: ['Your OpenShelf book is checked out', `Hello ${name}, you have borrowed "${title}". Your return deadline is ${due}. This is an automatic checkout; no administrator approval is required.`],
    borrow_approved: ['OpenShelf borrowing approved', `Hello ${name}, your request for "${title}" has been approved.`],
    borrow_rejected: ['OpenShelf borrowing request update', `Hello ${name}, your borrowing request for "${title}" was rejected.`],
    borrow_issued: ['Your OpenShelf book has been issued', `Hello ${name}, "${title}" was issued. Due: ${due}.`],
    borrow_returned: ['OpenShelf return confirmed', `Hello ${name}, the return of "${title}" has been recorded. ${Number(details.fineAmountPaise) > 0 ? `An overdue fine of ₹${(Number(details.fineAmountPaise)/100).toFixed(2)} was assessed.` : 'No overdue fine was assessed.'} Thank you.`],
    extension_approved: ['Your return extension was approved', `Hello ${name}, the return deadline for "${title}" is now ${due}.`],
    extension_rejected: ['Your return extension was not approved', `Hello ${name}, your requested extension for "${title}" was declined. The current deadline is ${due}.`],
    due_soon: ['OpenShelf return reminder', `Hello ${name}, "${title}" is due ${due}. Please arrange to return it on time.`],
    overdue: ['OpenShelf overdue book reminder', `Hello ${name}, "${title}" was due ${due} and is now overdue. An outstanding fine accrues at ₹10 per started 24 hours overdue. Please arrange a return.`],
    purchase_confirmed: ['OpenShelf verified purchase', `Hello ${name}, your payment of ₹${((Number(details.amountPaise)||0)/100).toFixed(2)} for ${title} was verified and all parts of this subject are now available in your OpenShelf account.`],
    password_changed: ['Your OpenShelf password was changed', `Hello ${name}, your OpenShelf account password was changed. If this was not you, contact the library administrator immediately.`]
  };
  if (!(kind in templates)) throw new Error(`Unrecognized email template: ${kind}`);
  const [subject, text] = templates[kind];
  const html = `<div style="margin:0;padding:32px;background:#0b1022;color:#f8fafc;font:16px/1.65 Arial,sans-serif;max-width:620px"><div style="color:#b7a6ff;font-size:23px;font-weight:700">OpenShelf</div><p style="font-size:12px;color:#a6b0d0;letter-spacing:1px">DISCOVER. BORROW. READ. GROW.</p><h2 style="font-size:21px;color:#fff">${escapeHtml(subject)}</h2><p>${escapeHtml(text)}</p><p style="color:#a6b0d0;font-size:13px">This is an automated account notification from OpenShelf.</p></div>`;
  return { subject, text, html };
}

/** Never include verification codes in persistent EmailLog.details or server logs. */
export function buildOtpMail(user, code) {
  const text = `Hello ${user.fullName || 'Reader'}, your OpenShelf password reset code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email. Never share this code.`;
  const html = `<div style="margin:0;padding:32px;background:#0b1022;color:#f8fafc;font:16px Arial,sans-serif;max-width:620px"><h2 style="color:#b7a6ff">OpenShelf password reset</h2><p>Hello ${escapeHtml(user.fullName || 'Reader')},</p><p>Enter this verification code to reset your password:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${escapeHtml(code)}</p><p>Expires in 10 minutes. Never share this code. If you did not request it, ignore this email.</p></div>`;
  return { subject: 'Your OpenShelf password reset code', text, html };
}

/** Email used for account creation; never store its one-time code in an EmailLog. */
export function buildRegistrationOtpMail(user, code) {
  const name = user.fullName || 'Reader';
  const text = `Hello ${name}, your OpenShelf account registration code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request an account, ignore this message.`;
  const html = `<div style="margin:0;padding:32px;background:#0b1022;color:#f8fafc;font:16px Arial,sans-serif;max-width:620px"><h2 style="color:#b7a6ff">OpenShelf email verification</h2><p>Hello ${escapeHtml(name)},</p><p>Enter this code to finish creating your OpenShelf account:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${escapeHtml(code)}</p><p>This code expires in 5 minutes and can be used once. Never share it.</p></div>`;
  return { subject: 'Your OpenShelf registration verification code', text, html };
}
