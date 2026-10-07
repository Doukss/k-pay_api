import { prisma } from '../../shared/database.js';
import { currentBillingPeriod, getBusinessDate, getMonthlyDueDay } from '../../shared/business-date.js';

export async function reconcileTenantStatuses(agencyId, now = new Date()) {
  const { year, month, day } = getBusinessDate(now);
  const period = currentBillingPeriod(now);
  const [tenants, paid] = await Promise.all([
    prisma.tenant.findMany({ where: { agencyId }, select: { id: true, createdAt: true } }),
    prisma.payment.findMany({ where: { agencyId, billingPeriod: period, statut: 'reussi', tenantId: { not: null } }, select: { tenantId: true } }),
  ]);
  const paidIds = new Set(paid.map((payment) => payment.tenantId));
  const dueDays = new Map(tenants.map((tenant) => [tenant.id, getMonthlyDueDay(tenant.createdAt, year, month)]));
  const lateIds = tenants.filter((tenant) => !paidIds.has(tenant.id) && day > dueDays.get(tenant.id)).map((tenant) => tenant.id);
  const pendingIds = tenants.filter((tenant) => !paidIds.has(tenant.id) && !lateIds.includes(tenant.id)).map((tenant) => tenant.id);
  const commands = [];
  if (paidIds.size) commands.push(prisma.tenant.updateMany({ where: { agencyId, id: { in: [...paidIds] } }, data: { status: 'paid', delayDays: 0 } }));
  for (const tenant of tenants.filter(({ id }) => lateIds.includes(id))) {
    const delayDays = Math.max(1, day - dueDays.get(tenant.id));
    commands.push(prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'late', delayDays } }));
  }
  if (pendingIds.length) commands.push(prisma.tenant.updateMany({ where: { agencyId, id: { in: pendingIds } }, data: { status: 'pending', delayDays: 0 } }));
  if (commands.length) await prisma.$transaction(commands);
  return { period, dueDays: Object.fromEntries(dueDays) };
}
