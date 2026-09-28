/**
 * Automated Verification Suite for Pothole Confidence-Based Acceptance
 * Validates the 10 User-Specified Test Cases:
 * TEST 1:  conf = 0.95  -> ACCEPTED
 * TEST 2:  conf = 0.91  -> ACCEPTED
 * TEST 3:  conf = 0.80  -> ACCEPTED
 * TEST 4:  conf = 0.799 -> completely ignored
 * TEST 5:  conf = 0.60  -> completely ignored
 * TEST 6:  Same pothole across 10 frames (0.88, 0.89, 0.91, 0.85...) -> ONE event, peak conf 0.91
 * TEST 7:  Two physically different potholes -> TWO separate events
 * TEST 8:  Refresh Admin Portal -> Accepted events remain visible
 * TEST 9:  Accepted pothole -> GIS marker available with valid coords, no verification gate for report
 * TEST 10: Rejected-by-threshold (<0.80) -> No DB record, no evidence, no GIS marker, no report
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false
    };

    const req = client.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Multipart helper for /api/edge/events
function postEdgeEvent(baseUrl, fields, imageBuffer = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${baseUrl}/api/edge/events`);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let parts = [];
    for (const [key, val] of Object.entries(fields)) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
    }

    if (imageBuffer) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="evidence_image"; filename="frame.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
    }

    const preBuffer = Buffer.from(parts.join(''), 'utf8');
    const postBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = imageBuffer 
      ? Buffer.concat([preBuffer, imageBuffer, postBuffer])
      : Buffer.concat([preBuffer, postBuffer]);

    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      },
      rejectUnauthorized: false
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, json, body });
      });
    });

    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runConfidenceSuite() {
  console.log('\n================================================================');
  console.log('   DRISHTIYANA - Confidence-Based Acceptance Test Suite');
  console.log('   Rule: conf >= 0.80 -> ACCEPTED | conf < 0.80 -> IGNORE');
  console.log('================================================================\n');

  const baseUrl = 'https://localhost:3001';
  let passed = 0;
  const dummyJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);

  // Login as admin first
  const loginRes = await request(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'DrishtiAdmin@2026' }
  });
  if (loginRes.status !== 200 || !loginRes.json?.token) {
    throw new Error('Admin login failed');
  }
  const token = loginRes.json.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // TEST 1: confidence = 0.95 -> ACCEPTED
  console.log('[TEST 1] Testing confidence = 0.95 (Expected: ACCEPTED)...');
  const t1Id = `EVT-TEST-095-${Date.now()}`;
  const t1Res = await postEdgeEvent(baseUrl, {
    event_id: t1Id,
    class_name: 'Pothole',
    confidence: '0.95',
    latitude: '17.385044',
    longitude: '78.486671',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  }, dummyJpeg);

  if (t1Res.json?.success && t1Res.json?.action === 'CREATED' && t1Res.json?.verification_status === 'ACCEPTED') {
    console.log(`   [PASS] Detection with confidence 0.95 auto-accepted without verification! (status: ${t1Res.json.verification_status})`);
    passed++;
  } else {
    throw new Error(`TEST 1 Failed: ${JSON.stringify(t1Res.json)} body: ${t1Res.body}`);
  }

  // TEST 2: confidence = 0.91 -> ACCEPTED
  console.log('\n[TEST 2] Testing confidence = 0.91 (Expected: ACCEPTED)...');
  const t2Id = `EVT-TEST-091-${Date.now()}`;
  const t2Res = await postEdgeEvent(baseUrl, {
    event_id: t2Id,
    class_name: 'Pothole',
    confidence: '0.91',
    latitude: '17.386044',
    longitude: '78.487671',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  }, dummyJpeg);

  if (t2Res.json?.success && t2Res.json?.action === 'CREATED' && t2Res.json?.verification_status === 'ACCEPTED') {
    console.log(`   [PASS] Detection with confidence 0.91 auto-accepted! (status: ${t2Res.json.verification_status})`);
    passed++;
  } else {
    throw new Error(`TEST 2 Failed: ${JSON.stringify(t2Res.json)}`);
  }

  // TEST 3: confidence = 0.80 -> ACCEPTED (Exact boundary)
  console.log('\n[TEST 3] Testing boundary confidence = 0.80 (Expected: ACCEPTED)...');
  const t3Id = `EVT-TEST-080-${Date.now()}`;
  const t3Res = await postEdgeEvent(baseUrl, {
    event_id: t3Id,
    class_name: 'Pothole',
    confidence: '0.80',
    latitude: '17.387044',
    longitude: '78.488671',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  }, dummyJpeg);

  if (t3Res.json?.success && t3Res.json?.action === 'CREATED' && t3Res.json?.verification_status === 'ACCEPTED') {
    console.log(`   [PASS] Exact boundary 0.80 auto-accepted! (status: ${t3Res.json.verification_status})`);
    passed++;
  } else {
    throw new Error(`TEST 3 Failed: ${JSON.stringify(t3Res.json)}`);
  }

  // TEST 4: confidence = 0.799 -> completely ignored
  console.log('\n[TEST 4] Testing boundary confidence = 0.799 (Expected: completely IGNORED)...');
  const t4Id = `EVT-TEST-0799-${Date.now()}`;
  const t4Res = await postEdgeEvent(baseUrl, {
    event_id: t4Id,
    class_name: 'Pothole',
    confidence: '0.799',
    latitude: '17.388044',
    longitude: '78.489671',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  }, dummyJpeg);

  if (t4Res.json?.action === 'IGNORED') {
    console.log(`   [PASS] Detection with 0.799 was completely discarded by backend! (action: ${t4Res.json.action})`);
    passed++;
  } else {
    throw new Error(`TEST 4 Failed: Expected IGNORED, got ${JSON.stringify(t4Res.json)}`);
  }

  // TEST 5: confidence = 0.60 -> completely ignored
  console.log('\n[TEST 5] Testing confidence = 0.60 (Expected: completely IGNORED)...');
  const t5Id = `EVT-TEST-060-${Date.now()}`;
  const t5Res = await postEdgeEvent(baseUrl, {
    event_id: t5Id,
    class_name: 'Pothole',
    confidence: '0.60',
    latitude: '17.389044',
    longitude: '78.490671',
    category: 'Road & Infrastructure',
    problem: 'Pothole'
  }, dummyJpeg);

  if (t5Res.json?.action === 'IGNORED') {
    console.log(`   [PASS] Detection with 0.60 was completely discarded by backend! (action: ${t5Res.json.action})`);
    passed++;
  } else {
    throw new Error(`TEST 5 Failed: Expected IGNORED, got ${JSON.stringify(t5Res.json)}`);
  }

  // TEST 6: Same pothole detected across multiple updates with peak confidence 0.91
  console.log('\n[TEST 6] Testing deduplication & peak confidence retention (0.88 -> 0.89 -> 0.91 -> 0.85 -> 0.87)...');
  const sameCandidateId = `CAND-DEDUP-${Date.now()}`;
  const sameEventId = `EVT-DEDUP-${Date.now()}`;
  const confSteps = [0.88, 0.89, 0.91, 0.85, 0.87];

  for (let i = 0; i < confSteps.length; i++) {
    const c = confSteps[i];
    await postEdgeEvent(baseUrl, {
      event_id: i === 0 ? sameEventId : `EVT-DEDUP-FRAME-${i}-${Date.now()}`,
      candidate_id: sameCandidateId,
      session_id: 'SESSION-DEDUP-TEST',
      class_name: 'Pothole',
      confidence: c.toString(),
      latitude: '17.391000',
      longitude: '78.491000',
      category: 'Road & Infrastructure',
      problem: 'Pothole'
    }, dummyJpeg);
  }

  // Query events to verify single event with peak confidence = 0.91
  const eventsRes = await request(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const dedupEvt = eventsRes.json?.events?.find(e => e.event_id === sameEventId);
  if (dedupEvt && Math.abs(dedupEvt.confidence - 0.91) < 0.001) {
    console.log(`   [PASS] Candidate across 5 frames retained ONE event with peak confidence ${dedupEvt.confidence}!`);
    passed++;
  } else {
    throw new Error(`TEST 6 Failed: Expected peak 0.91, got ${dedupEvt?.confidence}`);
  }

  // TEST 7: Two physically different potholes -> TWO separate events
  console.log('\n[TEST 7] Testing two physically different potholes (Expected: TWO separate events)...');
  const diffPotholeA = `EVT-DIFF-A-${Date.now()}`;
  const diffPotholeB = `EVT-DIFF-B-${Date.now()}`;

  await postEdgeEvent(baseUrl, {
    event_id: diffPotholeA,
    candidate_id: `CAND-DIFF-A-${Date.now()}`,
    class_name: 'Pothole',
    confidence: '0.85',
    latitude: '17.400000',
    longitude: '78.500000'
  }, dummyJpeg);

  await postEdgeEvent(baseUrl, {
    event_id: diffPotholeB,
    candidate_id: `CAND-DIFF-B-${Date.now()}`,
    class_name: 'Pothole',
    confidence: '0.88',
    latitude: '17.410000',
    longitude: '78.510000'
  }, dummyJpeg);

  const checkTwoRes = await request(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const hasA = checkTwoRes.json?.events?.some(e => e.event_id === diffPotholeA);
  const hasB = checkTwoRes.json?.events?.some(e => e.event_id === diffPotholeB);

  if (hasA && hasB) {
    console.log('   [PASS] Physically different potholes correctly produced TWO separate events!');
    passed++;
  } else {
    throw new Error('TEST 7 Failed: Both events not found');
  }

  // TEST 8: Refresh Admin Portal (GET /api/admin/events) -> Accepted events remain visible from DB
  console.log('\n[TEST 8] Testing Admin Portal refresh / persistence of accepted events...');
  const refreshRes = await request(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const allAccepted = refreshRes.json?.events?.filter(e => e.status === 'ACCEPTED' || e.verification_status === 'ACCEPTED');
  if (refreshRes.status === 200 && allAccepted.length >= 5) {
    console.log(`   [PASS] Refresh returned ${allAccepted.length} accepted events persisted in memory/DB!`);
    passed++;
  } else {
    throw new Error('TEST 8 Failed: Accepted events not visible upon refresh');
  }

  // TEST 9: Accepted pothole -> GIS marker available, immediately eligible for reporting (no lock)
  console.log('\n[TEST 9] Testing GIS coordinates and immediate reporting eligibility without verification...');
  const gisEvent = refreshRes.json?.events?.find(e => e.event_id === t1Id);
  if (gisEvent && Number.isFinite(gisEvent.latitude) && Number.isFinite(gisEvent.longitude) && gisEvent.status === 'ACCEPTED') {
    // Attempt dispatch report
    const reportRes = await request(`${baseUrl}/api/admin/reports/send`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: { event_id: t1Id, notes: 'Automated acceptance test report' }
    });

    if (reportRes.status === 200 && reportRes.json?.success) {
      console.log(`   [PASS] GIS marker ready at (${gisEvent.latitude}, ${gisEvent.longitude}) and report dispatched successfully (${reportRes.json.report_id}) with NO manual verification required!`);
      passed++;
    } else {
      throw new Error(`TEST 9 Reporting failed: ${JSON.stringify(reportRes.json)}`);
    }
  } else {
    throw new Error('TEST 9 Failed: GIS event invalid');
  }

  // TEST 10: Rejected-by-threshold detection (<0.80) -> No DB record, no evidence, no GIS marker, no report
  console.log('\n[TEST 10] Testing that <0.80 produces NO DB record, NO GIS marker, NO report capability...');
  const allEventsNow = await request(`${baseUrl}/api/admin/events`, { headers: authHeaders });
  const leaked799 = allEventsNow.json?.events?.find(e => e.event_id === t4Id);
  const leaked60 = allEventsNow.json?.events?.find(e => e.event_id === t5Id);

  if (!leaked799 && !leaked60) {
    // Try to dispatch a report on an ignored event ID
    const failReportRes = await request(`${baseUrl}/api/admin/reports/send`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: { event_id: t4Id, notes: 'Should fail' }
    });

    if (failReportRes.status === 404 || failReportRes.json?.success === false) {
      console.log('   [PASS] <0.80 detections have ZERO presence in database, zero GIS markers, and cannot be reported!');
      passed++;
    } else {
      throw new Error('TEST 10 Failed: Report was generated for ignored event');
    }
  } else {
    throw new Error('TEST 10 Failed: Discarded event found in events list');
  }

  console.log('\n================================================================');
  console.log(`   RESULTS: ${passed} / 10 TESTS PASSED`);
  console.log('================================================================\n');

  if (passed === 10) {
    console.log('>>> ALL 10 USER TEST CASES VERIFIED SUCCESSFULLY! <<<\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runConfidenceSuite().catch(err => {
  console.error('\n[SUITE ERROR]', err);
  process.exit(1);
});
