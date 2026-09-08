const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: tryParseJson(data) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = { agent, ...options };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: tryParseJson(data) }));
    }).on('error', reject);
  });
}

function tryParseJson(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

const dummyJpegB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runTest() {
  console.log('================================================================');
  console.log('   ADMIN PORTAL GPS & FRAME IMAGE FILTER VERIFICATION');
  console.log('================================================================\n');

  const baseUrl = 'https://localhost:3001';
  let passed = 0;

  // 1. Authenticate as admin
  console.log('[STEP 1] Authenticating as admin...');
  const loginRes = await postJson(`${baseUrl}/api/auth/login`, { username: 'admin', password: 'DrishtiAdmin@2026' });
  const token = loginRes.json?.token;
  if (!token) throw new Error('Failed to get admin session token');
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('   [PASS] Authenticated successfully.\n');
  passed++;

  // 2. Test Event WITH valid GPS and valid frame image
  console.log('[TEST 1] Testing Event with VALID GPS and VALID frame image...');
  const validEvtId = `EVT-VALID-ALL-${Date.now()}`;
  const validLat = '17.420100';
  const validLon = '78.520100';
  const res1 = await postJson(`${baseUrl}/api/edge/events`, {
    event_id: validEvtId,
    class_name: 'Pothole',
    confidence: '0.94',
    latitude: validLat,
    longitude: validLon,
    category: 'Road & Infrastructure',
    problem: 'Pothole',
    annotated_frame_base64: dummyJpegB64
  });
  if (!res1.json?.success || res1.json?.action !== 'CREATED') {
    throw new Error(`Ingestion failed for valid event: ${JSON.stringify(res1.json)}`);
  }
  console.log(`   [PASS] Event ingested by backend: ${validEvtId} (status: ACCEPTED)`);

  // Verify it APPEARS in /api/admin/events
  const adminEvents1 = await fetchUrl(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const foundValid = adminEvents1.json?.events?.find(e => e.event_id === validEvtId);
  if (!foundValid) {
    throw new Error('Valid event (with GPS + frame image) failed to appear in Admin Portal!');
  }
  console.log('   [PASS] Valid event correctly appears in Admin Portal.');
  passed++;

  // 3. Test Event WITHOUT GPS (missing latitude/longitude), but WITH frame image
  console.log('\n[TEST 2] Testing Event WITHOUT GPS (null coordinates), but with frame image...');
  const noGpsEvtId = `EVT-NO-GPS-${Date.now()}`;
  const res2 = await postJson(`${baseUrl}/api/edge/events`, {
    event_id: noGpsEvtId,
    class_name: 'Pothole',
    confidence: '0.93',
    latitude: null,
    longitude: null,
    category: 'Road & Infrastructure',
    problem: 'Pothole',
    annotated_frame_base64: dummyJpegB64
  });
  // Backend logical functionality must remain intact: event is ingested and accepted by confidence
  if (!res2.json?.success || res2.json?.action !== 'CREATED') {
    throw new Error(`Backend ingestion should still succeed for unlocated event: ${JSON.stringify(res2.json)}`);
  }
  console.log(`   [PASS] Backend logic intact: Ingestion succeeded for ${noGpsEvtId}`);

  // Verify it does NOT appear in /api/admin/events
  const adminEvents2 = await fetchUrl(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const foundNoGps = adminEvents2.json?.events?.find(e => e.event_id === noGpsEvtId);
  if (foundNoGps) {
    throw new Error(`Event WITHOUT GPS should NOT be in Admin Portal, but found: ${JSON.stringify(foundNoGps)}`);
  }
  console.log('   [PASS] Event WITHOUT GPS correctly excluded from Admin Portal.');
  passed++;

  // 4. Test Event WITH valid GPS, but WITHOUT frame image (no evidence image)
  console.log('\n[TEST 3] Testing Event WITH GPS, but WITHOUT frame image...');
  const noImgEvtId = `EVT-NO-IMAGE-${Date.now()}`;
  const res3 = await postJson(`${baseUrl}/api/edge/events`, {
    event_id: noImgEvtId,
    class_name: 'Pothole',
    confidence: '0.92',
    latitude: '17.425000',
    longitude: '78.525000',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
    // no frame_image, no annotated_frame_base64
  });
  if (!res3.json?.success || res3.json?.action !== 'CREATED') {
    throw new Error(`Backend ingestion should still succeed: ${JSON.stringify(res3.json)}`);
  }
  console.log(`   [PASS] Backend logic intact: Ingestion succeeded for ${noImgEvtId}`);

  // Verify it does NOT appear in /api/admin/events
  const adminEvents3 = await fetchUrl(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const foundNoImg = adminEvents3.json?.events?.find(e => e.event_id === noImgEvtId);
  if (foundNoImg) {
    throw new Error(`Event WITHOUT frame image should NOT be in Admin Portal, but found: ${JSON.stringify(foundNoImg)}`);
  }
  console.log('   [PASS] Event WITHOUT frame image correctly excluded from Admin Portal.');
  passed++;

  // 5. Test Event WITHOUT GPS AND WITHOUT frame image
  console.log('\n[TEST 4] Testing Event WITHOUT GPS AND WITHOUT frame image...');
  const noGpsNoImgEvtId = `EVT-NO-GPS-NO-IMG-${Date.now()}`;
  const res4 = await postJson(`${baseUrl}/api/edge/events`, {
    event_id: noGpsNoImgEvtId,
    class_name: 'Pothole',
    confidence: '0.90',
    latitude: null,
    longitude: null,
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  });
  if (!res4.json?.success || res4.json?.action !== 'CREATED') {
    throw new Error(`Backend ingestion should still succeed: ${JSON.stringify(res4.json)}`);
  }
  console.log(`   [PASS] Backend logic intact: Ingestion succeeded for ${noGpsNoImgEvtId}`);

  // Verify it does NOT appear in /api/admin/events
  const adminEvents4 = await fetchUrl(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const foundNeither = adminEvents4.json?.events?.find(e => e.event_id === noGpsNoImgEvtId);
  if (foundNeither) {
    throw new Error(`Event WITHOUT GPS and WITHOUT frame image should NOT be in Admin Portal!`);
  }
  console.log('   [PASS] Event without GPS and frame image correctly excluded from Admin Portal.');
  passed++;

  // 6. Verify Admin Stats accuracy
  console.log('\n[TEST 5] Verifying /api/admin/stats reflects ONLY qualified Admin Portal events...');
  const statsRes = await fetchUrl(`${baseUrl}/api/admin/stats`, { headers: authHeaders });
  const stats = statsRes.json?.stats;
  const eventsList = adminEvents4.json?.events || [];
  if (stats?.total_events !== eventsList.length) {
    throw new Error(`Admin stats count (${stats?.total_events}) does not match Admin Portal events count (${eventsList.length})!`);
  }
  console.log(`   [PASS] /api/admin/stats total_events (${stats.total_events}) perfectly matches Admin Portal qualified events (${eventsList.length}).`);
  passed++;

  // 7. Verify all events in Admin Portal have BOTH GPS and frame image
  console.log('\n[TEST 6] Validating 100% compliance across all Admin Portal events...');
  for (const evt of eventsList) {
    const hasGps = evt.latitude !== null && evt.longitude !== null &&
                   Number.isFinite(parseFloat(evt.latitude)) && Number.isFinite(parseFloat(evt.longitude)) &&
                   (parseFloat(evt.latitude) !== 0 || parseFloat(evt.longitude) !== 0);
    const img = evt.evidence_image_url;
    const hasImage = typeof img === 'string' && img.trim().length > 0 &&
                     img.trim().toLowerCase() !== 'null' && img.trim().toLowerCase() !== 'n/a';
    if (!hasGps || !hasImage) {
      throw new Error(`Non-compliant event found in Admin Portal: ${evt.event_id} (GPS: ${hasGps}, Image: ${hasImage})`);
    }
  }
  console.log(`   [PASS] All ${eventsList.length} events in Admin Portal have valid GPS AND valid frame image!`);
  passed++;

  console.log('\n================================================================');
  console.log(`   ALL ${passed}/${passed} TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runTest().catch(err => {
  console.error('\n[TEST FAILURE]:', err.message);
  process.exit(1);
});
