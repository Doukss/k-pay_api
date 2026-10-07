import { Router } from 'express';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { validateBody } from '../../shared/validation.js';
import { createActivity } from '../../shared/agency-events.js';
import { getSubscription, PLAN_CATALOG, recordSimulatedSubscriptionPayment } from './subscriptions.service.js';
import { autoRenewSchema, checkoutSchema, renewSchema } from './subscriptions.schemas.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/current', async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.auth.sub);
    if (!subscription) throw new HttpError(404, 'Agence introuvable');
    res.json(subscription);
  } catch (error) { next(error); }
});

router.get('/plans', (_req, res) => {
  res.json(Object.entries(PLAN_CATALOG).map(([id, plan]) => ({ id, ...plan })));
});

router.post('/checkout', validateBody(checkoutSchema), async (req, res, next) => {
  try {
    const result = await recordSimulatedSubscriptionPayment(req.auth.sub, req.body.planId, req.body.method);
    res.status(201).json({ subscription: result, simulated: true, message: 'Paiement de démonstration enregistré ; aucune opération réelle n’a été transmise.' });
  } catch (error) { next(error); }
});

router.post('/renew', validateBody(renewSchema), async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.auth.sub);
    if (!subscription) throw new HttpError(404, 'Abonnement introuvable');
    if (subscription.status !== 'expired' || !subscription.monthlyRenewalDue) {
      throw new HttpError(409, 'Aucun renouvellement mensuel n’est dû');
    }
    const method = req.body.method || subscription.paymentMethod || 'Wave';
    if (!['Wave', 'Orange Money'].includes(method)) throw new HttpError(400, 'Moyen de paiement invalide');
    const result = await recordSimulatedSubscriptionPayment(req.auth.sub, subscription.planId, method, true);
    res.status(201).json({ subscription: result, simulated: true, message: 'Renouvellement de démonstration enregistré.' });
  } catch (error) { next(error); }
});

router.patch('/auto-renew', validateBody(autoRenewSchema), async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.auth.sub);
    if (!subscription) throw new HttpError(404, 'Abonnement introuvable');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.subscription.update({ where: { agencyId: req.auth.sub }, data: { autoRenew: req.body.autoRenew } });
      await createActivity(tx, req.auth.sub, {
        type: 'locataire', title: 'Renouvellement automatique modifié',
        description: req.body.autoRenew ? 'Le renouvellement automatique est activé.' : 'Le renouvellement automatique est désactivé.',
      });
      return value;
    });
    res.json({ autoRenew: updated.autoRenew });
  } catch (error) { next(error); }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.auth.sub);
    if (!subscription) throw new HttpError(404, 'Abonnement introuvable');
    res.json(subscription.invoices);
  } catch (error) { next(error); }
});

export default router;
