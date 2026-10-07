import { z } from 'zod';
import { emailSchema, senegalMobileSchema } from '../../shared/validation.js';

export const registerSchema = z.object({
  nomAgence: z.string().trim().min(2).max(120),
  nomResponsable: z.string().trim().min(2).max(120),
  email: emailSchema,
  telephone: senegalMobileSchema,
  password: z.string().min(6).max(72),
  confirmPassword: z.string().optional(),
}).strict().refine((data) => !data.confirmPassword || data.confirmPassword === data.password, {
  path: ['confirmPassword'], message: 'Les mots de passe ne correspondent pas',
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) }).strict();
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(6).max(72),
}).strict().refine((data) => data.currentPassword !== data.newPassword, {
  path: ['newPassword'], message: 'Le nouveau mot de passe doit être différent de l’actuel',
});
