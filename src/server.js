import app from './app.js';
import { env } from './config/env.js';
import { closeDatabase, initializeDatabase } from './shared/database.js';
import { startReminderScheduler } from './features/reminders/reminders.scheduler.js';

try {
  await initializeDatabase();
  const stopReminderScheduler = startReminderScheduler();
  const server = app.listen(env.port, () => {
    console.log(`KeurGuiPay API disponible sur http://localhost:${env.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopReminderScheduler();
      server.close(async () => {
      await closeDatabase();
      process.exit(0);
      });
    });
  }
} catch (error) {
  console.error('Impossible de démarrer le backend ou de se connecter à PostgreSQL:', error.message);
  process.exit(1);
}
