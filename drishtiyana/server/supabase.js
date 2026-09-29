const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env from server/ or project root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

// Support both VITE_ prefixed client keys and standard backend environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
let isConfigured = false;

// Persistent local outbox directory - strictly for failure queuing and retry
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

const eventsDiskFile = path.join(dataDir, 'persistent_supabase_events.json');
const workOrdersDiskFile = path.join(dataDir, 'persistent_supabase_workorders.json');
const vehicleObsDiskFile = path.join(dataDir, 'persistent_supabase_vehicle_observations.json');

// Strict set of valid columns for Supabase 'events' table (43 valid columns)
const VALID_EVENT_COLUMNS = new Set([
  'id', 'event_id', 'event_type', 'category', 'confidence', 'bus_id', 'timestamp',
  'latitude', 'longitude', 'priority', 'risk_score', 'department', 'status',
  'evidence_image', 'evidence_reference', 'evidence_image_url', 'candidate_id',
  'observation_count', 'risk_level', 'session_id', 'camera_id', 'frame_id',
  'video_timestamp', 'processing_timestamp', 'class_name', 'bbox_x1', 'bbox_y1',
  'bbox_x2', 'bbox_y2', 'gps_timestamp', 'gps_accuracy', 'timestamp_difference_ms',
  'gps_match_status', 'report_status', 'report_id', 'work_order_id', 'video_source',
  'source_type', 'verification_status', 'verification_method', 'is_active',
  'created_at', 'updated_at'
]);

// Strict set of valid columns for Supabase 'work_orders' table (18 valid columns)
const VALID_WORK_ORDER_COLUMNS = new Set([
  'id', 'work_order_id', 'event_id', 'department', 'category', 'problem_type',
  'priority', 'risk_level', 'risk_score', 'latitude', 'longitude', 'address',
  'evidence_image', 'status', 'notes', 'dispatched_by', 'created_at', 'updated_at'
]);

// Strict set of valid columns for Supabase 'vehicle_observations' table (16 valid columns)
const VALID_VEHICLE_OBSERVATION_COLUMNS = new Set([
  'id', 'observation_id', 'session_id', 'bus_id', 'camera_id', 'timestamp',
  'latitude', 'longitude', 'car_count', 'motorcycle_count', 'bus_count', 'truck_count',
  'total_vehicles', 'detections', 'source_type', 'created_at'
]);


/**
 * Filter an object to only include valid columns for Supabase table
 */
function sanitizePayload(payload, allowedColumns) {
  const sanitized = {};
  for (const [key, val] of Object.entries(payload)) {
    if (allowedColumns.has(key) && val !== undefined) {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

function readDiskEvents() {
  try {
    if (fs.existsSync(eventsDiskFile)) {
      const content = fs.readFileSync(eventsDiskFile, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (e) {}
  return [];
}

function writeDiskEvents(events) {
  try {
    fs.writeFileSync(eventsDiskFile, JSON.stringify(events, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Supabase Storage] Failed to write events to disk outbox:', e.message);
  }
}

function queueEventInOutbox(payload, errorMessage = null) {
  const diskEvents = readDiskEvents();
  const existingIdx = diskEvents.findIndex(e => e.event_id === payload.event_id || e.id === payload.id);
  const outboxRecord = {
    ...payload,
    _synced: false,
    _sync_error: errorMessage,
    _queued_at: new Date().toISOString()
  };
  if (existingIdx >= 0) {
    diskEvents[existingIdx] = outboxRecord;
  } else {
    diskEvents.unshift(outboxRecord);
  }
  writeDiskEvents(diskEvents);
}

function markEventSyncedInOutbox(eventId) {
  const diskEvents = readDiskEvents();
  const existingIdx = diskEvents.findIndex(e => e.event_id === eventId || e.id === eventId);
  if (existingIdx >= 0) {
    diskEvents[existingIdx]._synced = true;
    diskEvents[existingIdx]._sync_error = null;
    diskEvents[existingIdx]._synced_at = new Date().toISOString();
    writeDiskEvents(diskEvents);
  }
}

function readDiskWorkOrders() {
  try {
    if (fs.existsSync(workOrdersDiskFile)) {
      const content = fs.readFileSync(workOrdersDiskFile, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (e) {}
  return [];
}

function writeDiskWorkOrders(orders) {
  try {
    fs.writeFileSync(workOrdersDiskFile, JSON.stringify(orders, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Supabase Storage] Failed to write work orders to disk outbox:', e.message);
  }
}

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    isConfigured = true;
    console.log('[Supabase] Client initialized successfully with:', supabaseUrl);
  } catch (err) {
    console.warn('[Supabase] Initialization error:', err.message);
  }
} else {
  console.log('[Supabase] Notice: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not yet configured.');
  console.log('[Supabase] Operating in local memory & WebSocket real-time mode.');
}

/**
 * Check if Supabase connection is active and configured
 */
function isSupabaseConfigured() {
  return isConfigured && supabase !== null;
}

/**
 * Get underlying Supabase client instance
 */
function getSupabaseClient() {
  return supabase;
}

/**
 * Record a new bus sensing session (LIVE or UPLOAD)
 */
async function createSession({ session_id, bus_id, video_started_at, source_type = 'LIVE', video_filename = null }) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const { data, error } = await supabase
      .from('bus_sessions')
      .upsert({
        id: session_id,
        session_id,
        bus_id,
        source_type: source_type || 'LIVE',
        video_filename: video_filename || null,
        video_started_at: video_started_at || null,
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
 * Insert a single GPS location telemetry point
 */
async function insertGpsLocation({ bus_id, session_id, latitude, longitude, accuracy = null, speed = null, heading = null, gps_timestamp, source_type = 'LIVE' }) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const { data, error } = await supabase
      .from('gps_locations')
      .insert([{
        bus_id,
        session_id,
        source_type: source_type || 'LIVE',
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        gps_timestamp: gps_timestamp || new Date().toISOString(),
        server_received_at: new Date().toISOString()
      }]);

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

/**
 * Bulk insert GPS location points in chunks of 500
 */
async function insertGpsLocationsBulk(records) {
  if (!isSupabaseConfigured() || !records || records.length === 0) {
    return { success: false, reason: 'unconfigured_or_empty' };
  }

  const CHUNK_SIZE = 500;
  let insertedTotal = 0;

  try {
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('gps_locations')
        .insert(chunk);

      if (error) {
        console.warn(`[Supabase Bulk Insert] Chunk ${i / CHUNK_SIZE + 1} error:`, error.message);
      } else {
        insertedTotal += chunk.length;
      }
    }

    return { success: true, count: insertedTotal };
  } catch (err) {
    console.error('[Supabase Exception] insertGpsLocationsBulk:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve sorted GPS trajectory for a session
 */
async function getSessionGpsLocations(sessionId) {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured', data: [] };
  }

  try {
    const { data, error } = await supabase
      .from('gps_locations')
      .select('*')
      .eq('session_id', sessionId)
      .order('gps_timestamp', { ascending: true });

    if (error) {
      console.warn('[Supabase] Failed to get session GPS locations:', error.message);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error('[Supabase Exception] getSessionGpsLocations:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Normalizes an event data object into the standardized Supabase database model
 */
function normalizeEventPayload(eventData) {
  const eventId = eventData.event_id || eventData.id || `EVT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const rawLat = (eventData.latitude !== undefined && eventData.latitude !== null && !isNaN(parseFloat(eventData.latitude))) ? parseFloat(eventData.latitude) : null;
  const rawLon = (eventData.longitude !== undefined && eventData.longitude !== null && !isNaN(parseFloat(eventData.longitude))) ? parseFloat(eventData.longitude) : null;
  const rawConf = typeof eventData.confidence === 'number' ? eventData.confidence : parseFloat(eventData.confidence || 0.85);

  const timestamp = eventData.timestamp || eventData.processing_timestamp || eventData.created_at || new Date().toISOString();
  const evidenceUrl = eventData.evidence_image_url || eventData.evidence_image || null;

  return {
    id: eventData.id || eventId,
    event_id: eventId,
    event_type: eventData.event_type || 'POTHOLE',
    category: eventData.category || 'Road & Infrastructure',
    confidence: rawConf,
    bus_id: eventData.bus_id || 'BUS-101',
    timestamp: timestamp,
    latitude: rawLat,
    longitude: rawLon,
    priority: (eventData.priority || 'MEDIUM').toUpperCase(),
    risk_score: eventData.risk_score !== undefined && eventData.risk_score !== null ? parseInt(eventData.risk_score, 10) : 50,
    department: eventData.department || 'ROAD MAINTENANCE',
    status: (eventData.status || 'PENDING').toUpperCase(), // Simple lifecycle: PENDING -> SENT -> SOLVED
    evidence_image: evidenceUrl,
    evidence_reference: eventData.evidence_reference || eventData.best_frame_path || null,
    evidence_image_url: evidenceUrl,
    candidate_id: eventData.candidate_id || null,
    observation_count: eventData.observation_count ? parseInt(eventData.observation_count, 10) : 1,
    risk_level: (eventData.risk_level || 'MEDIUM').toUpperCase(),
    session_id: eventData.session_id || 'UNKNOWN',
    camera_id: eventData.camera_id || 'CAM-01',
    frame_id: eventData.frame_id ? parseInt(eventData.frame_id, 10) : null,
    video_timestamp: eventData.video_timestamp || null,
    processing_timestamp: eventData.processing_timestamp || timestamp,
    class_name: eventData.class_name || eventData.problem || 'Pothole',
    bbox_x1: eventData.bbox_x1 ? parseInt(eventData.bbox_x1, 10) : null,
    bbox_y1: eventData.bbox_y1 ? parseInt(eventData.bbox_y1, 10) : null,
    bbox_x2: eventData.bbox_x2 ? parseInt(eventData.bbox_x2, 10) : null,
    bbox_y2: eventData.bbox_y2 ? parseInt(eventData.bbox_y2, 10) : null,
    gps_timestamp: eventData.gps_timestamp || null,
    gps_accuracy: eventData.gps_accuracy && !isNaN(parseFloat(eventData.gps_accuracy)) ? parseFloat(eventData.gps_accuracy) : null,
    timestamp_difference_ms: eventData.timestamp_difference_ms && !isNaN(parseInt(eventData.timestamp_difference_ms, 10)) ? parseInt(eventData.timestamp_difference_ms, 10) : null,
    gps_match_status: eventData.gps_match_status || 'UNCHECKED',
    report_status: (eventData.report_status || 'PENDING').toUpperCase(),
    report_id: eventData.report_id || null,
    work_order_id: eventData.work_order_id || null,
    video_source: eventData.video_source || null,
    source_type: eventData.source_type || 'LIVE',
    verification_status: eventData.verification_status || 'ACCEPTED',
    verification_method: eventData.verification_method || 'AUTO_ACCEPTED',
    is_active: eventData.is_active !== undefined ? eventData.is_active : true,
    created_at: eventData.created_at || timestamp,
    updated_at: new Date().toISOString()
  };
}

/**
 * Insert or upsert a finalized event into Supabase
 * Strict source of truth: Returns true ONLY when row is successfully inserted into Supabase.
 * On failure, queues in local outbox and returns success: false with real error.
 */
async function insertEvent(eventData) {
  const fullPayload = normalizeEventPayload(eventData);
  const dbPayload = sanitizePayload(fullPayload, VALID_EVENT_COLUMNS);

  console.log(`[Supabase] Attempting event insert: ${fullPayload.event_id}`);

  if (!isSupabaseConfigured()) {
    const errorMsg = 'Supabase unconfigured - VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY missing';
    console.warn(`[Supabase] Event persistence FAILED: ${fullPayload.event_id} (${errorMsg})`);
    queueEventInOutbox(fullPayload, errorMsg);
    return {
      success: false,
      dbSaved: false,
      error: errorMsg,
      table: 'outbox',
      queued: true,
      data: [fullPayload]
    };
  }

  try {
    // Attempt upsert to primary 'events' table
    const { data, error } = await supabase
      .from('events')
      .upsert(dbPayload, { onConflict: 'event_id' })
      .select();

    if (!error) {
      console.log(`[Supabase] Event persisted successfully: ${fullPayload.event_id} (table: events)`);
      markEventSyncedInOutbox(fullPayload.event_id);
      return {
        success: true,
        dbSaved: true,
        table: 'events',
        data
      };
    }

    // If 'events' table does not exist in schema, fallback to legacy 'pothole_events'
    if (error && error.message && error.message.includes('not find the table')) {
      const { data: pData, error: pError } = await supabase
        .from('pothole_events')
        .upsert(dbPayload, { onConflict: 'event_id' })
        .select();

      if (!pError) {
        console.log(`[Supabase] Event persisted successfully: ${fullPayload.event_id} (table: pothole_events)`);
        markEventSyncedInOutbox(fullPayload.event_id);
        return {
          success: true,
          dbSaved: true,
          table: 'pothole_events',
          data: pData
        };
      }
    }

    // Supabase returned an error (e.g. 42501 RLS policy violation or validation failure)
    console.error(`[Supabase] Event persistence FAILED: ${fullPayload.event_id}`);
    console.error(`[Supabase] Error: ${error.message}${error.code ? ' (code: ' + error.code + ')' : ''}`);

    if (error.code === '42501') {
      console.error('[Supabase RLS Alert] Row-Level Security blocked insert. Execute fix_supabase_rls.sql in Supabase Dashboard SQL Editor.');
    }

    // Queue in local outbox for synchronization when available
    queueEventInOutbox(fullPayload, error.message);

    return {
      success: false,
      dbSaved: false,
      error: error.message,
      code: error.code || null,
      table: 'outbox',
      queued: true,
      data: [fullPayload]
    };
  } catch (err) {
    console.error(`[Supabase] Event persistence FAILED: ${fullPayload.event_id}`);
    console.error(`[Supabase] Error: ${err.message}`);

    queueEventInOutbox(fullPayload, err.message);

    return {
      success: false,
      dbSaved: false,
      error: err.message,
      table: 'outbox',
      queued: true,
      data: [fullPayload]
    };
  }
}

// Backward compatible alias
const insertPotholeEvent = insertEvent;

/**
 * Query all finalized events from Supabase with filters.
 * Returns Supabase data as source of truth.
 * Falls back to disk outbox ONLY when Supabase connection fails.
 */
async function getEvents(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      const buildQuery = (tableName) => {
        let query = supabase
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: false });

        if (filters.category && filters.category !== 'all') {
          query = query.ilike('category', `%${filters.category}%`);
        }
        if (filters.status && filters.status !== 'all') {
          query = query.eq('status', filters.status.toUpperCase());
        }
        if (filters.department && filters.department !== 'all') {
          query = query.ilike('department', `%${filters.department}%`);
        }
        if (filters.priority && filters.priority !== 'all') {
          query = query.eq('priority', filters.priority.toUpperCase());
        }
        if (filters.risk_level && filters.risk_level !== 'all') {
          query = query.eq('risk_level', filters.risk_level.toUpperCase());
        }
        if (filters.bus_id && filters.bus_id !== 'all') {
          query = query.eq('bus_id', filters.bus_id);
        }
        if (filters.report_status && filters.report_status !== 'all') {
          query = query.eq('report_status', filters.report_status.toUpperCase());
        }

        const limit = filters.limit ? parseInt(filters.limit, 10) : 500;
        return query.limit(limit);
      };

      const { data, error } = await buildQuery('events');

      if (!error && Array.isArray(data)) {
        // Successful response from Supabase (even if empty [])
        return {
          success: true,
          table: 'events',
          isFallback: false,
          data: data
        };
      }

      // If 'events' table not found, try 'pothole_events'
      if (error && error.message && error.message.includes('not find the table')) {
        const { data: pData, error: pError } = await buildQuery('pothole_events');
        if (!pError && Array.isArray(pData)) {
          return {
            success: true,
            table: 'pothole_events',
            isFallback: false,
            data: pData
          };
        }
      }

      console.warn('[Supabase] Failed to query events, using local outbox:', error ? error.message : 'Unknown error');
    } catch (err) {
      console.warn('[Supabase] Connection error during getEvents, using local outbox:', err.message);
    }
  }

  // Fallback to local outbox only when Supabase is unreachable or unconfigured
  let diskEvents = readDiskEvents();
  if (filters.category && filters.category !== 'all') {
    diskEvents = diskEvents.filter(e => (e.category || '').toLowerCase().includes(filters.category.toLowerCase()));
  }
  if (filters.status && filters.status !== 'all') {
    diskEvents = diskEvents.filter(e => (e.status || 'PENDING').toUpperCase() === filters.status.toUpperCase());
  }
  if (filters.department && filters.department !== 'all') {
    diskEvents = diskEvents.filter(e => (e.department || '').toLowerCase().includes(filters.department.toLowerCase()));
  }

  return {
    success: true,
    table: 'local_fallback',
    isFallback: true,
    data: diskEvents
  };
}

// Backward compatible alias
const getPotholeEvents = getEvents;

/**
 * Update event persistent lifecycle status (PENDING -> SENT -> SOLVED)
 */
async function updateEventStatus(eventId, newStatus) {
  const normalizedStatus = String(newStatus).toUpperCase();
  const updatePayload = {
    status: normalizedStatus,
    updated_at: new Date().toISOString()
  };

  // Update outbox
  const diskEvents = readDiskEvents();
  const idx = diskEvents.findIndex(e => e.event_id === eventId || e.id === eventId);
  if (idx >= 0) {
    diskEvents[idx] = { ...diskEvents[idx], ...updatePayload };
    writeDiskEvents(diskEvents);
  }

  if (!isSupabaseConfigured()) {
    return { success: false, dbSaved: false, error: 'unconfigured', table: 'outbox' };
  }

  try {
    const { error } = await supabase.from('events').update(updatePayload).eq('event_id', eventId);
    if (error) {
      console.warn('[Supabase] updateEventStatus error:', error.message);
      return { success: false, dbSaved: false, error: error.message };
    }
    return { success: true, dbSaved: true, table: 'events' };
  } catch (err) {
    console.error('[Supabase Exception] updateEventStatus:', err.message);
    return { success: false, dbSaved: false, error: err.message };
  }
}

/**
 * Update verification / acceptance status on pothole_events/events
 */
async function updateEventVerificationStatus(eventId, verificationStatus, isActive = true, auditData = {}) {
  const updatePayload = {
    verification_status: verificationStatus,
    is_active: isActive,
    updated_at: new Date().toISOString(),
    ...auditData
  };

  const diskEvents = readDiskEvents();
  const idx = diskEvents.findIndex(e => e.event_id === eventId || e.id === eventId);
  if (idx >= 0) {
    diskEvents[idx] = { ...diskEvents[idx], ...updatePayload };
    writeDiskEvents(diskEvents);
  }

  if (!isSupabaseConfigured()) {
    return { success: false, dbSaved: false, reason: 'unconfigured' };
  }

  try {
    await supabase.from('events').update(updatePayload).eq('event_id', eventId);
    await supabase.from('pothole_events').update(updatePayload).eq('event_id', eventId);
    return { success: true, dbSaved: true };
  } catch (err) {
    console.error('[Supabase Exception] updateEventVerificationStatus:', err.message);
    return { success: false, dbSaved: false, error: err.message };
  }
}

/**
 * Persist work order to Supabase
 */
async function saveWorkOrder(workOrderData) {
  const workOrderId = workOrderData.work_order_id || workOrderData.report_id || `WO-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const nowIso = new Date().toISOString();

  const fullPayload = {
    id: workOrderId,
    work_order_id: workOrderId,
    event_id: workOrderData.event_id || workOrderData.eventId,
    department: workOrderData.department || 'ROAD MAINTENANCE',
    category: workOrderData.category || 'Road & Infrastructure',
    problem_type: workOrderData.problem_type || workOrderData.problem || 'Pothole',
    priority: (workOrderData.priority || 'MEDIUM').toUpperCase(),
    risk_level: (workOrderData.risk_level || 'MEDIUM').toUpperCase(),
    risk_score: workOrderData.risk_score !== undefined ? parseInt(workOrderData.risk_score, 10) : 50,
    latitude: workOrderData.latitude || null,
    longitude: workOrderData.longitude || null,
    address: workOrderData.address || workOrderData.location_address || null,
    evidence_image: workOrderData.evidence_image || workOrderData.evidence_image_url || null,
    status: (workOrderData.status || 'SENT').toUpperCase(),
    notes: workOrderData.notes || 'Automated Work Order from DrishtiYana Incident Report',
    dispatched_by: workOrderData.dispatched_by || 'admin',
    created_at: workOrderData.created_at || nowIso,
    updated_at: nowIso
  };

  const dbPayload = sanitizePayload(fullPayload, VALID_WORK_ORDER_COLUMNS);

  if (!isSupabaseConfigured()) {
    const diskOrders = readDiskWorkOrders();
    diskOrders.unshift({ ...fullPayload, _synced: false });
    writeDiskWorkOrders(diskOrders);
    return { success: false, dbSaved: false, error: 'unconfigured', table: 'outbox', data: [fullPayload] };
  }

  try {
    const { data, error } = await supabase
      .from('work_orders')
      .upsert(dbPayload, { onConflict: 'work_order_id' })
      .select();

    if (!error) {
      console.log(`[Supabase] Work order persisted successfully: ${workOrderId}`);
      return { success: true, dbSaved: true, table: 'work_orders', data };
    }

    console.error(`[Supabase] Work order persistence FAILED: ${workOrderId} - ${error.message}`);
    const diskOrders = readDiskWorkOrders();
    diskOrders.unshift({ ...fullPayload, _synced: false, _sync_error: error.message });
    writeDiskWorkOrders(diskOrders);

    return { success: false, dbSaved: false, error: error.message, table: 'outbox', data: [fullPayload] };
  } catch (err) {
    console.error(`[Supabase] Work order exception: ${err.message}`);
    return { success: false, dbSaved: false, error: err.message, table: 'outbox', data: [fullPayload] };
  }
}

// Backward compatible alias
const saveDepartmentReport = saveWorkOrder;

/**
 * Retrieve all persistent work orders from Supabase
 */
async function getWorkOrders(filters = {}) {
  if (isSupabaseConfigured()) {
    try {
      let query = supabase.from('work_orders').select('*').order('created_at', { ascending: false });
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status.toUpperCase());
      }
      if (filters.department && filters.department !== 'all') {
        query = query.ilike('department', `%${filters.department}%`);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return { success: true, isFallback: false, data };
      }
    } catch (e) {
      console.warn('[Supabase] getWorkOrders error, using local fallback:', e.message);
    }
  }

  let diskOrders = readDiskWorkOrders();
  if (filters.status && filters.status !== 'all') {
    diskOrders = diskOrders.filter(w => (w.status || 'SENT').toUpperCase() === filters.status.toUpperCase());
  }
  if (filters.department && filters.department !== 'all') {
    diskOrders = diskOrders.filter(w => (w.department || '').toLowerCase().includes(filters.department.toLowerCase()));
  }

  return { success: true, isFallback: true, data: diskOrders };
}

/**
 * Update work order status (SENT -> SOLVED)
 */
async function updateWorkOrderStatus(workOrderId, newStatus) {
  const normStatus = String(newStatus).toUpperCase();
  const updatePayload = {
    status: normStatus,
    updated_at: new Date().toISOString()
  };

  const diskOrders = readDiskWorkOrders();
  const idx = diskOrders.findIndex(w => w.work_order_id === workOrderId || w.id === workOrderId);
  if (idx >= 0) {
    diskOrders[idx] = { ...diskOrders[idx], ...updatePayload };
    writeDiskWorkOrders(diskOrders);
  }

  if (!isSupabaseConfigured()) {
    return { success: false, dbSaved: false, error: 'unconfigured' };
  }

  try {
    const { error } = await supabase.from('work_orders').update(updatePayload).eq('work_order_id', workOrderId);
    if (error) {
      return { success: false, dbSaved: false, error: error.message };
    }
    return { success: true, dbSaved: true };
  } catch (err) {
    return { success: false, dbSaved: false, error: err.message };
  }
}

/**
 * Update event report status on both events and pothole_events
 */
async function updateEventReportStatus(eventId, reportId, reportStatus = 'SENT') {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'unconfigured' };
  }

  const updatePayload = {
    report_status: reportStatus,
    report_id: reportId,
    status: 'SENT', // Transitions PENDING -> SENT
    updated_at: new Date().toISOString()
  };

  try {
    await supabase.from('events').update(updatePayload).eq('event_id', eventId);
    await supabase.from('pothole_events').update(updatePayload).eq('event_id', eventId);
    return { success: true };
  } catch (err) {
    console.error('[Supabase Exception] updateEventReportStatus:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Retry/Synchronization mechanism:
 * Flushes locally queued outbox events to Supabase when connection/permissions are restored
 */
async function syncOutboxToSupabase() {
  if (!isSupabaseConfigured()) {
    return { synced: 0, pending: 0, reason: 'unconfigured' };
  }

  const diskEvents = readDiskEvents();
  const unsynced = diskEvents.filter(e => e._synced === false);

  if (unsynced.length === 0) {
    return { synced: 0, pending: 0 };
  }

  console.log(`[Supabase Sync] Attempting to sync ${unsynced.length} queued outbox event(s) to Supabase...`);
  let syncedCount = 0;

  for (const item of unsynced) {
    try {
      const clean = sanitizePayload(item, VALID_EVENT_COLUMNS);
      const { error } = await supabase.from('events').upsert(clean, { onConflict: 'event_id' });
      if (!error) {
        item._synced = true;
        item._sync_error = null;
        item._synced_at = new Date().toISOString();
        syncedCount++;
        console.log(`[Supabase Sync] Successfully synced outbox event: ${item.event_id}`);
      } else {
        item._sync_error = error.message;
      }
    } catch (err) {
      item._sync_error = err.message;
    }
  }

  writeDiskEvents(diskEvents);

  // Sync unsynced vehicle observations
  const diskVehicles = readDiskVehicleObservations();
  const unsyncedVehicles = diskVehicles.filter(v => v._synced === false);
  for (const item of unsyncedVehicles) {
    try {
      const clean = sanitizePayload(item, VALID_VEHICLE_OBSERVATION_COLUMNS);
      const { error } = await supabase.from('vehicle_observations').upsert(clean, { onConflict: 'observation_id' });
      if (!error) {
        item._synced = true;
        item._sync_error = null;
        item._synced_at = new Date().toISOString();
      } else {
        item._sync_error = error.message;
      }
    } catch (err) {
      item._sync_error = err.message;
    }
  }
  writeDiskVehicleObservations(diskVehicles);

  return { synced: syncedCount, pending: unsynced.length - syncedCount };
}

// Background auto-retry synchronization worker running every 30 seconds
const syncInterval = setInterval(() => {
  syncOutboxToSupabase().catch(() => {});
}, 30000);
if (syncInterval.unref) {
  syncInterval.unref(); // Prevents timer from keeping test scripts alive
}

// ==============================================================================
// VEHICLE OBSERVATIONS & TRAFFIC DENSITY PERSISTENCE LAYER
// ==============================================================================

function readDiskVehicleObservations() {
  try {
    if (fs.existsSync(vehicleObsDiskFile)) {
      const content = fs.readFileSync(vehicleObsDiskFile, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (e) {}
  return [];
}

function writeDiskVehicleObservations(observations) {
  try {
    fs.writeFileSync(vehicleObsDiskFile, JSON.stringify(observations, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Supabase Storage] Failed to write vehicle observations to disk outbox:', e.message);
  }
}

async function insertVehicleObservation(obsData) {
  const observationId = obsData.observation_id || `VOBS-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const recordId = obsData.id || observationId;

  const carCount = parseInt(obsData.car_count || 0, 10);
  const motorcycleCount = parseInt(obsData.motorcycle_count || 0, 10);
  const busCount = parseInt(obsData.bus_count || 0, 10);
  const truckCount = parseInt(obsData.truck_count || 0, 10);
  const totalVehicles = parseInt(obsData.total_vehicles !== undefined ? obsData.total_vehicles : (carCount + motorcycleCount + busCount + truckCount), 10);

  const payload = {
    id: recordId,
    observation_id: observationId,
    session_id: obsData.session_id || 'DEFAULT-SESSION',
    bus_id: obsData.bus_id || 'BUS-101',
    camera_id: obsData.camera_id || 'CAM-01',
    timestamp: obsData.timestamp || new Date().toISOString(),
    latitude: parseFloat(obsData.latitude),
    longitude: parseFloat(obsData.longitude),
    car_count: carCount,
    motorcycle_count: motorcycleCount,
    bus_count: busCount,
    truck_count: truckCount,
    total_vehicles: totalVehicles,
    detections: obsData.detections || [],
    source_type: obsData.source_type || 'LIVE',
    created_at: obsData.created_at || new Date().toISOString()
  };

  // 1. Always persist to disk outbox first
  const diskRecords = readDiskVehicleObservations();
  const existingIdx = diskRecords.findIndex(r => r.observation_id === observationId || r.id === recordId);
  const outboxItem = {
    ...payload,
    _synced: false,
    _sync_error: null,
    _queued_at: new Date().toISOString()
  };
  if (existingIdx >= 0) {
    diskRecords[existingIdx] = outboxItem;
  } else {
    diskRecords.unshift(outboxItem);
  }
  // Bounded memory/disk cache (max 2000 observations)
  if (diskRecords.length > 2000) diskRecords.length = 2000;
  writeDiskVehicleObservations(diskRecords);

  // 2. Try inserting into Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const clean = sanitizePayload(payload, VALID_VEHICLE_OBSERVATION_COLUMNS);
      const { data, error } = await supabase.from('vehicle_observations').insert(clean).select().single();
      if (!error) {
        outboxItem._synced = true;
        outboxItem._synced_at = new Date().toISOString();
        writeDiskVehicleObservations(diskRecords);
        console.log(`[Supabase DB] Vehicle observation persisted to Supabase: ${observationId} (Total: ${totalVehicles})`);
        return { success: true, observation: data || clean, source: 'supabase' };
      } else {
        outboxItem._sync_error = error.message;
        writeDiskVehicleObservations(diskRecords);
        console.warn(`[Supabase Storage Notice] Vehicle observation queued locally: ${error.message}`);
      }
    } catch (err) {
      outboxItem._sync_error = err.message;
      writeDiskVehicleObservations(diskRecords);
      console.warn(`[Supabase Storage Notice] Supabase insert exception for vehicle observation: ${err.message}`);
    }
  }

  return { success: true, observation: payload, source: 'disk_outbox' };
}

async function getVehicleObservations(filters = {}) {
  const { timeWindowMinutes, vehicleType, limit = 1000 } = filters;
  let cutoffIso = null;
  if (timeWindowMinutes && timeWindowMinutes > 0) {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    cutoffIso = cutoffTime.toISOString();
  }

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('vehicle_observations')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (cutoffIso) {
        query = query.gte('timestamp', cutoffIso);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn('[Supabase Storage] Supabase query failed, falling back to disk:', err.message);
    }
  }

  // Fallback to disk records
  const diskRecords = readDiskVehicleObservations();
  let filtered = diskRecords;
  if (cutoffIso) {
    const cutoffMs = new Date(cutoffIso).getTime();
    filtered = diskRecords.filter(r => {
      const t = new Date(r.timestamp || r.created_at).getTime();
      return t >= cutoffMs;
    });
  }
  return filtered.slice(0, limit);
}

/**
 * Computes spatial grid / geographic bin aggregation of vehicle observations
 * to generate a real, data-driven traffic density heatmap.
 * @param {string} vehicleType - 'all', 'car', 'motorcycle', 'bus', 'truck'
 * @param {number|null} timeWindowMinutes - null for all time, or 30, 60, 360, etc.
 */
async function getTrafficDensityGrid(vehicleType = 'all', timeWindowMinutes = 60) {
  const observations = await getVehicleObservations({ timeWindowMinutes });
  if (!observations || observations.length === 0) {
    return {
      points: [],
      cells: [],
      maxCount: 0,
      totalVehicles: 0,
      breakdown: { cars: 0, motorcycles: 0, buses: 0, trucks: 0, total: 0 },
      totalObservations: 0,
      vehicleType,
      timeWindowMinutes
    };
  }

  // Grid resolution: ~0.001 degrees (~100m)
  const GRID_SIZE = 0.001;
  const grid = new Map();

  let overallTotalVehicles = 0;
  let overallCars = 0;
  let overallMotorcycles = 0;
  let overallBuses = 0;
  let overallTrucks = 0;

  for (const obs of observations) {
    const lat = parseFloat(obs.latitude);
    const lon = parseFloat(obs.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    const car = parseInt(obs.car_count || 0, 10);
    const motorcycle = parseInt(obs.motorcycle_count || 0, 10);
    const bus = parseInt(obs.bus_count || 0, 10);
    const truck = parseInt(obs.truck_count || 0, 10);
    const total = parseInt(obs.total_vehicles !== undefined ? obs.total_vehicles : (car + motorcycle + bus + truck), 10);

    overallCars += car;
    overallMotorcycles += motorcycle;
    overallBuses += bus;
    overallTrucks += truck;
    overallTotalVehicles += total;

    // Filter count based on requested vehicleType
    let targetCount = 0;
    const vType = (vehicleType || 'all').toLowerCase();
    if (vType === 'car') {
      targetCount = car;
    } else if (vType === 'motorcycle') {
      targetCount = motorcycle;
    } else if (vType === 'bus') {
      targetCount = bus;
    } else if (vType === 'truck') {
      targetCount = truck;
    } else {
      targetCount = total;
    }

    if (targetCount <= 0) continue;

    // Geographic binning
    const latBin = Math.round(lat / GRID_SIZE) * GRID_SIZE;
    const lonBin = Math.round(lon / GRID_SIZE) * GRID_SIZE;
    const key = `${latBin.toFixed(4)},${lonBin.toFixed(4)}`;

    if (!grid.has(key)) {
      grid.set(key, {
        latitude: parseFloat(latBin.toFixed(4)),
        longitude: parseFloat(lonBin.toFixed(4)),
        count: 0,
        cars: 0,
        motorcycles: 0,
        buses: 0,
        trucks: 0,
        total: 0,
        observationCount: 0
      });
    }

    const cell = grid.get(key);
    cell.count += targetCount;
    cell.cars += car;
    cell.motorcycles += motorcycle;
    cell.buses += bus;
    cell.trucks += truck;
    cell.total += total;
    cell.observationCount += 1;
  }

  const cells = Array.from(grid.values());
  if (cells.length === 0) {
    return {
      points: [],
      cells: [],
      maxCount: 0,
      totalVehicles: overallTotalVehicles,
      breakdown: {
        cars: overallCars,
        motorcycles: overallMotorcycles,
        buses: overallBuses,
        trucks: overallTrucks,
        total: overallTotalVehicles
      },
      totalObservations: observations.length,
      vehicleType,
      timeWindowMinutes
    };
  }

  // Find maximum count for normalization
  let maxCount = 0;
  for (const c of cells) {
    if (c.count > maxCount) maxCount = c.count;
  }

  // Generate Leaflet.heat points: [lat, lon, intensity]
  // Intensity normalized between 0.2 (low) and 1.0 (high)
  const points = cells.map(c => {
    const rawIntensity = maxCount > 0 ? (c.count / maxCount) : 0.2;
    const intensity = parseFloat((0.2 + 0.8 * rawIntensity).toFixed(3));
    return [c.latitude, c.longitude, intensity];
  });

  return {
    points,
    cells,
    maxCount,
    totalVehicles: overallTotalVehicles,
    breakdown: {
      cars: overallCars,
      motorcycles: overallMotorcycles,
      buses: overallBuses,
      trucks: overallTrucks,
      total: overallTotalVehicles
    },
    totalObservations: observations.length,
    vehicleType,
    timeWindowMinutes
  };
}

async function getVehicleSummaryStats(timeWindowMinutes = null) {
  const observations = await getVehicleObservations({ timeWindowMinutes, limit: 5000 });
  let total_vehicles = 0;
  let cars = 0;
  let motorcycles = 0;
  let buses = 0;
  let trucks = 0;

  for (const obs of observations) {
    const c = parseInt(obs.car_count || 0, 10);
    const m = parseInt(obs.motorcycle_count || 0, 10);
    const b = parseInt(obs.bus_count || 0, 10);
    const t = parseInt(obs.truck_count || 0, 10);
    const tot = parseInt(obs.total_vehicles !== undefined ? obs.total_vehicles : (c + m + b + t), 10);

    cars += c;
    motorcycles += m;
    buses += b;
    trucks += t;
    total_vehicles += tot;
  }

  return {
    total_vehicles,
    cars,
    motorcycles,
    buses,
    trucks,
    observation_count: observations.length,
    timeWindowMinutes
  };
}

module.exports = {
  isSupabaseConfigured,
  getSupabaseClient,
  createSession,
  endSession,
  insertGpsLocation,
  insertGpsLocationsBulk,
  getSessionGpsLocations,
  insertEvent,
  insertPotholeEvent,
  getEvents,
  getPotholeEvents,
  updateEventStatus,
  updateEventVerificationStatus,
  saveWorkOrder,
  saveDepartmentReport,
  getWorkOrders,
  updateWorkOrderStatus,
  updateEventReportStatus,
  syncOutboxToSupabase,
  insertVehicleObservation,
  getVehicleObservations,
  getTrafficDensityGrid,
  getVehicleSummaryStats,
  VALID_EVENT_COLUMNS,
  VALID_WORK_ORDER_COLUMNS,
  VALID_VEHICLE_OBSERVATION_COLUMNS,
  sanitizePayload
};

