import { Router } from 'express';
import { prisma } from '../../shared/database.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { relativeTime } from '../../shared/agency-events.js';
import { billingPeriodLabel, currentBillingPeriod, previousBillingPeriods } from '../../shared/business-date.js';
import { reconcileTenantStatuses } from '../tenants/tenants.service.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/', async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await reconcileTenantStatuses(agencyId);
    const now = new Date();
    const currentMonth = currentBillingPeriod(now);
    const monthPeriods = previousBillingPeriods(6, now);
    const [tenants, currentPayments, monthlyPayments, recentPayments, activities] = await Promise.all([
      prisma.tenant.findMany({ where: { agencyId }, select: { rentVal: true, status: true } }),
      prisma.payment.aggregate({ where: { agencyId, billingPeriod: currentMonth, statut: 'reussi' }, _sum: { montant: true } }),
      prisma.payment.findMany({ where: { agencyId, billingPeriod: { in: monthPeriods }, statut: 'reussi' }, select: { billingPeriod: true, montant: true } }),
      prisma.payment.findMany({ where: { agencyId, statut: 'reussi' }, orderBy: { date: 'desc' }, take: 5, select: { id: true, locataire: true, montant: true, moyenPaiement: true, date: true, statut: true } }),
      prisma.agencyActivity.findMany({ where: { agencyId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    const totalAttendu = tenants.reduce((sum, tenant) => sum + Number(tenant.rentVal), 0);
    const totalImpaye = tenants.filter((tenant) => tenant.status === 'late').reduce((sum, tenant) => sum + Number(tenant.rentVal), 0);
    const revenue = new Map(monthPeriods.map((period) => [period, 0]));
    for (const payment of monthlyPayments) revenue.set(payment.billingPeriod, revenue.get(payment.billingPeriod) + Number(payment.montant));
    res.json({
      kpis: {
        totalAttendu, totalCollecte: Number(currentPayments._sum.montant || 0), totalImpaye,
        nombreRetards: tenants.filter((tenant) => tenant.status === 'late').length,
        nombreLocataires: tenants.length,
      },
      revenusMensuels: monthPeriods.map((period) => ({ mois: billingPeriodLabel(period), attendu: totalAttendu, collecte: revenue.get(period) })),
      paiementsRecents: recentPayments.map((payment) => ({
        id: payment.id, locataire: payment.locataire, montant: Number(payment.montant),
        moyenPaiement: payment.moyenPaiement, date: payment.date.toISOString(), statut: payment.statut,
      })),
      activitesRecentes: activities.map((activity) => ({
        id: activity.id, type: activity.type, title: activity.title,
        description: activity.description, amount: activity.amount,
        time: relativeTime(activity.createdAt),
      })),
    });
  } catch (error) { next(error); }
});

export default router;
