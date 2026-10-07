import { z } from 'zod';

export const bulkReminderSchema = z.object({
  tenantIds: z.array(z.string().uuid()).max(500).optional(),
}).strict();
