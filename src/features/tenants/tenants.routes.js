import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { normalizePhone, parsePagination, validateBody, validateUuidParams } from '../../shared/validation.js';
import { createActivity, createNotification, dateLabel } from '../../shared/agency-events.js';
import { currentBillingPeriod } from '../../shared/business-date.js';
import { requireActiveSubscription } from '../subscriptions/subscriptions.access.js';
import { createTenantSchema, rentPaymentSchema, updateTenantSchema } from './tenants.schemas.js';

const router = Router();
router.use(authenticate, requireAgency);

const serializeTenant = (tenant) => ({ ...tenant, rentVal: Number(tenant.rentVal) });

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const status = req.query.status;
    if (status !== undefined && !['paid', 'late', 'pending'].includes(status)) throw new HttpError(400, 'Filtre de statut invalide');
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const where = {
      agencyId: req.auth.sub,
      ...(status ? { status } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { property: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total, stats] = await Promise.all([
      prisma.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.tenant.count({ where }),
      prisma.tenant.groupBy({ by: ['status'], where: { agencyId: req.auth.sub }, _count: { _all: true } }),
    ]);
    res.json({
      items: items.map(serializeTenant), total, page, limit,
      stats: Object.fromEntries(['paid', 'pending', 'late'].map((key) => [key, stats.find((row) => row.status === key)?._count._all || 0])),
    });
  } catch (error) { next(error); }
});

router.post('/', validateBody(createTenantSchema), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    const subscription = await requireActiveSubscription(agencyId);
    const count = await prisma.tenant.count({ where: { agencyId } });
    if (count >= subscription.maxTenants) throw new HttpError(409, `Le forfait ${subscription.planName} est limité à ${subscription.maxTenants} locataires`);
    const phoneNormalized = normalizePhone(req.body.phone);
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({ data: { id: randomUUID(), agencyId, ...req.body, phoneNormalized } });
      await createActivity(tx, agencyId, {
        type: 'locataire', title: 'Nouveau locataire ajouté',
        description: `${created.name} · ${created.property}`, amount: `${Number(created.rentVal).toLocaleString()} F`,
      });
      await createNotification(tx, agencyId, {
        type: 'locataire', title: 'Nouveau locataire enregistré',
        description: `${created.name} · ${created.property}`,
        message: `${created.name} a été ajouté au portefeuille avec un loyer mensuel de ${Number(created.rentVal).toLocaleString()} FCFA.`,
        priority: 'low', details: { tenantId: created.id, tenantName: created.name, tenantPhone: created.phone, tenantEmail: created.email, property: created.property, amount: Number(created.rentVal), actionType: 'locataire' },
      });
      return created;
    });
    res.status(201).json(serializeTenant(tenant));
  } catch (error) { next(error); }
});

router.patch('/:id', validateUuidParams('id'), validateBody(updateTenantSchema), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await requireActiveSubscription(agencyId);
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, agencyId } });
    if (!existing) throw new HttpError(404, 'Locataire introuvable');
    const data = { ...req.body };
    if (data.phone) data.phoneNormalized = normalizePhone(data.phone);
    if (data.email) data.email = data.email.toLowerCase();
    const tenant = await prisma.tenant.update({ where: { id: existing.id }, data });
    res.json(serializeTenant(tenant));
  } catch (error) { next(error); }
});

router.delete('/:id', validateUuidParams('id'), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, agencyId } });
    if (!existing) throw new HttpError(404, 'Locataire introuvable');
    await prisma.$transaction(async (tx) => {
      await tx.tenant.delete({ where: { id: existing.id } });
      await createActivity(tx, agencyId, {
        type: 'locataire', title: 'Locataire retiré', description: `${existing.name} · ${existing.property}`,
      });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/:id/payments', validateUuidParams('id'), validateBody(rentPaymentSchema), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await requireActiveSubscription(agencyId);
    const method = req.body.moyenPaiement || 'wave';
    const gatewaySettings = await prisma.agencySetting.findUnique({ where: { agencyId } });
    if (method === 'wave' && gatewaySettings?.waveActive === false) throw new HttpError(409, 'La passerelle Wave est désactivée');
    if (method === 'orange_money' && gatewaySettings?.orangeMoneyActive === false) throw new HttpError(409, 'La passerelle Orange Money est désactivée');
    const tenant = await prisma.tenant.findFirst({ where: { id: req.params.id, agencyId } });
    if (!tenant) throw new HttpError(404, 'Locataire introuvable');
    const now = new Date();
    const billingPeriod = currentBillingPeriod(now);
    const existingPayment = await prisma.payment.findFirst({ where: { tenantId: tenant.id, billingPeriod, statut: 'reussi' } });
    if (existingPayment) throw new HttpError(409, 'Le loyer de ce locataire est déjà encaissé pour ce mois', { reference: existingPayment.reference });
    const reference = `KP-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}-SN`;
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          id: randomUUID(), agencyId, tenantId: tenant.id, locataire: tenant.name,
          property: tenant.property, montant: tenant.rentVal, moyenPaiement: method,
          statut: 'reussi', date: now, reference, billingPeriod,
          subtitle: `Règlement enregistré · ${method}`,
        },
      });
      await tx.tenant.update({ where: { id: tenant.id }, data: { status: 'paid', delayDays: 0 } });
      await createActivity(tx, agencyId, {
        type: 'paiement', title: 'Paiement enregistré', description: `${tenant.name} · ${tenant.property}`,
        amount: `${Number(tenant.rentVal).toLocaleString()} F`,
      });
      await createNotification(tx, agencyId, {
        type: 'paiement', title: 'Loyer encaissé avec succès',
        description: `${tenant.name} a réglé ${Number(tenant.rentVal).toLocaleString()} FCFA`,
        message: `Le loyer de ${tenant.property} a été enregistré pour ${Number(tenant.rentVal).toLocaleString()} FCFA. Référence : ${reference}.`,
        priority: 'normal', details: { tenantId: tenant.id, tenantName: tenant.name, tenantPhone: tenant.phone, tenantEmail: tenant.email, property: tenant.property, amount: Number(tenant.rentVal), paymentMethod: method, reference, actionType: 'quittance' },
      });
      return created;
    });
    res.status(201).json({ ...payment, montant: Number(payment.montant), dateLabel: dateLabel(payment.date) });
  } catch (error) { next(error); }
});

export default router;
