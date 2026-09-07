// DRISHTIYANA - Supabase Backend Database Module
// Handles session management and persistent GPS telemetry storage

const path = require('path');
const dotenv = require('dotenv');

// Load .env from server/ or project root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let isConfigured = false;

if (supabaseUrl && supabaseServiceKey && supabaseUrl.startsWith('https://')) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
    isConfigured = true;
    console.log('[Supabase] Client initialized successfully.');
  } catch (err) {
    console.warn('[Supabase] Initialization error:', err.message);
  }
} else {
  console.log('[Supabase] Notice: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not yet configured.');
  console.log('[Supabase] Operating in local memory & WebSocket real-time mode.');
}

/**
 * Check if Supabase connection is active and configured
 */
function isSupabaseConfigured() {
  return isConfigured && supabase !== null;
}

/**
 * Record a new bus sensing session
 */
async function createSession({ session_id, bus_id, video_started_at }) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const { data, error } = await supabase
      .from('bus_sessions')
      .upsert({
        session_id,
        bus_id,
        video_started_at,
        session_started_at: new Date().toISOString()
      }, { onConflict: 'session_id' })
      .select();

    if (error) {
      console.warn('[Supabase] Failed to create session:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Supabase Exception] createSession:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Close/end a bus sensing session
 */
async function endSession({ session_id }) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const { data, error } = await supabase
      .from('bus_sessions')
      .update({ session_ended_at: new Date().toISOString() })
      .eq('session_id', session_id)
      .select();

    if (error) {
      console.warn('[Supabase] Failed to end session:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Supabase Exception] endSession:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Insert a validated GPS telemetry record
 */
async function insertGpsLocation(locationData) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const { data, error } = await supabase
      .from('gps_locations')
      .insert([locationData]);

    if (error) {
      console.warn('[Supabase] Failed to insert GPS location:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[Supabase Exception] insertGpsLocation:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  isSupabaseConfigured,
  createSession,
  endSession,
  insertGpsLocation
};
