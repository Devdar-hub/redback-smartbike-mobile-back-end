import express from 'express';
import {
  endRide,
  getRide,
  startRide,
} from '../controllers/ridesController.js';

const router = express.Router();

router.post('/start', startRide);
router.post('/:ride_id/end', endRide);
router.get('/:ride_id', getRide);

export default router;
import express from 'express';
import { getUserStats, getUserSummary } from '../controllers/ridesController.js';

const router = express.Router();

router.get('/stats/:userId', getUserStats);
router.get('/summary/:userId', getUserSummary);

export default router;
