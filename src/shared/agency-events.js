export async function createActivity(tx, agencyId, activity) {
  return tx.agencyActivity.create({ data: { agencyId, ...activity } });
}

export async function createNotification(tx, agencyId, notification) {
  return tx.notification.create({
    data: { agencyId, type: notification.type, title: notification.title,
      description: notification.description, message: notification.message,
      priority: notification.priority || 'normal', details: notification.details || {} },
  });
}

export function relativeTime(date) {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
  ];
  const [unit, size] = units.find(([, secondsPerUnit]) => Math.abs(seconds) >= secondsPerUnit) || units.at(-1);
  return new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

export const dateLabel = (date) => new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric',
}).format(new Date(date));
