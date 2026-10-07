import { z } from 'zod';
import { emailSchema, phoneSchema } from '../../shared/validation.js';

export const updateSettingsSchema = z.object({
  agencyName: z.string().trim().min(2).max(120).optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }, 'Numéro de téléphone invalide').optional(),
  email: emailSchema.optional(),
  address: z.string().trim().max(250).optional(),
  ninea: z.string().trim().max(40).optional(),
  waveActive: z.boolean().optional(),
  omActive: z.boolean().optional(),
  feeBearer: z.enum(['agency', 'tenant']).optional(),
  remindJMinus3: z.boolean().optional(),
  remindJDay: z.boolean().optional(),
  remindJPlus3: z.boolean().optional(),
  remindLanguage: z.enum(['fr', 'wo', 'bilingual']).optional(),
  twoFactor: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Au moins un paramètre doit être fourni');
