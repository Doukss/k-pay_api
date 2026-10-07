import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { parsePagination, normalizePhone, validateBody, validateUuidParams } from '../../shared/validation.js';
import { createActivity, createNotification } from '../../shared/agency-events.js';
import { requireActiveSubscription } from '../subscriptions/subscriptions.access.js';
import { reconcileTenantStatuses } from '../tenants/tenants.service.js';
import { bulkReminderSchema } from './reminders.schemas.js';

const router = Router();
router.use(authenticate, requireAgency);

function buildReminder(tenant) {
  const phone = normalizePhone(tenant.phone);
  const formattedPhone = phone.startsWith('221') ? phone : `221${phone}`;
  const paymentUrl = `${env.clientUrl}/paiement?tenantId=${tenant.id}`;
  const message = `Bonjour ${tenant.name},\n\nVotre loyer de ${Number(tenant.rentVal).toLocaleString()} FCFA pour le bien « ${tenant.property} » est en attente de règlement.\n\nVous pouvez régler en 1 clic via Wave ou Orange Money :\n${paymentUrl}\n\nMerci de votre confiance,\nAgence ${tenant.agency.agencyName}`;
  return { phone: formattedPhone, message, paymentUrl, whatsappUrl: `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}` };
}

async function prepareReminder(agencyId, tenant) {
  const content = buildReminder(tenant);
  const record = await prisma.$transaction(async (tx) => {
    const reminder = await tx.reminder.create({
      data: { id: randomUUID(), agencyId, tenantId: tenant.id, phone: content.phone, message: content.message, paymentUrl: content.paymentUrl, status: 'prepared' },
    });
    await createActivity(tx, agencyId, {
      type: 'relance', title: 'Relance WhatsApp préparée',
      description: `${tenant.name} · ${tenant.property}`, amount: 'WhatsApp',
    });
    await createNotification(tx, agencyId, {
      type: 'relance', title: 'Relance WhatsApp préparée',
      description: `Message de relance prêt pour ${tenant.name}.`,
      message: `Le message et son lien de paiement ont été préparés pour le ${tenant.phone}. Ouvrez le lien WhatsApp retourné par l’API pour l’envoyer.`,
      priority: tenant.delayDays > 10 ? 'high' : 'normal',
      details: { tenantId: tenant.id, tenantName: tenant.name, tenantPhone: tenant.phone, tenantEmail: tenant.email, property: tenant.property, amount: Number(tenant.rentVal), delayDays: tenant.delayDays, paymentMethod: 'WhatsApp', actionType: 'relance' },
    });
    return reminder;
  });
  return { ...record, ...content, sent: false };
}

router.get('/', async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await reconcileTenantStatuses(agencyId);
    const { page, limit, skip } = parsePagination(req.query);
    const [lateTenants, totalDue, reminders, totalReminders] = await Promise.all([
      prisma.tenant.findMany({ where: { agencyId, status: 'late' }, orderBy: { delayDays: 'desc' } }),
      prisma.tenant.aggregate({ where: { agencyId, status: 'late' }, _sum: { rentVal: true }, _avg: { delayDays: true } }),
      prisma.reminder.findMany({ where: { agencyId }, orderBy: { createdAt: 'desc' }, skip, take: limit, include: { tenant: { select: { name: true, property: true } } } }),
      prisma.reminder.count({ where: { agencyId } }),
    ]);
    res.json({
      lateTenants: lateTenants.map((tenant) => ({ ...tenant, rentVal: Number(tenant.rentVal) })),
      stats: { unpaidAmount: Number(totalDue._sum.rentVal || 0), lateCount: lateTenants.length, averageDelayDays: Math.round(Number(totalDue._avg.delayDays || 0)) },
      reminders: reminders.map((reminder) => ({ ...reminder, tenantName: reminder.tenant.name, property: reminder.tenant.property })),
      total: totalReminders, page, limit,
    });
  } catch (error) { next(error); }
});

router.post('/bulk', validateBody(bulkReminderSchema), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await requireActiveSubscription(agencyId);
    await reconcileTenantStatuses(agencyId);
    const tenants = await prisma.tenant.findMany({
      where: { agencyId, status: 'late', ...(req.body.tenantIds ? { id: { in: req.body.tenantIds } } : {}) },
      include: { agency: { select: { agencyName: true } } }, orderBy: { delayDays: 'desc' },
    });
    const prepared = await Promise.all(tenants.map((tenant) => prepareReminder(agencyId, tenant)));
    res.status(201).json({ prepared: prepared.length, sent: 0, reminders: prepared });
  } catch (error) { next(error); }
});

router.post('/:tenantId', validateUuidParams('tenantId'), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    await requireActiveSubscription(agencyId);
    await reconcileTenantStatuses(agencyId);
    const tenant = await prisma.tenant.findFirst({ where: { id: req.params.tenantId, agencyId }, include: { agency: { select: { agencyName: true } } } });
    if (!tenant) throw new HttpError(404, 'Locataire introuvable');
    if (tenant.status !== 'late') throw new HttpError(409, 'Ce locataire n’est pas en retard de paiement');
    res.status(201).json(await prepareReminder(agencyId, tenant));
  } catch (error) { next(error); }
});

export default router;
