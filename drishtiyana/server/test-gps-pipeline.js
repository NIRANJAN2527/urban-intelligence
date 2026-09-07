const { io } = require('socket.io-client');

async function testGpsPipeline() {
  console.log('\n======================================================');
  console.log('   DRISHTIYANA - Feature 2 GPS Pipeline Test');
  console.log('======================================================');

  const BASE_URL = 'http://localhost:3000';
  const BUS_ID = 'BUS-101';
  const TEST_SESSION_ID = `SESSION-TEST-${Date.now()}`;

  // 1. Connect Viewer Socket
  const viewerSocket = io(BASE_URL);

  let sessionStartReceived = false;
  let sessionEndReceived = false;
  let gpsUpdateReceived = false;
  let receivedGpsPayload = null;

  await new Promise((resolve) => {
    viewerSocket.on('connect', () => {
      console.log('✅ Viewer socket connected:', viewerSocket.id);
      viewerSocket.emit('join-room', { roomId: BUS_ID, role: 'viewer' });
      resolve();
    });
  });

  viewerSocket.on('session-started', (data) => {
    console.log('✅ Viewer received session-started:', data.session_id);
    sessionStartReceived = true;
  });

  viewerSocket.on('gps-update', (data) => {
    console.log(`✅ Viewer received real-time gps-update: (${data.latitude}, ${data.longitude})`);
    gpsUpdateReceived = true;
    receivedGpsPayload = data;
  });

  viewerSocket.on('session-ended', (data) => {
    console.log('✅ Viewer received session-ended:', data.session_id);
    sessionEndReceived = true;
  });

  // 2. Test POST /api/session/start
  console.log('\n[Step 1] Testing POST /api/session/start...');
  const startRes = await fetch(`${BASE_URL}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: TEST_SESSION_ID,
      bus_id: BUS_ID,
      video_started_at: new Date().toISOString()
    })
  });
  const startJson = await startRes.json();
  console.log('   Start Response:', startRes.status, startJson);
  if (startRes.status !== 200 || !startJson.success) {
    throw new Error('Failed to start session');
  }

  // 3. Test Validation on POST /api/location with invalid coordinates
  console.log('\n[Step 2] Testing POST /api/location validation (expecting 400 for bad lat)...');
  const badLatRes = await fetch(`${BASE_URL}/api/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bus_id: BUS_ID,
      session_id: TEST_SESSION_ID,
      latitude: 999.0, // Invalid
      longitude: 78.486671,
      gps_timestamp: new Date().toISOString()
    })
  });
  console.log('   Bad Lat Response:', badLatRes.status);
  if (badLatRes.status !== 400) {
    throw new Error('Validation failed: expected HTTP 400 for latitude 999.0');
  }

  // 4. Test POST /api/location with valid GPS data
  console.log('\n[Step 3] Testing POST /api/location with valid telemetry...');
  const testGpsTimestamp = new Date().toISOString();
  const goodGpsRes = await fetch(`${BASE_URL}/api/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bus_id: BUS_ID,
      session_id: TEST_SESSION_ID,
      latitude: 17.385044,
      longitude: 78.486671,
      accuracy: 8.2,
      speed: 12.4,
      heading: 145,
      gps_timestamp: testGpsTimestamp
    })
  });
  const goodGpsJson = await goodGpsRes.json();
  console.log('   Valid GPS Response:', goodGpsRes.status, goodGpsJson);
  if (goodGpsRes.status !== 200 || !goodGpsJson.server_received_at) {
    throw new Error('Valid GPS insertion failed');
  }

  // Wait a short moment for WebSocket propagation
  await new Promise(r => setTimeout(r, 600));

  // 5. Test POST /api/session/end
  console.log('\n[Step 4] Testing POST /api/session/end...');
  const endRes = await fetch(`${BASE_URL}/api/session/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: TEST_SESSION_ID,
      bus_id: BUS_ID
    })
  });
  const endJson = await endRes.json();
  console.log('   End Response:', endRes.status, endJson);
  if (endRes.status !== 200 || !endJson.success) {
    throw new Error('Failed to end session');
  }

  // Wait for session-ended event
  await new Promise(r => setTimeout(r, 400));

  viewerSocket.disconnect();

  console.log('\n======================================================');
  console.log('       FEATURE 2 TEST VERIFICATION SUMMARY            ');
  console.log('======================================================');
  console.log('Session Start API:          ', startJson.success ? 'PASS' : 'FAIL');
  console.log('Session Start WebSocket:    ', sessionStartReceived ? 'PASS' : 'FAIL');
  console.log('GPS Validation (Bad Lat):   ', badLatRes.status === 400 ? 'PASS' : 'FAIL');
  console.log('GPS Ingestion (Good GPS):   ', goodGpsJson.success ? 'PASS' : 'FAIL');
  console.log('GPS WebSocket Broadcast:    ', gpsUpdateReceived ? 'PASS' : 'FAIL');
  console.log('Session End API:            ', endJson.success ? 'PASS' : 'FAIL');
  console.log('Session End WebSocket:      ', sessionEndReceived ? 'PASS' : 'FAIL');
  console.log('======================================================\n');

  if (
    startJson.success &&
    sessionStartReceived &&
    badLatRes.status === 400 &&
    goodGpsJson.success &&
    gpsUpdateReceived &&
    endJson.success &&
    sessionEndReceived
  ) {
    console.log('🎉 ALL FEATURE 2 GPS & TIMESTAMP TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Some tests failed.');
    process.exit(1);
  }
}

testGpsPipeline().catch((err) => {
  console.error('Test pipeline error:', err);
  process.exit(1);
});
