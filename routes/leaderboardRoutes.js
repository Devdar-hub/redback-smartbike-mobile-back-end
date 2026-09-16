import express from 'express';
import { getLeaderboard, getUserRank } from '../controllers/leaderboardController.js';

const router = express.Router();

router.get('/', getLeaderboard);
router.get('/user/:id', getUserRank);

export default router;
