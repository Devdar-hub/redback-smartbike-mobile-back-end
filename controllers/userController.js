import { supabase } from '../config/supabaseClient.js';

const FALLBACK_PHOTO = 'https://i.pravatar.cc/150?img=14';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (value) => UUID_REGEX.test(String(value || ''));

const getFriendshipStatus = (friendship, currentUserId) => {
  if (!friendship) return 'none';

  if (friendship.status === 'accepted') return 'accepted';
  if (friendship.status === 'blocked') return 'blocked';

  if (friendship.status === 'pending') {
    return friendship.requester_id === currentUserId
      ? 'pending_sent'
      : 'pending_received';
  }

  return friendship.status;
};

export const listUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,name,username,avatar_url,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List users query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch users' });
    }

    return res.json({
      success: true,
      count: (data || []).length,
      users: data || [],
    });
  } catch (error) {
    console.error('List users endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch users' });
  }
};

export const createUser = async (req, res) => {
  const {
    id,
    email,
    name,
    username,
    avatar_url: avatarUrl,
  } = req.body || {};

  if (!id || !email) {
    return res.status(400).json({
      success: false,
      message: 'id and email are required',
    });
  }

  if (!isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id,
        email: String(email).trim().toLowerCase(),
        name: name ? String(name).trim() : null,
        username: username ? String(username).trim() : null,
        avatar_url: avatarUrl ? String(avatarUrl).trim() : null,
      })
      .select('id,email,name,username,avatar_url,created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res
          .status(409)
          .json({ success: false, message: 'Email or id already exists' });
      }

      console.error('Create user insert failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create user' });
    }

    return res
      .status(201)
      .json({ success: true, message: 'User created', user: data });
  } catch (error) {
    console.error('Create user endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to create user' });
  }
};

export const searchUsers = async (req, res) => {
  const query = String(req.query.q || '').trim();
  const currentUserId = req.query.current_user_id;

  if (!currentUserId) {
    return res.status(400).json({ message: 'current_user_id is required' });
  }

  if (!isValidUuid(currentUserId)) {
    return res
      .status(400)
      .json({ message: 'current_user_id must be a valid UUID' });
  }

  if (!query) {
    return res.json([]);
  }

  try {
    const escapedQuery = query.replace(/[%_]/g, '\\$&');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,email,name,username,avatar_url')
      .neq('id', currentUserId)
      .or(
        `email.ilike.%${escapedQuery}%,name.ilike.%${escapedQuery}%,username.ilike.%${escapedQuery}%`,
      )
      .limit(20);

    if (profilesError) {
      console.error('User search query failed:', profilesError);
      return res.status(500).json({ message: 'Failed to search users' });
    }

    const profileIds = (profiles || []).map((profile) => profile.id);

    if (profileIds.length === 0) {
      return res.json([]);
    }

    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('id,requester_id,addressee_id,status')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

    if (friendshipsError) {
      console.error('User search friendship query failed:', friendshipsError);
      return res.status(500).json({ message: 'Failed to search users' });
    }

    const rows = profileIds.map((profileId) =>
      (friendships || []).find(
        (friendship) =>
          friendship.requester_id === profileId ||
          friendship.addressee_id === profileId,
      ),
    );
    const friendshipByProfileId = new Map(
      profileIds.map((profileId, index) => [profileId, rows[index]]),
    );

    return res.json(
      (profiles || []).map((profile) => {
        const friendship = friendshipByProfileId.get(profile.id);

        return {
          id: profile.id,
          name: profile.name || profile.username || profile.email?.split('@')[0] || 'Rider',
          email: profile.email || '',
          photo: profile.avatar_url || FALLBACK_PHOTO,
          friendship_id: friendship?.id || null,
          friendship_status: getFriendshipStatus(friendship, currentUserId),
        };
      }),
    );
  } catch (error) {
    console.error('User search endpoint failed:', error);
    return res.status(500).json({ message: 'Failed to search users' });
  }
};
