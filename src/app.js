import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import authRoutes from './features/auth/auth.routes.js';
import dashboardRoutes from './features/dashboard/dashboard.routes.js';
import tenantsRoutes from './features/tenants/tenants.routes.js';
import paymentsRoutes from './features/payments/payments.routes.js';
import remindersRoutes from './features/reminders/reminders.routes.js';
import notificationsRoutes from './features/notifications/notifications.routes.js';
import settingsRoutes from './features/settings/settings.routes.js';
import subscriptionsRoutes from './features/subscriptions/subscriptions.routes.js';
import activitiesRoutes from './features/activities/activities.routes.js';
import { errorHandler } from './shared/errors.js';
import { openApiDocument } from './docs/openapi.js';
import { prisma } from './shared/database.js';

const app = express();
app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'keurguipay-api', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', service: 'keurguipay-api', database: 'disconnected' });
  }
});
app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'KeurGuiPay API · Documentation',
  swaggerOptions: { persistAuthorization: true },
}));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/agency/settings', settingsRoutes);
app.use('/api/agency/activities', activitiesRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use((_req, res) => res.status(404).json({ message: 'Route introuvable' }));
app.use(errorHandler);

export default app;
