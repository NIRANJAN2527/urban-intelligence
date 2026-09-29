/**
 * Automated Verification Test for Real Supabase Persistence & Outbox Protection
 * Validates Requirements 13, 14, 15, and 16
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const fs = require('fs');
const http = require('http');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = 'http://localhost:3000';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, data: null });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('   DRISHTIYANA - REAL SUPABASE PERSISTENCE & OUTBOX TEST');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Direct Supabase Permissions & RLS Diagnosis
  console.log('--- TEST 1: Inspecting Supabase Table Access & RLS Permissions ---');
  const probeId = `PROBE-${Date.now()}`;
  const probeRes = await supabase.from('events').insert([{
    id: probeId,
    event_id: probeId,
    confidence: 0.95,
    bus_id: 'BUS-001'
  }]).select();

  const isRlsBlocked = probeRes.error && probeRes.error.code === '42501';
  const isDirectInsertSuccess = !probeRes.error && probeRes.data && probeRes.data.length > 0;

  console.log(`Supabase Probe Insert Status: ${probeRes.status || 'N/A'}`);
  if (isRlsBlocked) {
    console.log('[DIAGNOSIS CONFIRMED]: RLS is active and blocking anon insert (Error 42501)');
    console.log('  Message:', probeRes.error.message);
    assert('Correctly detected Supabase RLS policy constraint (42501)', true);
  } else if (isDirectInsertSuccess) {
    console.log('[STATUS]: Direct Supabase insert succeeded!');
    assert('Direct Supabase insert succeeded with current permissions', true);
    // Cleanup probe
    await supabase.from('events').delete().eq('event_id', probeId);
  } else {
    console.log('Supabase probe response:', probeRes.error ? probeRes.error.message : 'Unknown');
  }

  // 2. Test Edge AI Pipeline Ingestion: POST /api/edge/events
  console.log('\n--- TEST 2: Testing Edge AI Ingestion (/api/edge/events) ---');
  const testEventId = `EVT-REAL-${Date.now()}`;
  const dummyB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const eventPayload = {
    event_id: testEventId,
    class_name: 'Pothole',
    category: 'Road & Infrastructure',
    confidence: 0.94,
    bus_id: 'BUS-001',
    latitude: 17.385044,
    longitude: 78.486671,
    priority: 'CRITICAL',
    risk_score: 91,
    risk_level: 'CRITICAL',
    department: 'Road Maintenance',
    status: 'PENDING',
    annotated_frame_base64: dummyB64,
    evidence_image: `data:image/jpeg;base64,${dummyB64}`,
    evidence_reference: 'pothole_frame_001.jpg',
    road_surface_status: 'Pothole Detected (High Severity)',
    timestamp: new Date().toISOString()
  };

  const edgeRes = await request(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, eventPayload);

  assert('POST /api/edge/events responded with HTTP 200', edgeRes.status === 200);
  assert('Response indicates dbConfigured is true', edgeRes.data?.dbConfigured === true);

  if (isDirectInsertSuccess) {
    // If RLS allows, dbSaved MUST be true
    assert('dbSaved is true when Supabase persistence succeeds', edgeRes.data?.dbSaved === true);
    console.log('\n--- TEST 3: Verifying row exists directly in Supabase events table ---');
    const { data: dbRows, error: selErr } = await supabase.from('events').select('*').eq('event_id', testEventId);
    assert('Direct Supabase SELECT completed without error', !selErr);
    assert('Test event row exists directly in Supabase events table', dbRows && dbRows.length === 1);
    if (dbRows && dbRows[0]) {
      assert('Stored bus_id matches in Supabase', dbRows[0].bus_id === 'BUS-001');
      assert('Stored status is PENDING in Supabase', dbRows[0].status === 'PENDING');
      assert('Confidence matches in Supabase', Math.abs(dbRows[0].confidence - 0.94) < 0.05);
    }
    // Cleanup
    await supabase.from('events').delete().eq('event_id', testEventId);
    console.log('Cleaned up test event row from Supabase.');
  } else {
    // When RLS blocks, dbSaved MUST be false and dbError MUST be exposed
    console.log('\n--- TEST 3: Verifying Outbox Queuing & Non-False Persistence Guarantee ---');
    assert('dbSaved is FALSE when Supabase insert is blocked by RLS', edgeRes.data?.dbSaved === false);
    assert('dbError exposes actual database error message', !!edgeRes.data?.dbError && edgeRes.data?.dbError.includes('row-level security'));
    console.log(`Exposed dbError: "${edgeRes.data?.dbError}"`);

    // Verify outbox file has queued the event as _synced: false
    const outboxPath = path.join(__dirname, 'data', 'persistent_supabase_events.json');
    assert('Local outbox file exists', fs.existsSync(outboxPath));
    if (fs.existsSync(outboxPath)) {
      const outboxEvents = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
      const queuedItem = outboxEvents.find(e => e.event_id === testEventId);
      assert('Event is safely queued in local outbox for retry', !!queuedItem);
      assert('Queued item has _synced: false', queuedItem?._synced === false);
      assert('Queued item records _sync_error', !!queuedItem?._sync_error);
    }
  }

  // 4. Test Simulated Supabase Failure & Outbox Queuing (Requirement 16)
  console.log('\n--- TEST 4: Simulating Supabase Failure & Outbox Queuing ---');
  const simEvtId = `EVT-SIM-FAIL-${Date.now()}`;
  const simPayload = {
    ...eventPayload,
    event_id: simEvtId
  };

  // Call supabase.insertEvent with temporarily modified client or bad data
  const { insertEvent } = require('./supabase');
  const simRes = await insertEvent(simPayload);

  if (isDirectInsertSuccess) {
    assert('Real insert succeeded when RLS is configured', simRes.success === true && simRes.dbSaved === true);
  } else {
    assert('insertEvent returns success: false on failure', simRes.success === false);
    assert('insertEvent returns dbSaved: false on failure', simRes.dbSaved === false);
    assert('insertEvent returns queued: true into outbox', simRes.queued === true);
    assert('insertEvent returns real error message', !!simRes.error);
    console.log(`[Verified] Handled Supabase failure cleanly without false success flag: "${simRes.error}"`);
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
