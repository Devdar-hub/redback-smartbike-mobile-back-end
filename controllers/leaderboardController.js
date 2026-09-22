import { supabase } from '../config/supabaseClient.js';

const VALID_FILTERS = new Set(['daily', 'weekly', 'all-time']);
const VALID_SORTS = new Set(['points', 'distance', 'speed']);
const FALLBACK_PHOTO = 'https://i.pravatar.cc/150?img=14';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value) => UUID_REGEX.test(String(value || ''));

const getFilterStart = (filter) => {
  if (filter === 'all-time') return null;

  const now = new Date();

  if (filter === 'daily') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start.toISOString();
  }

  // weekly
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return start.toISOString();
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatUsername = (profile) =>
  profile?.username ||
  profile?.name ||
  profile?.email?.split('@')[0] ||
  'Rider';

const aggregateRidesByUser = (rides) => {
  const byUser = new Map();

  rides.forEach((ride) => {
    const userId = ride.user_id;
    if (!userId) return;

    const existing = byUser.get(userId) || {
      user_id: userId,
      profile: ride.profiles,
      total_distance: 0,
      total_calories: 0,
      speed_sum: 0,
      total_rides: 0,
    };

    existing.total_distance += toNumber(ride.distance);
    existing.total_calories += toNumber(ride.calories);
    existing.speed_sum += toNumber(ride.avg_speed);
    existing.total_rides += 1;

    byUser.set(userId, existing);
  });

  return Array.from(byUser.values()).map((row) => {
    const avgSpeed = row.total_rides > 0 ? row.speed_sum / row.total_rides : 0;
    const totalPoints = Math.round(row.total_distance * 10 + row.total_calories);

    return {
      user_id: row.user_id,
      username: formatUsername(row.profile),
      avatar: row.profile?.avatar_url || FALLBACK_PHOTO,
      total_distance: Math.round(row.total_distance * 100) / 100,
      avg_speed: Math.round(avgSpeed * 100) / 100,
      total_points: totalPoints,
      total_rides: row.total_rides,
    };
  });
};

const sortRows = (rows, sortBy) => {
  const key =
    sortBy === 'distance'
      ? 'total_distance'
      : sortBy === 'speed'
      ? 'avg_speed'
      : 'total_points';

  return [...rows].sort((first, second) => second[key] - first[key]);
};

const fetchRides = async (filter) => {
  let query = supabase.from('rides').select(`
      user_id,
      distance,
      calories,
      avg_speed,
      start_time,
      profiles (
        id,
        email,
        name,
        username,
        avatar_url
      )
    `);

  const filterStart = getFilterStart(filter);
  if (filterStart) {
    query = query.gte('start_time', filterStart);
  }

  return query;
};

export const getLeaderboard = async (req, res) => {
  const requestedFilter = String(req.query.filter || 'all-time');
  const requestedSort = String(req.query.sort_by || 'points');
  const requestedLimit = Number.parseInt(req.query.limit, 10);

  const filter = VALID_FILTERS.has(requestedFilter) ? requestedFilter : 'all-time';
  const sort_by = VALID_SORTS.has(requestedSort) ? requestedSort : 'points';
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1),
    50,
  );

  try {
    const { data: rides, error } = await fetchRides(filter);

    if (error) {
      console.error('Supabase leaderboard query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch leaderboard data' });
    }

    const aggregated = aggregateRidesByUser(rides || []);
    const sorted = sortRows(aggregated, sort_by);
    const leaderboard = sorted.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      ...row,
    }));

    return res.json({
      success: true,
      filter,
      sort_by,
      count: leaderboard.length,
      leaderboard,
    });
  } catch (error) {
    console.error('Leaderboard endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch leaderboard data' });
  }
};

export const getUserRank = async (req, res) => {
  const { id } = req.params;
  const requestedFilter = String(req.query.filter || 'all-time');
  const filter = VALID_FILTERS.has(requestedFilter) ? requestedFilter : 'all-time';

  if (!id) {
    return res.status(400).json({ success: false, message: 'id is required' });
  }

  if (!isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, message: 'id must be a valid UUID' });
  }

  try {
    const { data: rides, error } = await fetchRides(filter);

    if (error) {
      console.error('Supabase user-rank query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch user rank' });
    }

    const aggregated = aggregateRidesByUser(rides || []);
    const sorted = sortRows(aggregated, 'points');
    const rankIndex = sorted.findIndex((row) => row.user_id === id);

    if (rankIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found or has no rides in this time period',
      });
    }

    return res.json({
      success: true,
      filter,
      rank: rankIndex + 1,
      user: sorted[rankIndex],
    });
  } catch (error) {
    console.error('User rank endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch user rank' });
  }
};
