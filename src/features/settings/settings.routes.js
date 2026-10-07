import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { validateBody } from '../../shared/validation.js';
import { createActivity } from '../../shared/agency-events.js';
import { updateSettingsSchema } from './settings.schemas.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/', async (req, res, next) => {
  try {
    const [user, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.auth.sub }, select: { agencyName: true, name: true, telephone: true, email: true } }),
      prisma.agencySetting.findUnique({ where: { agencyId: req.auth.sub } }),
    ]);
    if (!user) return res.status(404).json({ message: 'Agence introuvable' });
    const settings = existing || await prisma.agencySetting.create({
      data: { id: randomUUID(), agencyId: req.auth.sub, administrativeEmail: user.email },
    });
    res.json({
      agencyName: user.agencyName, contactName: user.name, phone: user.telephone,
      email: settings.administrativeEmail, address: settings.address, ninea: settings.ninea,
      waveActive: settings.waveActive, omActive: settings.orangeMoneyActive,
      feeBearer: settings.feeBearer, remindJMinus3: settings.remindJMinus3,
      remindJDay: settings.remindJDay, remindJPlus3: settings.remindJPlus3,
      remindLanguage: settings.remindLanguage, twoFactor: settings.twoFactorEnabled,
    });
  } catch (error) { next(error); }
});

router.patch('/', validateBody(updateSettingsSchema), async (req, res, next) => {
  try {
    const agencyId = req.auth.sub;
    const fields = req.body;
    const userData = {};
    if (fields.agencyName !== undefined) userData.agencyName = fields.agencyName;
    if (fields.contactName !== undefined) userData.name = fields.contactName;
    if (fields.phone !== undefined) userData.telephone = fields.phone;
    const settingsData = {};
    if (fields.email !== undefined) settingsData.administrativeEmail = fields.email;
    if (fields.address !== undefined) settingsData.address = fields.address;
    if (fields.ninea !== undefined) settingsData.ninea = fields.ninea;
    if (fields.waveActive !== undefined) settingsData.waveActive = fields.waveActive;
    if (fields.omActive !== undefined) settingsData.orangeMoneyActive = fields.omActive;
    if (fields.feeBearer !== undefined) settingsData.feeBearer = fields.feeBearer;
    if (fields.remindJMinus3 !== undefined) settingsData.remindJMinus3 = fields.remindJMinus3;
    if (fields.remindJDay !== undefined) settingsData.remindJDay = fields.remindJDay;
    if (fields.remindJPlus3 !== undefined) settingsData.remindJPlus3 = fields.remindJPlus3;
    if (fields.remindLanguage !== undefined) settingsData.remindLanguage = fields.remindLanguage;
    if (fields.twoFactor !== undefined) settingsData.twoFactorEnabled = fields.twoFactor;

    const result = await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) await tx.user.update({ where: { id: agencyId }, data: userData });
      const user = await tx.user.findUnique({ where: { id: agencyId }, select: { agencyName: true, name: true, telephone: true, email: true } });
      const settings = await tx.agencySetting.upsert({
        where: { agencyId },
        create: { id: randomUUID(), agencyId, administrativeEmail: user.email, ...settingsData },
        update: settingsData,
      });
      await createActivity(tx, agencyId, { type: 'locataire', title: 'Paramètres mis à jour', description: 'Les paramètres de l’agence ont été enregistrés.' });
      return { user, settings };
    });
    res.json({
      message: 'Paramètres enregistrés',
      settings: {
        agencyName: result.user.agencyName, contactName: result.user.name, phone: result.user.telephone,
        email: result.settings.administrativeEmail, address: result.settings.address, ninea: result.settings.ninea,
        waveActive: result.settings.waveActive, omActive: result.settings.orangeMoneyActive,
        feeBearer: result.settings.feeBearer, remindJMinus3: result.settings.remindJMinus3,
        remindJDay: result.settings.remindJDay, remindJPlus3: result.settings.remindJPlus3,
        remindLanguage: result.settings.remindLanguage, twoFactor: result.settings.twoFactorEnabled,
      },
    });
  } catch (error) { next(error); }
});

export default router;
