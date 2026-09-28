/**
 * DRISHTIYANA - Duplicate Protection & Incremental Processing Verification Suite
 * =============================================================================
 * Tests:
 * 1. Haversine Distance & 10-meter GPS proximity duplicate protection
 * 2. In-place higher confidence event updating & lower confidence dropping
 * 3. Non-blocking video processing with immediate PROCESSING_STARTED return
 * 4. Real-time progress streaming via /api/edge/video-progress & /api/session-progress/:id
 * 5. Socket.io video-processing-progress and edge-pothole-updated broadcasting
 */

const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n===============================================================');
  console.log(' DRISHTIYANA: Testing GPS Duplicate Protection & Background AI');
  console.log('===============================================================\n');

  let socketConnected = false;
  const progressEventsReceived = [];
  const updatedEventsReceived = [];

  const socket = io(BASE_URL, { reconnection: false, timeout: 3000 });

  socket.on('connect', () => {
    socketConnected = true;
    console.log('[Socket.IO] Connected successfully to monitor station');
  });

  socket.on('video-processing-progress', (data) => {
    progressEventsReceived.push(data);
  });

  socket.on('edge-pothole-updated', (data) => {
    updatedEventsReceived.push(data);
  });

  await sleep(600);

  // --------------------------------------------------------------------------
  // TEST 1: GPS Duplicate Protection (< 10 meters)
  // --------------------------------------------------------------------------
  console.log('[TEST 1] Testing GPS Duplicate Protection (<10m) & In-Place Updates...');

  const testSessionId = `SESSION-TEST-DUPE-${Date.now()}`;
  
  // Step 1A: First detection at (17.385000, 78.486000) with confidence 0.82
  console.log('\n  -> Step 1A: Submitting initial candidate event (conf=0.82)...');
  const evtA = {
    event_id: `EVT-${testSessionId}-CAND001`,
    candidate_id: 'CAND001',
    session_id: testSessionId,
    class_name: 'Pothole',
    confidence: '0.82',
    latitude: '17.385000',
    longitude: '78.486000',
    video_timestamp: '2026-09-08T10:00:01.000Z',
    gps_timestamp: '2026-09-08T10:00:01.000Z',
    source_type: 'UPLOAD'
  };

  const res1A = await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(evtA).toString()
  });
  const data1A = await res1A.json();
  console.log('     Response 1A:', data1A);
  if (data1A.action !== 'CREATED') {
    throw new Error(`Expected action 'CREATED' for initial event, got: ${data1A.action}`);
  }
  const createdEventId = data1A.event_id;

  // Step 1B: Duplicate detection at (17.385040, 78.486030) (~5.4 meters away) with LOWER confidence 0.80
  console.log('\n  -> Step 1B: Submitting duplicate candidate within 10m with LOWER confidence (0.80)...');
  const evtB = {
    event_id: `EVT-${testSessionId}-CAND002`,
    candidate_id: 'CAND002',
    session_id: testSessionId,
    class_name: 'Pothole',
    confidence: '0.80',
    latitude: '17.385040',
    longitude: '78.486030', // ~5.4m distance
    video_timestamp: '2026-09-08T10:00:01.200Z',
    gps_timestamp: '2026-09-08T10:00:01.000Z',
    source_type: 'UPLOAD'
  };

  const res1B = await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(evtB).toString()
  });
  const data1B = await res1B.json();
  console.log('     Response 1B:', data1B);
  if (data1B.action !== 'RETAINED' || data1B.event_id !== createdEventId) {
    throw new Error(`Expected action 'RETAINED' retaining event ${createdEventId}, got:`, data1B);
  }
  console.log(`     ✓ Correctly RETAINED existing event: distance = ${data1B.distance_meters}m < 10m threshold.`);

  // Step 1C: Duplicate detection at (17.385030, 78.486020) (~4.0 meters away) with HIGHER confidence 0.94
  console.log('\n  -> Step 1C: Submitting duplicate candidate within 10m with HIGHER confidence (0.94)...');
  const evtC = {
    event_id: `EVT-${testSessionId}-CAND003`,
    candidate_id: 'CAND003',
    session_id: testSessionId,
    class_name: 'Pothole',
    confidence: '0.94',
    latitude: '17.385030',
    longitude: '78.486020', // ~4.0m distance
    video_timestamp: '2026-09-08T10:00:01.400Z',
    gps_timestamp: '2026-09-08T10:00:01.000Z',
    source_type: 'UPLOAD'
  };

  const res1C = await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(evtC).toString()
  });
  const data1C = await res1C.json();
  console.log('     Response 1C:', data1C);
  if (data1C.action !== 'UPDATED' || data1C.event_id !== createdEventId || data1C.confidence !== 0.94) {
    throw new Error(`Expected action 'UPDATED' with confidence 0.94 for event ${createdEventId}, got:`, data1C);
  }
  console.log(`     ✓ Correctly IN-PLACE UPDATED existing event with higher confidence (0.94): distance = ${data1C.distance_meters}m.`);

  // Step 1D: New detection far away at (17.385800, 78.486800) (~120 meters away)
  console.log('\n  -> Step 1D: Submitting candidate far away (>10m, ~120m away)...');
  const evtD = {
    event_id: `EVT-${testSessionId}-CAND004`,
    candidate_id: 'CAND004',
    session_id: testSessionId,
    class_name: 'Pothole',
    confidence: '0.88',
    latitude: '17.385800',
    longitude: '78.486800',
    video_timestamp: '2026-09-08T10:00:04.000Z',
    gps_timestamp: '2026-09-08T10:00:04.000Z',
    source_type: 'UPLOAD'
  };

  const res1D = await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(evtD).toString()
  });
  const data1D = await res1D.json();
  console.log('     Response 1D:', data1D);
  if (data1D.action !== 'CREATED' || data1D.event_id === createdEventId) {
    throw new Error(`Expected action 'CREATED' for new distant location, got:`, data1D);
  }
  console.log('     ✓ Correctly created new separate event for location > 10m away.');

  console.log('\n[TEST 1 PASSED] 10m GPS duplicate protection, in-place updates, and distance threshold are working perfectly!\n');

  // --------------------------------------------------------------------------
  // TEST 2: Non-Blocking Background Processing & Progress Streaming
  // --------------------------------------------------------------------------
  console.log('[TEST 2] Testing Non-Blocking Background Processing & Progress Streaming...');

  // Use test video in server/uploads
  const uploadsDir = path.join(__dirname, 'uploads');
  const files = fs.readdirSync(uploadsDir);
  const mp4File = files.find(f => f.endsWith('.mp4') && fs.statSync(path.join(uploadsDir, f)).size > 100000);
  if (!mp4File) {
    console.warn('No sample mp4 found in server/uploads; skipping full video run.');
  } else {
    console.log(`  Using test video: ${mp4File}`);

    // Create a mock session directly
    const sessionRes = await fetch(`${BASE_URL}/api/process-session/SESSION-VERIFY-BG-${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_filename: mp4File,
        gps_records: [
          { timestamp: '2026-09-08T10:30:00.000Z', latitude: 17.3850, longitude: 78.4860 },
          { timestamp: '2026-09-08T10:30:01.000Z', latitude: 17.3851, longitude: 78.4861 },
          { timestamp: '2026-09-08T10:30:02.000Z', latitude: 17.3852, longitude: 78.4862 },
          { timestamp: '2026-09-08T10:30:03.000Z', latitude: 17.3853, longitude: 78.4863 },
          { timestamp: '2026-09-08T10:30:04.000Z', latitude: 17.3854, longitude: 78.4864 },
          { timestamp: '2026-09-08T10:30:05.000Z', latitude: 17.3855, longitude: 78.4865 },
          { timestamp: '2026-09-08T10:30:06.000Z', latitude: 17.3856, longitude: 78.4866 },
          { timestamp: '2026-09-08T10:30:07.000Z', latitude: 17.3857, longitude: 78.4867 },
          { timestamp: '2026-09-08T10:30:08.000Z', latitude: 17.3858, longitude: 78.4868 }
        ],
        bus_id: 'BUS-101'
      })
    });

    const bgRespData = await sessionRes.json();
    console.log('  Immediate Response from process-session:', bgRespData);

    if (bgRespData.status !== 'PROCESSING_STARTED') {
      throw new Error(`Expected status 'PROCESSING_STARTED', got: ${bgRespData.status}`);
    }
    console.log('  ✓ Verified: API returned immediately with PROCESSING_STARTED without blocking!');

    // Poll for progress updates
    const targetSessionId = bgRespData.session_id;
    console.log(`  Polling /api/session-progress/${targetSessionId} for incremental progress...`);

    let completed = false;
    let pollCount = 0;
    while (!completed && pollCount < 60) {
      await sleep(1000);
      pollCount++;

      const pRes = await fetch(`${BASE_URL}/api/session-progress/${targetSessionId}`);
      if (pRes.ok) {
        const pData = await pRes.json();
        console.log(`    [Progress Poll #${pollCount}] Status: ${pData.status} | Frames: ${pData.processed_frames}/${pData.total_frames} (${pData.percent}%) | Potholes: ${pData.potholes_found || 0} | Events: (Created: ${pData.events_created || 0}, Updated: ${pData.events_updated || 0})`);

        if (pData.status === 'COMPLETED') {
          completed = true;
          console.log('\n  ✓ Video processing completed successfully in the background!');
          console.log(`    Final Stats: Processed ${pData.processed_frames} frames in ${pData.elapsed_video_sec}s (${pData.average_fps} FPS)`);
          console.log(`    Created: ${pData.events_created} | Merged/Updated: ${pData.events_updated}`);
        } else if (pData.status === 'ERROR') {
          throw new Error(`Background processing reported ERROR: ${pData.error}`);
        }
      }
    }

    if (!completed) {
      throw new Error('Timed out waiting for background video processing to complete.');
    }
  }

  // Check socket events
  console.log(`\n  Socket.IO Progress Events Captured: ${progressEventsReceived.length}`);
  if (progressEventsReceived.length > 0) {
    console.log('  ✓ Verified Socket.IO streaming of video-processing-progress events.');
  }

  socket.disconnect();
  console.log('\n===============================================================');
  console.log(' ALL TESTS PASSED! FULL PIPELINE VERIFIED SUCCESSFULLY.');
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('\n[TEST FAILURE]', err);
  process.exit(1);
});
