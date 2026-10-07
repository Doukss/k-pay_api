import { HttpError } from '../../shared/errors.js';
import { getSubscription } from './subscriptions.service.js';

export async function requireActiveSubscription(agencyId) {
  const subscription = await getSubscription(agencyId);
  if (!subscription) throw new HttpError(404, 'Abonnement introuvable');
  if (subscription.status === 'expired') throw new HttpError(402, 'Votre abonnement a expiré. Choisissez ou renouvelez un forfait pour continuer.');
  return subscription;
}
