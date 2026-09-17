import express from 'express';
import { getUserStats, getUserSummary } from '../controllers/ridesController.js';

const router = express.Router();

router.get('/stats/:userId', getUserStats);
router.get('/summary/:userId', getUserSummary);

export default router;
