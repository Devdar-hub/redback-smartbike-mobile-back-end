import { supabase } from '../config/supabaseClient.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

const getRideIdParam = (req) => (
  req.params?.ride_id ||
  req.params?.rideId ||
  req.params?.id ||
  Object.values(req.params || {})[0]
);

const getRideSensorSummary = async (rideId) => {
  const { data, error } = await supabase
    .from('sensor_data')
    .select('timestamp,speed,cadence,heart_rate,power')
    .eq('ride_id', rideId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = data || [];
  const speedRows = rows.filter((row) => row.speed !== null && row.speed !== undefined);
  const latest = rows[rows.length - 1] || null;

  const averageSpeed = speedRows.length
    ? speedRows.reduce((total, row) => total + toNumber(row.speed), 0) / speedRows.length
    : 0;

  const maxSpeed = speedRows.length
    ? Math.max(...speedRows.map((row) => toNumber(row.speed)))
    : 0;

  const averagePower = rows.length
    ? rows.reduce((total, row) => total + toNumber(row.power), 0) / rows.length
    : 0;

  return {
    latest,
    samples: rows,
    averageSpeed,
    maxSpeed,
    averagePower,
  };
};

export const startRide = async (req, res) => {
  const { user_id, start_time } = req.body || {};

  if (!isUuid(user_id)) {
    return res.status(400).json({
      message: 'user_id is required and must be a valid profile UUID',
    });
  }

  try {
    const { data, error } = await supabase
      .from('rides')
      .insert({
        user_id,
        start_time: start_time || new Date().toISOString(),
        duration: 0,
        distance: 0,
        avg_speed: 0,
        calories: 0,
      })
      .select('ride_id,user_id,start_time,end_time,duration,distance,avg_speed,calories')
      .single();

    if (error) {
      console.error('Ride start failed:', error);
      return res.status(500).json({ message: 'Failed to start ride' });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Ride start endpoint failed:', error);
    return res.status(500).json({ message: 'Failed to start ride' });
  }
};

export const endRide = async (req, res) => {
  const rideId = getRideIdParam(req);
  const {
    end_time,
    duration,
    distance,
    avg_speed,
    calories,
  } = req.body || {};

  if (!isUuid(rideId)) {
    return res.status(400).json({ message: 'ride_id must be a valid UUID' });
  }

  try {
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('ride_id,user_id,start_time,end_time,duration,distance,avg_speed,calories')
      .eq('ride_id', rideId)
      .single();

    if (rideError || !ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    const sensorSummary = await getRideSensorSummary(rideId);
    const endTime = end_time || new Date().toISOString();
    const startedAt = ride.start_time ? new Date(ride.start_time) : null;
    const endedAt = new Date(endTime);
    const calculatedDuration = startedAt && !Number.isNaN(startedAt.getTime())
      ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
      : 0;

    const update = {
      end_time: endTime,
      duration: Math.round(toNumber(duration, calculatedDuration)),
      distance: Number(toNumber(distance, ride.distance).toFixed(3)),
      avg_speed: Number(toNumber(avg_speed, sensorSummary.averageSpeed || ride.avg_speed).toFixed(2)),
      calories: Number(toNumber(calories, ride.calories).toFixed(1)),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('rides')
      .update(update)
      .eq('ride_id', rideId)
      .select('ride_id,user_id,start_time,end_time,duration,distance,avg_speed,calories')
      .single();

    if (error) {
      console.error('Ride end failed:', error);
      return res.status(500).json({ message: 'Failed to end ride' });
    }

    return res.json({
      ...data,
      sensorSummary: {
        sampleCount: sensorSummary.samples.length,
        maxSpeed: Number(sensorSummary.maxSpeed.toFixed(2)),
        averagePower: Number(sensorSummary.averagePower.toFixed(1)),
      },
    });
  } catch (error) {
    console.error('Ride end endpoint failed:', error);
    return res.status(500).json({ message: 'Failed to end ride' });
  }
};

export const getRide = async (req, res) => {
  const rideId = getRideIdParam(req);

  if (!isUuid(rideId)) {
    return res.status(400).json({ message: 'ride_id must be a valid UUID' });
  }

  try {
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('ride_id,user_id,start_time,end_time,duration,distance,avg_speed,calories')
      .eq('ride_id', rideId)
      .single();

    if (rideError || !ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    const sensorSummary = await getRideSensorSummary(rideId);

    return res.json({
      ...ride,
      latestSensor: sensorSummary.latest,
      sensorSummary: {
        sampleCount: sensorSummary.samples.length,
        averageSpeed: Number(sensorSummary.averageSpeed.toFixed(2)),
        maxSpeed: Number(sensorSummary.maxSpeed.toFixed(2)),
        averagePower: Number(sensorSummary.averagePower.toFixed(1)),
      },
      sensorData: sensorSummary.samples,
    });
  } catch (error) {
    console.error('Ride details endpoint failed:', error);
    return res.status(500).json({ message: 'Failed to fetch ride details' });
  }
};
