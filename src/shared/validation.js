import { z } from 'zod';
import { HttpError } from './errors.js';

export const emailSchema = z.string().trim().email('Adresse email invalide').max(254).transform((value) => value.toLowerCase());
export const phoneSchema = z.string().trim().min(8).max(30);
export const senegalMobileSchema = phoneSchema.refine((phone) => {
  const digits = phone.replace(/\D/g, '');
  const localNumber = digits.startsWith('221') ? digits.slice(3) : digits;
  return /^(70|75|76|77|78)\d{7}$/.test(localNumber);
}, 'Numéro mobile sénégalais invalide');

export const normalizePhone = (phone) => phone.replace(/\D/g, '').slice(-9);

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new HttpError(400, 'Données invalides', result.error.issues.map((issue) => ({
        field: issue.path.join('.'), message: issue.message,
      }))));
    }
    req.body = result.data;
    next();
  };
}

export function parsePagination(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? defaultLimit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new HttpError(400, `Pagination invalide (page ≥ 1, limit entre 1 et ${maxLimit})`);
  }
  return { page, limit, skip: (page - 1) * limit };
}

export function validateUuidParams(...names) {
  return (req, _res, next) => {
    const invalid = names.find((name) => !z.string().uuid().safeParse(req.params[name]).success);
    if (invalid) return next(new HttpError(400, `Identifiant ${invalid} invalide`));
    next();
  };
}
