/** Return to the screen where the user requested login or registration.
 * No dashboard redirects unless the user was already trying to open a dashboard.
 * Existing in-page state (open book details, selected textbook) is retained
 * because the hash is not changed when the user is already on that screen.
 */
export function postAuthHash(originHash, role) {
  if (originHash === '#dashboard' || originHash === '#student-dashboard' || originHash === '#admin-dashboard') {
    return role === 'admin' ? '#admin-dashboard' : '#dashboard';
  }
  // Only restore an in-app hash captured from this window; reject arbitrary URLs.
  return typeof originHash === 'string' && /^#[a-z0-9-]{1,64}$/i.test(originHash)
    ? originHash : '';
}

export function returnToOriginAfterAuth(originHash, role, locationObject = window.location) {
  const target = postAuthHash(originHash, role);
  // Intentionally no navigation from the current page for a normal login.
  if (target && locationObject.hash !== target) locationObject.hash = target;
  return target;
}
