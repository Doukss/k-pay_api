import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../shared/database.js';
import { getBusinessDate, getMonthlyDueDay } from '../../shared/business-date.js';
import { createActivity, createNotification } from '../../shared/agency-events.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const configured = () => Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId && env.whatsappTemplateName);

function reminderOccurrence(now, tenant, kind) {
  const { year, month, day } = getBusinessDate(now);
  const today = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const offset = kind === 'jMinus3' ? -3 : 3;
  for (const monthOffset of [-1, 0, 1]) {
    const billingDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
    const billingYear = billingDate.getUTCFullYear();
    const billingMonth = billingDate.getUTCMonth() + 1;
    const dueDay = getMonthlyDueDay(tenant.createdAt, billingYear, billingMonth);
    const target = Math.floor(Date.UTC(billingYear, billingMonth - 1, dueDay + offset) / DAY_MS);
    if (today === target) return { year: billingYear, month: billingMonth, dueDay, period: `${billingYear}-${String(billingMonth).padStart(2, '0')}` };
  }
  return null;
}

function formatDueDate(occurrence) {
  return `${String(occurrence.dueDay).padStart(2, '0')}/${String(occurrence.month).padStart(2, '0')}/${occurrence.year}`;
}

async function sendTemplate(to, parameters) {
  const response = await fetch(`https://graph.facebook.com/${env.whatsappGraphApiVersion}/${env.whatsappPhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.whatsappAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: {
        name: env.whatsappTemplateName,
        language: { code: env.whatsappTemplateLanguage },
        components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.messages?.[0]?.id) {
    const error = new Error(result.error?.message || `WhatsApp Cloud API HTTP ${response.status}`);
    error.providerCode = result.error?.code;
    throw error;
  }
  return result.messages[0].id;
}

async function processAutomaticReminders(now = new Date()) {
  if (!configured()) return;
  await prisma.reminder.updateMany({
    where: { status: 'sending', attempts: { lt: 3 }, createdAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) } },
    data: { status: 'failed' },
  });
  const agencies = await prisma.user.findMany({
    select: {
      id: true, agencyName: true,
      settings: { select: { remindJMinus3: true, remindJPlus3: true } },
      tenants: { select: { id: true, name: true, phone: true, phoneNormalized: true, property: true, rentVal: true, createdAt: true } },
      payments: { where: { billingPeriod: { in: [-1, 0, 1].map((offset) => { const date = new Date(Date.UTC(getBusinessDate(now).year, getBusinessDate(now).month - 1 + offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }) }, statut: 'reussi' }, select: { tenantId: true, billingPeriod: true } },
    },
  });
  for (const agency of agencies) {
    const paidKeys = new Set(agency.payments.map(({ tenantId, billingPeriod }) => `${tenantId}:${billingPeriod}`).filter((key) => !key.startsWith('null:')));
    for (const tenant of agency.tenants) {
      for (const [kind, enabled] of [['jMinus3', agency.settings?.remindJMinus3 ?? true], ['jPlus3', agency.settings?.remindJPlus3 ?? true]]) {
        const occurrence = reminderOccurrence(now, tenant, kind);
        if (!enabled || !occurrence || paidKeys.has(`${tenant.id}:${occurrence.period}`)) continue;
        const dueDate = formatDueDate(occurrence);
        const dedupeKey = `${tenant.id}:${occurrence.period}:${kind}`;
        const phone = tenant.phoneNormalized.startsWith('221') ? tenant.phoneNormalized : `221${tenant.phoneNormalized}`;
        const amount = Number(tenant.rentVal).toLocaleString('fr-FR');
        const message = kind === 'jMinus3'
          ? `Bonjour ${tenant.name}, votre loyer de ${amount} FCFA pour ${tenant.property} arrive à échéance le ${dueDate}. Paiement : ${env.clientUrl}/paiement?tenantId=${tenant.id}`
          : `Bonjour ${tenant.name}, votre loyer de ${amount} FCFA pour ${tenant.property} était dû le ${dueDate}. Merci de régulariser : ${env.clientUrl}/paiement?tenantId=${tenant.id}`;
        const created = await prisma.reminder.createMany({
          data: [{ id: randomUUID(), agencyId: agency.id, tenantId: tenant.id, reminderKind: kind, dedupeKey, status: 'queued', phone, message, paymentUrl: `${env.clientUrl}/paiement?tenantId=${tenant.id}` }],
          skipDuplicates: true,
        });
        if (!created.count) {
          await prisma.reminder.updateMany({ where: { dedupeKey, status: 'failed', attempts: { lt: 3 } }, data: { status: 'queued' } });
        }
        const claimed = await prisma.reminder.updateMany({ where: { dedupeKey, status: 'queued', attempts: { lt: 3 } }, data: { status: 'sending', attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        const record = await prisma.reminder.findUnique({ where: { dedupeKey } });
        try {
          const providerMessageId = await sendTemplate(phone, [tenant.name, amount, tenant.property, dueDate, record.paymentUrl, agency.agencyName]);
          await prisma.$transaction(async (tx) => {
            await tx.reminder.update({ where: { id: record.id }, data: { status: 'sent' } });
            await createActivity(tx, agency.id, { type: 'relance', title: `Rappel WhatsApp ${kind === 'jMinus3' ? 'J-3' : 'J+3'} envoyé`, description: `${tenant.name} · ${tenant.property}` });
            await createNotification(tx, agency.id, {
              type: 'relance', title: 'Rappel WhatsApp envoyé', description: `Le rappel ${kind === 'jMinus3' ? 'J-3' : 'J+3'} a été envoyé à ${tenant.name}.`,
              message: `WhatsApp Cloud API a accepté le message ${providerMessageId}.`,
              details: { tenantId: tenant.id, tenantName: tenant.name, tenantPhone: tenant.phone, actionType: 'relance', reminderKind: kind },
            });
          });
        } catch (error) {
          await prisma.reminder.update({ where: { id: record.id }, data: { status: 'failed' } });
          console.error(`Échec du rappel WhatsApp ${dedupeKey}:`, error.message);
        }
      }
    }
  }
}

export function startReminderScheduler() {
  if (!configured()) {
    console.info('Rappels WhatsApp automatiques en attente de configuration des identifiants et du modèle Cloud API.');
    return () => {};
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processAutomaticReminders(); }
    catch (error) { console.error('Erreur ordonnanceur WhatsApp:', error.message); }
    finally { running = false; }
  };
  const timer = setInterval(run, 60_000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
