import { env } from '../config/env.js';

export function getBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.businessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

export function getMonthlyDueDay(createdAt, year, month) {
  const registrationDay = getBusinessDate(createdAt).day;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(registrationDay, lastDay);
}

export function calendarDayDifference(from, to) {
  const fromDate = getBusinessDate(from);
  const toDate = getBusinessDate(to);
  const fromUtc = Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day);
  const toUtc = Date.UTC(toDate.year, toDate.month - 1, toDate.day);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function currentBillingPeriod(date = new Date()) {
  const { year, month } = getBusinessDate(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function previousBillingPeriods(count = 6, date = new Date()) {
  const { year, month } = getBusinessDate(date);
  return Array.from({ length: count }, (_, index) => {
    const monthDate = new Date(Date.UTC(year, month - count + index, 1));
    return `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function billingPeriodLabel(period) {
  const [year, month] = period.split('-').map(Number);
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15)));
  return label.charAt(0).toLocaleUpperCase('fr-FR') + label.slice(1);
}
