import { z } from 'zod';
import { emailSchema, phoneSchema } from '../../shared/validation.js';

const fields = {
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema.refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }, 'Numéro de téléphone invalide'),
  property: z.string().trim().min(1).max(160),
  rentVal: z.coerce.number().int().positive().max(1_000_000_000),
};

export const createTenantSchema = z.object(fields).strict();
export const updateTenantSchema = z.object(fields).partial().strict().refine((data) => Object.keys(data).length > 0, 'Au moins un champ doit être modifié');
export const rentPaymentSchema = z.object({ moyenPaiement: z.enum(['wave', 'orange_money', 'especes']).optional() }).strict();
