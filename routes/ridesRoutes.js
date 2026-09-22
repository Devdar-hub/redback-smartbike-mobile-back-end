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
