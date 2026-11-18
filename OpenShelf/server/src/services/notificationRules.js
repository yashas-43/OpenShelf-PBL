/** Only known OpenShelf hash routes may be embedded in notifications. */
export function validNotificationLink(link) {
  return typeof link === 'string' &&
    /^#(dashboard|general-books|student-library|peer-exchange-app|peer-requests|peer-listings)$/.test(link);
}
