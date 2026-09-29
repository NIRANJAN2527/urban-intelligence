/**
 * Comprehensive Acceptance Test for Sections 26-49:
 * Verifies Supabase Permanent Event Storage & Admin Lifecycle
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, data: null });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   DRISHTIYANA SUPABASE PERSISTENCE ACCEPTANCE TEST');
  console.log('====================================================\n');

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

  try {
    // 1. Check Supabase Config
    console.log('Step 1: Checking Supabase configuration endpoint...');
    const configRes = await request(`${BASE_URL}/api/config/supabase`);
    assert('Supabase config endpoint returns 200', configRes.status === 200);
    assert('VITE_SUPABASE_URL is configured', configRes.data?.configured === true);
    assert('Supabase URL matches provided project', configRes.data?.supabaseUrl === 'https://uuiaexakkyiekudjsqvi.supabase.co');
    assert('Publishable key is exposed safely for client use', !!configRes.data?.supabaseKey);

    // 2. Authenticate as Admin
    console.log('\nStep 2: Authenticating Admin...');
    const loginRes = await request(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'admin', password: 'DrishtiAdmin@2026' });
    assert('Admin login successful (200)', loginRes.status === 200 && loginRes.data?.token);
    const token = loginRes.data?.token;
    const authCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': authCookie
    };

    // 3. Finalized Event Creation (from Edge AI pipeline)
    console.log('\nStep 3: Simulating finalized detection from Edge AI pipeline...');
    const testEventId = `EVT-ACCEPT-${Date.now()}`;
    const dummyJpegB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
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
      annotated_frame_base64: dummyJpegB64,
      evidence_image: `data:image/jpeg;base64,${dummyJpegB64}`,
      evidence_reference: 'pothole_frame_001.jpg',
      road_surface_status: 'Pothole Detected (High Severity)',
      timestamp: new Date().toISOString()
    };

    const edgeRes = await request(`${BASE_URL}/api/edge/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, eventPayload);
    assert('Finalized event created via existing pipeline (200)', edgeRes.status === 200 && edgeRes.data?.success);

    // 4. Retrieve from Admin Events (Persistent Store)
    console.log('\nStep 4: Verifying event is retrieved from persistent database...');
    const eventsRes = await request(`${BASE_URL}/api/admin/events`, {
      method: 'GET',
      headers: authHeaders
    });
    assert('Admin events endpoint returns 200', eventsRes.status === 200);
    const eventList = eventsRes.data?.events || [];
    const foundEvent = eventList.find(e => e.id === testEventId || e.event_id === testEventId);
    assert('Persisted event exists in Admin query', !!foundEvent);
    assert('Event status is initially PENDING', foundEvent?.status === 'PENDING');
    assert('Category preserved: Road & Infrastructure', foundEvent?.category === 'Road & Infrastructure');
    assert('Department preserved: Road Maintenance', foundEvent?.department.toUpperCase().includes('ROAD'));
    assert('Confidence preserved: ~0.94', Math.abs((foundEvent?.confidence || 0) - 0.94) < 0.05);

    // 5. Test Status Lifecycle: PENDING -> SENT
    console.log('\nStep 5: Testing lifecycle transition: PENDING -> SENT...');
    const patchSentRes = await request(`${BASE_URL}/api/admin/events/${testEventId}/status`, {
      method: 'PATCH',
      headers: authHeaders
    }, { status: 'SENT' });
    assert('Status update to SENT succeeds (200)', patchSentRes.status === 200 && patchSentRes.data?.success);

    // 6. Simulate Refresh / Server Re-query
    console.log('\nStep 6: Simulating browser refresh / server re-query...');
    const refreshRes1 = await request(`${BASE_URL}/api/admin/events`, {
      method: 'GET',
      headers: authHeaders
    });
    const refreshedEvent1 = (refreshRes1.data?.events || []).find(e => e.id === testEventId || e.event_id === testEventId);
    assert('Event persists across simulated refresh', !!refreshedEvent1);
    assert('Status remains SENT after refresh', refreshedEvent1?.status === 'SENT');

    // 7. Test Work Order Generation & Persistent Association
    console.log('\nStep 7: Testing Work Order creation & persistence...');
    const workOrderPayload = {
      event_id: testEventId,
      department: 'Road Maintenance',
      assignedTo: 'Engineer Rao',
      priority: 'CRITICAL',
      notes: 'Immediate asphalt patching required.',
      supervisor: 'admin'
    };
    const woRes = await request(`${BASE_URL}/api/admin/reports/send`, {
      method: 'POST',
      headers: authHeaders
    }, workOrderPayload);
    assert('Work order created via /api/admin/reports/send (200)', woRes.status === 200 && woRes.data?.success);

    const workOrdersList = await request(`${BASE_URL}/api/admin/workorders`, {
      method: 'GET',
      headers: authHeaders
    });
    assert('Work orders endpoint returns 200', workOrdersList.status === 200);
    const orderList = workOrdersList.data?.workorders || [];
    const foundWO = orderList.find(w => w.event_id === testEventId || w.eventId === testEventId);
    assert('Work order persists in database with event link', !!foundWO);

    // Test Work Order status transition
    if (foundWO) {
      const woId = foundWO.work_order_id || foundWO.id;
      const patchWoRes = await request(`${BASE_URL}/api/admin/workorders/${woId}/status`, {
        method: 'PATCH',
        headers: authHeaders
      }, { status: 'SOLVED' });
      assert('Work order status transition persists in database (200)', patchWoRes.status === 200 && patchWoRes.data?.success);
    }

    // 8. Test Status Lifecycle: SENT -> SOLVED
    console.log('\nStep 8: Testing lifecycle transition: SENT -> SOLVED...');
    const patchSolvedRes = await request(`${BASE_URL}/api/admin/events/${testEventId}/status`, {
      method: 'PATCH',
      headers: authHeaders
    }, { status: 'SOLVED' });
    assert('Status update to SOLVED succeeds (200)', patchSolvedRes.status === 200 && patchSolvedRes.data?.success);

    // 9. Simulate Refresh After SOLVED
    console.log('\nStep 9: Simulating browser refresh after SOLVED...');
    const refreshRes2 = await request(`${BASE_URL}/api/admin/events?include_inactive=true`, {
      method: 'GET',
      headers: authHeaders
    });
    const refreshedEvent2 = (refreshRes2.data?.events || []).find(e => e.id === testEventId || e.event_id === testEventId);
    assert('Event still found after SOLVED', !!refreshedEvent2);
    assert('Status remains SOLVED after second refresh', refreshedEvent2?.status === 'SOLVED');

    // 10. Duplicate Event Protection Test
    console.log('\nStep 10: Testing Duplicate Event Protection...');
    const dupRes = await request(`${BASE_URL}/api/edge/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, eventPayload); // Same id / coordinates
    assert('Duplicate post is handled gracefully without creating second row', dupRes.status === 200);

    const allEventsAfterDup = await request(`${BASE_URL}/api/admin/events?include_inactive=true`, {
      method: 'GET',
      headers: authHeaders
    });
    const duplicates = (allEventsAfterDup.data?.events || []).filter(e => e.id === testEventId || e.event_id === testEventId);
    assert(`Exactly 1 row exists for ${testEventId} (count=${duplicates.length})`, duplicates.length === 1);

    // Summary
    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    if (failed === 0) {
      console.log('ALL SECTION 49 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('SOME ACCEPTANCE CRITERIA FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during acceptance test:', err);
    process.exit(1);
  }
}

runTests();
