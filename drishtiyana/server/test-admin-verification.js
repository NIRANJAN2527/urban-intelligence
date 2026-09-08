/**
 * Verification Test Suite: Admin Portal GIS & Verification Workflow
 */
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:3000';

async function runTests() {
  console.log('============================================================');
  console.log('🧪 RUNNING ADMIN PORTAL VERIFICATION WORKFLOW TESTS');
  console.log('============================================================\n');

  // 1. Admin Authentication
  console.log('1. Authenticating admin user...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'DrishtiAdmin@2026' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Login HTTP status should be 200');
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  const token = loginData.token;
  console.log('   ✅ Admin token acquired.\n');

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Ingest AI Candidate Event (Default verification_status)
  console.log('2. Ingesting AI detection candidate into Edge pipeline...');
  const eventId1 = `EVT-TEST-REVIEW-${Date.now()}-1`;
  const candidatePayload = {
    event_id: eventId1,
    candidate_id: 'CAND-V1',
    session_id: 'SESSION-VERIF-TEST',
    bus_id: 'BUS-101',
    class_name: 'Pothole',
    confidence: 0.912, // 91.2% confidence preserved
    latitude: 17.385044,
    longitude: 78.486671,
    risk_score: 82,
    risk_level: 'HIGH',
    priority: 'HIGH'
  };

  const createRes = await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(candidatePayload)
  });
  const createData = await createRes.json();
  assert.strictEqual(createRes.status, 200, 'Event creation should succeed');
  assert.strictEqual(createData.success, true, 'Event creation should be successful');
  console.log(`   ✅ Candidate event ${eventId1} created.\n`);

  // Verify candidate defaults to PENDING_REVIEW
  console.log('3. Verifying candidate starts in PENDING_REVIEW status...');
  const eventsRes = await fetch(`${BASE_URL}/api/admin/events?verification_status=PENDING_REVIEW`, {
    headers: authHeaders
  });
  const eventsData = await eventsRes.json();
  assert.strictEqual(eventsRes.status, 200);
  const foundCandidate = eventsData.events.find(e => e.event_id === eventId1);
  assert(foundCandidate, 'Candidate event must be present in PENDING_REVIEW list');
  assert.strictEqual(foundCandidate.verification_status, 'PENDING_REVIEW', 'verification_status must be PENDING_REVIEW');
  assert.strictEqual(foundCandidate.is_active, true, 'is_active must be true');
  assert.strictEqual(foundCandidate.confidence, 0.912, 'Original AI confidence 91.2% must be preserved');
  console.log(`   ✅ Event is in PENDING_REVIEW state with confidence ${(foundCandidate.confidence * 100).toFixed(1)}%.\n`);

  // 4. Locked Reporting Guard: Try sending report on PENDING_REVIEW event
  console.log('4. Testing locked reporting restriction on unverified candidate...');
  const unverifiedReportRes = await fetch(`${BASE_URL}/api/admin/reports/send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ event_id: eventId1, notes: 'Attempting unverified dispatch' })
  });
  const unverifiedReportData = await unverifiedReportRes.json();
  assert.strictEqual(unverifiedReportRes.status, 400, 'Reporting unverified candidate must return 400 Bad Request');
  assert.strictEqual(unverifiedReportData.success, false, 'Report dispatch must fail for unverified candidate');
  console.log(`   ✅ Server correctly blocked dispatch: "${unverifiedReportData.error}"\n`);

  // 5. Verify Event
  console.log('5. Transitioning candidate to VERIFIED status...');
  const verifyRes = await fetch(`${BASE_URL}/api/admin/events/${eventId1}/verify`, {
    method: 'PATCH',
    headers: authHeaders
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, 'Verify endpoint should return 200');
  assert.strictEqual(verifyData.success, true);
  assert.strictEqual(verifyData.verification_status, 'VERIFIED');
  assert.strictEqual(verifyData.is_active, true);
  console.log(`   ✅ Event ${eventId1} transitioned to VERIFIED.\n`);

  // 6. Authorized Report Dispatch: Send report on VERIFIED event
  console.log('6. Dispatching department report on VERIFIED event...');
  const reportRes = await fetch(`${BASE_URL}/api/admin/reports/send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ event_id: eventId1, notes: 'Supervisor confirmed severe pothole' })
  });
  const reportData = await reportRes.json();
  assert.strictEqual(reportRes.status, 200, 'Report dispatch on verified event should return 200');
  assert.strictEqual(reportData.success, true, 'Report dispatch should succeed');
  assert(reportData.report_id, 'A report ID must be generated');
  console.log(`   ✅ Report ${reportData.report_id} dispatched to ${reportData.department}.\n`);

  // 7. Test Rejection Workflow (False positive candidate)
  console.log('7. Ingesting second candidate to test REJECT / False Positive workflow...');
  const eventId2 = `EVT-TEST-REJECT-${Date.now()}-2`;
  await fetch(`${BASE_URL}/api/edge/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId2,
      candidate_id: 'CAND-V2',
      session_id: 'SESSION-VERIF-TEST-2',
      bus_id: 'BUS-102',
      class_name: 'Pothole',
      confidence: 0.54,
      latitude: 17.3870,
      longitude: 78.4890,
      risk_score: 30,
      risk_level: 'LOW',
      priority: 'LOW'
    })
  });

  console.log(`   Rejecting event ${eventId2} as false positive...`);
  const rejectRes = await fetch(`${BASE_URL}/api/admin/events/${eventId2}/reject`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ reason: 'Harmless shadow marking on asphalt' })
  });
  const rejectData = await rejectRes.json();
  assert.strictEqual(rejectRes.status, 200, 'Reject endpoint should return 200');
  assert.strictEqual(rejectData.verification_status, 'REJECTED');
  assert.strictEqual(rejectData.is_active, false, 'Rejected candidate must have is_active: false');
  console.log(`   ✅ Event ${eventId2} marked REJECTED (is_active: false).\n`);

  // Verify rejected candidate is excluded from active map/list by default
  console.log('8. Verifying rejected candidate is excluded from default active list...');
  const defaultEventsRes = await fetch(`${BASE_URL}/api/admin/events`, { headers: authHeaders });
  const defaultEventsData = await defaultEventsRes.json();
  const foundInDefault = defaultEventsData.events.find(e => e.event_id === eventId2);
  assert(!foundInDefault, 'Rejected candidate must be hidden from default active event list');
  console.log('   ✅ Rejected candidate successfully excluded from active view.\n');

  // Verify rejected candidate is preserved when filtering by REJECTED or all
  console.log('9. Verifying rejected candidate is preserved for audit history...');
  const rejectedEventsRes = await fetch(`${BASE_URL}/api/admin/events?verification_status=REJECTED`, { headers: authHeaders });
  const rejectedEventsData = await rejectedEventsRes.json();
  const foundInRejected = rejectedEventsData.events.find(e => e.event_id === eventId2);
  assert(foundInRejected, 'Rejected candidate must be preserved in REJECTED audit query');
  assert.strictEqual(foundInRejected.verification_status, 'REJECTED');
  assert.strictEqual(foundInRejected.is_active, false);
  console.log('   ✅ Preserved for audit history with reason:', foundInRejected.rejection_reason, '\n');

  // Verify sending report on rejected event fails
  console.log('10. Testing that report cannot be sent for REJECTED candidate...');
  const rejectReportRes = await fetch(`${BASE_URL}/api/admin/reports/send`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ event_id: eventId2 })
  });
  assert.strictEqual(rejectReportRes.status, 400, 'Reporting rejected candidate must return 400');
  console.log('   ✅ Server rejected dispatch for REJECTED candidate.\n');

  // 11. Dashboard Stats Verification
  console.log('11. Verifying real review counters in GET /api/admin/stats...');
  const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, { headers: authHeaders });
  const statsData = await statsRes.json();
  assert.strictEqual(statsRes.status, 200);
  assert(statsData.stats.total_detections > 0, 'total_detections should be > 0');
  assert(statsData.stats.verified >= 1, 'verified count should be >= 1');
  assert(statsData.stats.rejected >= 1, 'rejected count should be >= 1');
  assert(statsData.stats.reports_sent >= 1, 'reports_sent count should be >= 1');
  console.log('   Stats Summary:', {
    total_detections: statsData.stats.total_detections,
    pending_review: statsData.stats.pending_review,
    verified: statsData.stats.verified,
    rejected: statsData.stats.rejected,
    reports_sent: statsData.stats.reports_sent
  });
  console.log('   ✅ Dashboard stats reflect real database/memory counts.\n');

  console.log('============================================================');
  console.log('🎉 ALL 11 VERIFICATION WORKFLOW TESTS PASSED PERFECTLY!');
  console.log('============================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
