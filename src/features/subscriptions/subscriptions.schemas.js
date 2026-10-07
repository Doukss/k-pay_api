import { z } from 'zod';

export const checkoutSchema = z.object({
  planId: z.enum(['starter', 'business', 'pro']),
  method: z.enum(['Wave', 'Orange Money']),
}).strict();

export const autoRenewSchema = z.object({ autoRenew: z.boolean() }).strict();
export const renewSchema = z.object({ method: z.enum(['Wave', 'Orange Money']).optional() }).strict();
