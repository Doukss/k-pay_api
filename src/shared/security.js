import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../config/env.js';

const scrypt = promisify(scryptCallback);

if (env.nodeEnv === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
}

export const hashPassword = (password) => bcrypt.hash(password, 12);

export async function verifyPassword(password, stored) {
  // Compatibilité avec le compte créé par l'ancienne version du backend.
  if (stored.includes(':') && /^[a-f\d]{32}:[a-f\d]+$/i.test(stored)) {
    const [salt, expectedHex] = stored.split(':');
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  return bcrypt.compare(password, stored);
}

export function createToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, env.jwtSecret, {
    subject: user.id,
    expiresIn: '24h',
    issuer: 'keurguipay-api',
    audience: 'keurguipay-app',
  });
}

export function readToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'], issuer: 'keurguipay-api', audience: 'keurguipay-app',
    });
  } catch {
    return null;
  }
}
