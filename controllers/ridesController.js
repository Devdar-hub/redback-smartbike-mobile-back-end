import { supabase } from '../config/supabaseClient.js';

const VALID_FILTERS = new Set(['daily', 'weekly', 'monthly', 'all-time']);
const VALID_PERIODS = new Set(['weekly', 'monthly']);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value) => UUID_REGEX.test(String(value || ''));

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round2 = (value) => Math.round(value * 100) / 100;

const getPeriodStart = (key) => {
  if (key === 'all-time') return null;

  const now = new Date();

  if (key === 'daily') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start.toISOString();
  }

  if (key === 'monthly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return start.toISOString();
  }

  // weekly (default for anything else valid)
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return start.toISOString();
};

const fetchRides = async (userId, startIso) => {
  let query = supabase
    .from('rides')
    .select('ride_id,start_time,end_time,duration,distance,avg_speed,calories')
    .eq('user_id', userId);

  if (startIso) {
    query = query.gte('start_time', startIso);
  }

  return query;
};

const emptyStats = () => ({
  total_rides: 0,
  total_distance: 0,
  total_calories: 0,
  total_duration_seconds: 0,
  avg_speed: 0,
  avg_distance_per_ride: 0,
  avg_calories_per_ride: 0,
  longest_ride_distance: 0,
  fastest_avg_speed: 0,
  first_ride_at: null,
  last_ride_at: null,
});

const aggregateRideStats = (rides) => {
  if (!rides || rides.length === 0) {
    return emptyStats();
  }

  let totalDistance = 0;
  let totalCalories = 0;
  let totalDuration = 0;
  let speedSum = 0;
  let speedSamples = 0;
  let longestRide = 0;
  let fastestSpeed = 0;
  let firstRideAt = null;
  let lastRideAt = null;

  rides.forEach((ride) => {
    const distance = toNumber(ride.distance);
    const calories = toNumber(ride.calories);
    const duration = toNumber(ride.duration);
    const avgSpeed = toNumber(ride.avg_speed);

    totalDistance += distance;
    totalCalories += calories;
    totalDuration += duration;

    if (ride.avg_speed !== null && ride.avg_speed !== undefined) {
      speedSum += avgSpeed;
      speedSamples += 1;
    }

    if (distance > longestRide) longestRide = distance;
    if (avgSpeed > fastestSpeed) fastestSpeed = avgSpeed;

    if (ride.start_time) {
      const startTs = new Date(ride.start_time).getTime();
      if (!Number.isNaN(startTs)) {
        if (firstRideAt === null || startTs < firstRideAt) firstRideAt = startTs;
        if (lastRideAt === null || startTs > lastRideAt) lastRideAt = startTs;
      }
    }
  });

  const totalRides = rides.length;
  const avgSpeed = speedSamples > 0 ? speedSum / speedSamples : 0;

  return {
    total_rides: totalRides,
    total_distance: round2(totalDistance),
    total_calories: round2(totalCalories),
    total_duration_seconds: Math.round(totalDuration),
    avg_speed: round2(avgSpeed),
    avg_distance_per_ride: round2(totalDistance / totalRides),
    avg_calories_per_ride: round2(totalCalories / totalRides),
    longest_ride_distance: round2(longestRide),
    fastest_avg_speed: round2(fastestSpeed),
    first_ride_at: firstRideAt ? new Date(firstRideAt).toISOString() : null,
    last_ride_at: lastRideAt ? new Date(lastRideAt).toISOString() : null,
  };
};

export const getUserStats = async (req, res) => {
  const { userId } = req.params;
  const requestedFilter = String(req.query.filter || 'all-time');
  const filter = VALID_FILTERS.has(requestedFilter) ? requestedFilter : 'all-time';

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: 'userId is required' });
  }

  if (!isValidUuid(userId)) {
    return res
      .status(400)
      .json({ success: false, message: 'userId must be a valid UUID' });
  }

  try {
    const startIso = getPeriodStart(filter);
    const { data: rides, error } = await fetchRides(userId, startIso);

    if (error) {
      console.error('Supabase ride stats query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch ride statistics' });
    }

    return res.json({
      success: true,
      filter,
      stats: aggregateRideStats(rides || []),
    });
  } catch (error) {
    console.error('Ride stats endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch ride statistics' });
  }
};

export const getUserSummary = async (req, res) => {
  const { userId } = req.params;
  const requestedPeriod = String(req.query.period || 'weekly');
  const period = VALID_PERIODS.has(requestedPeriod) ? requestedPeriod : 'weekly';

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: 'userId is required' });
  }

  if (!isValidUuid(userId)) {
    return res
      .status(400)
      .json({ success: false, message: 'userId must be a valid UUID' });
  }

  try {
    const startIso = getPeriodStart(period);
    const periodEndIso = new Date().toISOString();

    const { data: rides, error } = await fetchRides(userId, startIso);

    if (error) {
      console.error('Supabase ride summary query failed:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to fetch ride summary' });
    }

    const stats = aggregateRideStats(rides || []);

    return res.json({
      success: true,
      period,
      period_start: startIso,
      period_end: periodEndIso,
      summary: {
        total_rides: stats.total_rides,
        total_distance: stats.total_distance,
        total_calories: stats.total_calories,
        total_duration_seconds: stats.total_duration_seconds,
        avg_speed: stats.avg_speed,
      },
    });
  } catch (error) {
    console.error('Ride summary endpoint failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch ride summary' });
  }
};
