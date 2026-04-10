import type { VercelRequest, VercelResponse } from '@vercel/node';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

import { CLINIC_INTEGRATION } from '../lib/shared.js';
import { runArchive } from '../lib/archive.js';

const CRON_SECRET = process.env['CRON_SECRET'] || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = req.headers['authorization'];
    const expected = `Bearer ${CRON_SECRET}`;
    if (!CRON_SECRET || auth !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Compute yesterday in Bucharest TZ (explicit, per spec)
    dayjs.tz(dayjs(), 'Europe/Bucharest').subtract(1, 'day');

    const result = await runArchive(CLINIC_INTEGRATION.clinicId);
    if (result.archived === 0) {
      return res.json({ success: true, archived: 0, message: 'Nothing to archive.' });
    }

    return res.json({
      success: true,
      archived: result.archived,
      errors: result.errors,
      ranAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron failed';
    return res.status(500).json({ error: msg });
  }
}

