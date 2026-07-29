import { supabase } from '../config/supabaseClient.js';

const FALLBACK_PHOTO = 'https://i.pravatar.cc/150?img=14';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value) => UUID_REGEX.test(String(value || ''));

const formatUsername = (profile) =>
  profile?.username ||
  profile?.name ||
  profile?.email?.split('@')[0] ||
  'Rider';

const formatAvatar = (profile) => profile?.avatar_url || FALLBACK_PHOTO;

const shapeCommentRow = (comment) => ({
  id: comment.id,
  post_id: comment.post_id,
  user_id: comment.user_id,
  username: formatUsername(comment.profiles),
  avatar: formatAvatar(comment.profiles),
  comment_text: comment.comment_text,
  created_at: comment.created_at,
});

export const getCommentsByPost = async (req, res) => {
  const { id } = req.params;

  if (!id || !isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (postError) {
      console.error('Get comments post lookup failed:', postError);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch comments' });
    }

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, post_id, user_id, comment_text, created_at,
        profiles ( id, email, name, username, avatar_url )
      `)
      .eq('post_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Get comments query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch comments' });
    }

    const comments = (data || []).map(shapeCommentRow);

    return res.json({
      success: true,
      post_id: id,
      count: comments.length,
      comments,
    });
  } catch (error) {
    console.error('Get comments endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch comments' });
  }
};

export const createComment = async (req, res) => {
  const {
    post_id: postId,
    user_id: userId,
    comment_text: commentText,
  } = req.body || {};

  if (!postId || !userId || !commentText || !String(commentText).trim()) {
    return res.status(400).json({
      success: false,
      message: 'post_id, user_id, and comment_text are required',
    });
  }

  if (!isValidUuid(postId) || !isValidUuid(userId)) {
    return res.status(400).json({
      success: false,
      message: 'post_id and user_id must be valid UUIDs',
    });
  }

  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      console.error('Create comment post lookup failed:', postError);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create comment' });
    }

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Create comment profile lookup failed:', profileError);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create comment' });
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: userId,
        comment_text: String(commentText).trim(),
      })
      .select(`
        id, post_id, user_id, comment_text, created_at,
        profiles ( id, email, name, username, avatar_url )
      `)
      .single();

    if (error) {
      console.error('Create comment insert failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create comment' });
    }

    return res.status(201).json({
      success: true,
      message: 'Comment created',
      comment: shapeCommentRow(data),
    });
  } catch (error) {
    console.error('Create comment endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to create comment' });
  }
};

export const deleteComment = async (req, res) => {
  const { id } = req.params;

  if (!id || !isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { error } = await supabase.from('comments').delete().eq('id', id);

    if (error) {
      console.error('Delete comment failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to delete comment' });
    }

    return res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete comment endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to delete comment' });
  }
};
