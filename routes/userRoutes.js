import express from 'express';
import { createUser, listUsers, searchUsers } from '../controllers/userController.js';

const router = express.Router();

router.get('/', listUsers);
router.post('/', createUser);
router.get('/search', searchUsers);

export default router;
