import express from 'express';
import {
  createPost,
  deletePost,
  getPostById,
  getPosts,
} from '../controllers/postsController.js';
import { getCommentsByPost } from '../controllers/commentsController.js';

const router = express.Router();

router.get('/', getPosts);
router.post('/', createPost);
router.get('/:id', getPostById);
router.delete('/:id', deletePost);
router.get('/:id/comments', getCommentsByPost);

export default router;
