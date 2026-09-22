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

const POST_SELECT = `
  id,
  user_id,
  content,
  likes,
  created_at,
  profiles ( id, email, name, username, avatar_url ),
  comments ( id )
`;

const COMMENT_SELECT = `
  id,
  post_id,
  user_id,
  comment_text,
  created_at,
  profiles ( id, email, name, username, avatar_url )
`;

const shapePostRow = (post) => ({
  id: post.id,
  user_id: post.user_id,
  username: formatUsername(post.profiles),
  avatar: formatAvatar(post.profiles),
  content: post.content,
  likes: post.likes,
  created_at: post.created_at,
  comment_count: Array.isArray(post.comments) ? post.comments.length : 0,
});

const shapeCommentRow = (comment) => ({
  id: comment.id,
  post_id: comment.post_id,
  user_id: comment.user_id,
  username: formatUsername(comment.profiles),
  avatar: formatAvatar(comment.profiles),
  comment_text: comment.comment_text,
  created_at: comment.created_at,
});

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const getPosts = async (req, res) => {
  const limit = Math.min(Math.max(parsePositiveInt(req.query.limit, 20), 1), 50);
  const offset = parsePositiveInt(req.query.offset, 0);
  const userId = req.query.user_id;

  if (userId && !isValidUuid(userId)) {
    return res
      .status(400)
      .json({ success: false, message: 'user_id must be a valid UUID' });
  }

  try {
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Get posts query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch posts' });
    }

    const posts = (data || []).map(shapePostRow);

    return res.json({ success: true, count: posts.length, posts });
  } catch (error) {
    console.error('Get posts endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch posts' });
  }
};

export const getPostById = async (req, res) => {
  const { id } = req.params;

  if (!id || !isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id, user_id, content, likes, created_at,
        profiles ( id, email, name, username, avatar_url )
      `)
      .eq('id', id)
      .single();

    if (postError || !post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(COMMENT_SELECT)
      .eq('post_id', id)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Get post comments query failed:', commentsError);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch post comments' });
    }

    return res.json({
      success: true,
      post: {
        id: post.id,
        user_id: post.user_id,
        username: formatUsername(post.profiles),
        avatar: formatAvatar(post.profiles),
        content: post.content,
        likes: post.likes,
        created_at: post.created_at,
        comments: (comments || []).map(shapeCommentRow),
      },
    });
  } catch (error) {
    console.error('Get post endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch post' });
  }
};

export const createPost = async (req, res) => {
  const { user_id: userId, content } = req.body || {};

  if (!userId || !content || !String(content).trim()) {
    return res.status(400).json({
      success: false,
      message: 'user_id and content are required',
    });
  }

  if (!isValidUuid(userId)) {
    return res
      .status(400)
      .json({ success: false, message: 'user_id must be a valid UUID' });
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Create post profile lookup failed:', profileError);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create post' });
    }

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: String(content).trim(),
      })
      .select(`
        id, user_id, content, likes, created_at,
        profiles ( id, email, name, username, avatar_url )
      `)
      .single();

    if (error) {
      console.error('Create post insert failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create post' });
    }

    return res.status(201).json({
      success: true,
      message: 'Post created',
      post: {
        id: data.id,
        user_id: data.user_id,
        username: formatUsername(data.profiles),
        avatar: formatAvatar(data.profiles),
        content: data.content,
        likes: data.likes,
        created_at: data.created_at,
      },
    });
  } catch (error) {
    console.error('Create post endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to create post' });
  }
};

export const deletePost = async (req, res) => {
  const { id } = req.params;

  if (!id || !isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { error } = await supabase.from('posts').delete().eq('id', id);

    if (error) {
      console.error('Delete post failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to delete post' });
    }

    return res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to delete post' });
  }
};
