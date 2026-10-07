import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { createActivity, createNotification } from '../../shared/agency-events.js';

export const PLAN_CATALOG = {
  starter: { planName: 'Starter (50 locataires)', price: 15000, maxTenants: 50 },
  business: { planName: 'Business (100 locataires)', price: 25000, maxTenants: 100 },
  pro: { planName: 'Plan Pro (Illimité)', price: 60000, maxTenants: 9999 },
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
export const newReference = (prefix, method) => {
  const gateway = method === 'Wave' ? 'WAVE' : 'OM';
  return `KP-${prefix}-${gateway}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}-SN`;
};

export async function getSubscription(agencyId) {
  const user = await prisma.user.findUnique({ where: { id: agencyId }, select: { id: true, createdAt: true, email: true } });
  if (!user) return null;
  let subscription = await prisma.subscription.upsert({
    where: { agencyId },
    create: {
      id: randomUUID(), agencyId, planId: 'starter', ...PLAN_CATALOG.starter,
      status: 'trial', isTrial: true, trialStartedAt: user.createdAt,
      trialExpiresAt: addDays(user.createdAt, 30), trialAlreadyUsed: false,
    },
    update: {},
    include: { invoices: { orderBy: { date: 'desc' }, take: 50 } },
  });

  const now = new Date();
  const trialHasExpired = subscription.status === 'trial' && subscription.trialExpiresAt <= now;
  const paidPeriodHasExpired = subscription.status === 'active' && subscription.periodEndsAt && subscription.periodEndsAt <= now;
  if (trialHasExpired || paidPeriodHasExpired) {
    const expired = await prisma.$transaction(async (tx) => {
      const update = await tx.subscription.updateMany({
        where: { id: subscription.id, status: subscription.status },
        data: { status: 'expired', trialAlreadyUsed: true, monthlyRenewalDue: Boolean(paidPeriodHasExpired) },
      });
      if (update.count) {
        await createNotification(tx, agencyId, {
          type: 'system', title: paidPeriodHasExpired ? 'Renouvellement mensuel requis' : 'Période d’essai terminée',
          description: paidPeriodHasExpired ? 'Votre abonnement mensuel a expiré.' : 'Votre période d’essai de 30 jours est terminée.',
          message: paidPeriodHasExpired ? 'Choisissez un forfait et validez le paiement pour renouveler votre abonnement.' : 'Choisissez un forfait pour continuer à utiliser les fonctionnalités de votre espace agence.',
          priority: 'high',
        });
      }
      return tx.subscription.findUnique({ where: { id: subscription.id }, include: { invoices: { orderBy: { date: 'desc' }, take: 50 } } });
    });
    subscription = expired;
  }

  const trialDaysRemaining = subscription.status === 'trial'
    ? Math.max(0, Math.ceil((subscription.trialExpiresAt.getTime() - now.getTime()) / 86400000))
    : 0;
  return {
    ...subscription,
    trialDaysRemaining,
    isTrial: subscription.status === 'trial',
    trialExpiresAt: subscription.status === 'trial' ? subscription.trialExpiresAt.toISOString() : '',
    lastPaymentDate: subscription.lastPaymentDate?.toISOString(),
    nextBillingDate: subscription.nextBillingDate?.toISOString(),
    invoices: subscription.invoices.map((invoice) => ({ ...invoice, date: invoice.date.toISOString() })),
  };
}

export async function recordSimulatedSubscriptionPayment(agencyId, planId, method, isRenewal = false) {
  const selectedPlan = PLAN_CATALOG[planId];
  const subscription = await prisma.subscription.findUnique({ where: { agencyId } });
  if (!subscription) throw new HttpError(404, 'Abonnement agence introuvable');
  const settings = await prisma.agencySetting.findUnique({ where: { agencyId } });
  if (method === 'Wave' && settings?.waveActive === false) throw new HttpError(409, 'La passerelle Wave est désactivée pour cette agence');
  if (method === 'Orange Money' && settings?.orangeMoneyActive === false) throw new HttpError(409, 'La passerelle Orange Money est désactivée pour cette agence');

  const now = new Date();
  const nextBillingDate = addDays(now, 30);
  const reference = newReference(isRenewal ? 'REN' : 'SUB', method);
  const invoiceId = `KP-INV-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.subscription.update({
      where: { agencyId },
      data: {
        planId, ...selectedPlan, status: 'active', isTrial: false,
        trialAlreadyUsed: true, lastPaymentDate: now, nextBillingDate,
        periodEndsAt: nextBillingDate, paymentMethod: method,
        transactionRef: reference, monthlyRenewalDue: false,
        invoices: { create: { id: invoiceId, month, amount: selectedPlan.price, date: now, paymentMethod: method, reference, status: 'paid' } },
      },
      include: { invoices: { orderBy: { date: 'desc' }, take: 50 } },
    });
    await createNotification(tx, agencyId, {
      type: 'paiement', title: `${isRenewal ? 'Renouvellement' : 'Abonnement'} ${selectedPlan.planName} validé`,
      description: `Enregistrement d’un paiement simulé de ${selectedPlan.price.toLocaleString()} FCFA via ${method}.`,
      message: `Transaction de démonstration ${reference}. Aucune opération réelle Wave/Orange Money n’a été envoyée. Forfait actif jusqu’au ${nextBillingDate.toISOString()}.`,
      priority: 'normal', details: { amount: selectedPlan.price, paymentMethod: method, reference, simulated: true },
    });
    await createActivity(tx, agencyId, {
      type: 'paiement', title: isRenewal ? 'Renouvellement enregistré' : 'Forfait activé',
      description: `${selectedPlan.planName} via ${method} · paiement simulé`,
      amount: `${selectedPlan.price.toLocaleString()} F`,
    });
    return result;
  });
  return { ...updated, invoices: updated.invoices.map((invoice) => ({ ...invoice, date: invoice.date.toISOString() })), simulated: true };
}
