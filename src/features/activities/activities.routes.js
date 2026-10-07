import { Router } from 'express';
import { prisma } from '../../shared/database.js';
import { authenticate, requireAgency } from '../../shared/middleware/auth.js';
import { parsePagination } from '../../shared/validation.js';
import { relativeTime } from '../../shared/agency-events.js';

const router = Router();
router.use(authenticate, requireAgency);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = { agencyId: req.auth.sub };
    const [items, total] = await Promise.all([
      prisma.agencyActivity.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.agencyActivity.count({ where }),
    ]);
    res.json({
      items: items.map((item) => ({ ...item, time: relativeTime(item.createdAt) })),
      total, page, limit,
    });
  } catch (error) { next(error); }
});

export default router;
