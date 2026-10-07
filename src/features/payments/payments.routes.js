import { Router } from 'express';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { parsePagination, validateUuidParams } from '../../shared/validation.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (req.query.period && !/^\d{4}-\d{2}$/.test(req.query.period)) throw new HttpError(400, 'Période invalide (format AAAA-MM)');
    if (req.query.status && !['reussi', 'en_attente', 'echoue', 'annule'].includes(req.query.status)) throw new HttpError(400, 'Filtre de statut invalide');
    const where = {
      agencyId: req.auth.sub,
      ...(req.query.status ? { statut: req.query.status } : {}),
      ...(req.query.period && /^\d{4}-\d{2}$/.test(req.query.period) ? { billingPeriod: req.query.period } : {}),
      ...(search ? { OR: [
        { locataire: { contains: search, mode: 'insensitive' } },
        { property: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [rows, total, aggregate] = await Promise.all([
      prisma.payment.findMany({ where, orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where: { ...where, statut: 'reussi' }, _sum: { montant: true }, _avg: { montant: true } }),
    ]);
    res.json({
      items: rows.map((payment) => ({
        id: payment.id, tenant: payment.locataire, subtitle: payment.subtitle || 'Loyer enregistré',
        property: payment.property || 'Bien supprimé', amount: Number(payment.montant),
        date: payment.date.toISOString(), reference: payment.reference, method: payment.moyenPaiement,
        status: payment.statut, billingPeriod: payment.billingPeriod,
      })),
      total, page, limit,
      summary: { totalCollected: Number(aggregate._sum.montant || 0), averagePayment: Math.round(Number(aggregate._avg.montant || 0)) },
    });
  } catch (error) { next(error); }
});

router.get('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, agencyId: req.auth.sub } });
    if (!payment) throw new HttpError(404, 'Encaissement introuvable');
    res.json({ ...payment, montant: Number(payment.montant) });
  } catch (error) { next(error); }
});

export default router;
