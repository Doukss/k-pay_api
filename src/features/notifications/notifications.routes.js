import { Router } from 'express';
import { prisma } from '../../shared/database.js';
import { HttpError } from '../../shared/errors.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { parsePagination } from '../../shared/validation.js';
import { relativeTime } from '../../shared/agency-events.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const allowedTypes = ['paiement', 'relance', 'retard', 'locataire', 'system'];
    if (req.query.type && !allowedTypes.includes(req.query.type)) throw new HttpError(400, 'Filtre de notification invalide');
    if (req.query.unread !== undefined && !['true', 'false'].includes(req.query.unread)) throw new HttpError(400, 'Filtre unread invalide');
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const where = {
      agencyId: req.auth.sub,
      ...(req.query.type ? { type: req.query.type } : {}),
      ...(req.query.unread !== undefined ? { isRead: req.query.unread !== 'true' } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { agencyId: req.auth.sub, isRead: false } }),
    ]);
    res.json({
      items: items.map((item) => ({ ...item, timestamp: item.createdAt.toISOString(), timeAgo: relativeTime(item.createdAt) })),
      total, unreadCount, page, limit,
    });
  } catch (error) { next(error); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const { count } = await prisma.notification.updateMany({ where: { agencyId: req.auth.sub, isRead: false }, data: { isRead: true } });
    res.json({ updated: count });
  } catch (error) { next(error); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { id: req.params.id, agencyId: req.auth.sub }, data: { isRead: true } });
    if (!result.count) throw new HttpError(404, 'Notification introuvable');
    res.json({ id: req.params.id, isRead: true });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.notification.deleteMany({ where: { id: req.params.id, agencyId: req.auth.sub } });
    if (!result.count) throw new HttpError(404, 'Notification introuvable');
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
