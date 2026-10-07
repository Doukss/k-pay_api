import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { validateBody } from '../../shared/validation.js';
import { hashPassword, verifyPassword, createToken } from '../../shared/security.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { createActivity, createNotification } from '../../shared/agency-events.js';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas.js';

const router = Router();
const safeUser = ({ passwordHash, ...user }) => user;
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { nomAgence, nomResponsable, email, telephone, password } = req.body;
    const now = new Date();
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          id: randomUUID(), email, name: nomResponsable, agencyName: nomAgence,
          telephone, role: 'agency', passwordHash: await hashPassword(password),
        },
      });
      await tx.subscription.create({
        data: {
          id: randomUUID(), agencyId: createdUser.id, planId: 'starter',
          planName: 'Starter (50 locataires)', price: 15000, maxTenants: 50,
          status: 'trial', isTrial: true, trialStartedAt: now,
          trialExpiresAt: addDays(now, 30), trialAlreadyUsed: false,
        },
      });
      await tx.agencySetting.create({ data: { id: randomUUID(), agencyId: createdUser.id, administrativeEmail: email } });
      await createActivity(tx, createdUser.id, {
        type: 'locataire', title: 'Compte agence créé',
        description: `${nomAgence} · période d’essai activée`,
      });
      await createNotification(tx, createdUser.id, {
        type: 'system', title: 'Essai gratuit de 30 jours activé',
        description: 'Votre forfait Starter est actif pendant 30 jours.',
        message: 'Votre essai Starter vous donne accès à la gestion de 50 locataires pendant 30 jours.',
        priority: 'normal',
      });
      return createdUser;
    });
    res.status(201).json({ token: createToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
      throw new HttpError(401, 'Email ou mot de passe incorrect');
    }
    // Passe progressivement les anciens hash scrypt vers bcrypt à la première connexion.
    if (user.passwordHash.includes(':')) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(req.body.password) } });
    }
    res.json({ token: createToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.sub },
      select: { id: true, email: true, name: true, agencyName: true, telephone: true, role: true, createdAt: true },
    });
    if (!user) throw new HttpError(401, 'Compte introuvable');
    res.json({ user });
  } catch (error) { next(error); }
});

router.patch('/me/password', authenticate, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
    if (!user || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
      throw new HttpError(401, 'Mot de passe actuel incorrect');
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(req.body.newPassword) } });
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) { next(error); }
});

export default router;
