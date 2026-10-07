import { readToken } from '../security.js';
import { HttpError } from '../errors.js';

export function authenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const claims = token && readToken(token);
  if (!claims) return next(new HttpError(401, 'Authentification requise'));
  req.auth = claims;
  next();
}

export function requireAgency(req, _res, next) {
  if (req.auth?.role !== 'agency') return next(new HttpError(403, 'Cette action est réservée aux comptes agence'));
  next();
}
