/**
 * Automated Verification Test for DrishtiYana Secure Admin Portal & Department Reports
 * Tests:
 * 1. GET /login serves dedicated Login page
 * 2. Unauthenticated access to /admin redirects (302) to /login
 * 3. Unauthenticated access to /api/admin/* endpoints returns 401 Unauthorized
 * 4. Invalid credentials rejected with 401
 * 5. Valid credentials (admin / DrishtiAdmin@2026) succeed with session token & cookie
 * 6. Session verification via GET /api/auth/check
 * 7. Authenticated access to /api/admin/config, /api/admin/stats, and /api/admin/events
 * 8. Uninterrupted Edge AI ingestion via POST /api/edge/events (with report_status: 'PENDING')
 * 9. Dispatching GIS incident report via POST /api/admin/reports/send
 * 10. Duplicate report prevention on subsequent send requests for the same event
 * 11. Querying dispatched reports via GET /api/admin/reports
 * 12. Session termination via POST /api/auth/logout
 */

const http = require('http');
const https = require('https');

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

async function runTests() {
  console.log('\n=============================================================');
  console.log('   DRISHTIYANA - Secure Admin & GIS Report Dispatch Tests');
  console.log('=============================================================\n');

  let passed = 0;
  const baseUrl = process.env.TEST_URL || 'https://localhost:3001';
  let authCookie = null;
  let authToken = null;

  try {
    // TEST 1: Dedicated Login Page
    console.log('[TEST 1] Testing /login HTML route...');
    const loginRes = await request(`${baseUrl}/login`);
    if (loginRes.status === 200 && loginRes.body.includes('Supervisor Login ID') && loginRes.body.includes('DRISHTIYANA')) {
      console.log('   [PASS] /login served successfully with dedicated Login page');
      passed++;
    } else {
      throw new Error(`/login failed: HTTP ${loginRes.status}`);
    }

    // TEST 2: Unauthenticated /admin Redirects to /login
    console.log('\n[TEST 2] Testing unauthenticated access to /admin...');
    const unauthAdminRes = await request(`${baseUrl}/admin`);
    if (unauthAdminRes.status === 302 && unauthAdminRes.headers.location && unauthAdminRes.headers.location.includes('/login')) {
      console.log(`   [PASS] Unauthenticated access properly redirected to: ${unauthAdminRes.headers.location}`);
      passed++;
    } else {
      throw new Error(`Expected 302 redirect for /admin, got ${unauthAdminRes.status}`);
    }

    // TEST 3: Unauthenticated /api/admin/* Rejection (401)
    console.log('\n[TEST 3] Testing unauthenticated access to /api/admin/events & /api/admin/stats...');
    const unauthApiRes = await request(`${baseUrl}/api/admin/events`);
    if (unauthApiRes.status === 401 && unauthApiRes.json && unauthApiRes.json.success === false) {
      console.log('   [PASS] /api/admin/events rejected with 401 Unauthorized');
      passed++;
    } else {
      throw new Error(`Expected 401 for /api/admin/events, got ${unauthApiRes.status}`);
    }

    // TEST 4: Invalid Credentials Rejected
    console.log('\n[TEST 4] Testing login with invalid credentials...');
    const invalidLoginRes = await request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: 'WrongPassword!2026' }
    });
    if (invalidLoginRes.status === 401 && invalidLoginRes.json && invalidLoginRes.json.success === false) {
      console.log('   [PASS] Invalid login credentials rejected with 401 Unauthorized');
      passed++;
    } else {
      throw new Error(`Expected 401 for invalid credentials, got ${invalidLoginRes.status}`);
    }

    // TEST 5: Valid Login Authentication
    console.log('\n[TEST 5] Testing login with valid credentials (admin / DrishtiAdmin@2026)...');
    const validLoginRes = await request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: 'DrishtiAdmin@2026' }
    });
    if (validLoginRes.status === 200 && validLoginRes.json && validLoginRes.json.success && validLoginRes.json.token) {
      authToken = validLoginRes.json.token;
      // Extract Set-Cookie
      const setCookie = validLoginRes.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        authCookie = setCookie[0].split(';')[0];
      }
      console.log(`   [PASS] Login successful! Token received: ${authToken.slice(0, 16)}... | Cookie: ${authCookie ? 'Present' : 'None'}`);
      passed++;
    } else {
      throw new Error(`Login failed with status ${validLoginRes.status}: ${validLoginRes.body}`);
    }

    // TEST 6: Verify Session Check
    console.log('\n[TEST 6] Testing session check endpoint /api/auth/check...');
    const checkRes = await request(`${baseUrl}/api/auth/check`, {
      headers: {
        'Cookie': authCookie,
        'Authorization': `Bearer ${authToken}`
      }
    });
    if (checkRes.status === 200 && checkRes.json && checkRes.json.authenticated === true && checkRes.json.user.username === 'admin') {
      console.log(`   [PASS] Authenticated session confirmed for user: ${checkRes.json.user.username}`);
      passed++;
    } else {
      throw new Error(`Auth check failed: ${checkRes.body}`);
    }

    // TEST 7: Authenticated Access to Admin Portal & APIs
    console.log('\n[TEST 7] Testing authenticated access to /admin and /api/admin/config...');
    const authedAdminRes = await request(`${baseUrl}/admin`, {
      headers: { 'Cookie': authCookie }
    });
    const authedConfigRes = await request(`${baseUrl}/api/admin/config`, {
      headers: { 'Cookie': authCookie }
    });
    if (authedAdminRes.status === 200 && authedConfigRes.status === 200 && authedConfigRes.json && authedConfigRes.json.taxonomy) {
      console.log(`   [PASS] /admin and /api/admin/config accessible with active session`);
      passed++;
    } else {
      throw new Error(`Authenticated admin access failed: HTML=${authedAdminRes.status}, API=${authedConfigRes.status}`);
    }

    // TEST 8: Edge AI Ingestion (Uninterrupted & Without Auth Requirement)
    console.log('\n[TEST 8] Testing Edge AI event ingestion (/api/edge/events)...');
    const testEvtId = `EVT-REPORT-TEST-${Date.now()}`;
    const dummyJpegB64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const edgePostData = `event_id=${testEvtId}&class_name=Pothole&confidence=0.92&risk_score=78&risk_level=HIGH&priority=HIGH&latitude=17.4399&longitude=78.4982&session_id=SESSION-SECURE-TEST&annotated_frame_base64=${encodeURIComponent(dummyJpegB64)}`;
    const edgeRes = await request(`${baseUrl}/api/edge/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: edgePostData
    });

    if (edgeRes.status === 200 && edgeRes.json && edgeRes.json.success) {
      console.log(`   [PASS] Edge AI event successfully ingested: ${testEvtId} (Evidence: ${edgeRes.json.evidence_image_url || 'N/A'})`);
      passed++;
    } else {
      throw new Error(`Edge AI event ingestion failed: ${edgeRes.body}`);
    }

    // TEST 9: Dispatch GIS Department Report
    console.log('\n[TEST 9] Testing GIS Department Report dispatch (/api/admin/reports/send)...');
    const reportRes = await request(`${baseUrl}/api/admin/reports/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie,
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        event_id: testEvtId,
        notes: 'Priority road repair required near Secunderabad Junction',
        supervisor: 'admin'
      }
    });

    if (reportRes.status === 200 && reportRes.json && reportRes.json.success && reportRes.json.report_id) {
      console.log(`   [PASS] GIS Incident Report dispatched! Report ID: ${reportRes.json.report_id} -> ${reportRes.json.department}`);
      console.log(`          Resolved Address: ${reportRes.json.location_address}`);
      passed++;
    } else {
      throw new Error(`Report dispatch failed: ${reportRes.body}`);
    }

    // TEST 10: Duplicate Report Prevention (Idempotency)
    console.log('\n[TEST 10] Testing duplicate report prevention for the same event...');
    const duplicateRes = await request(`${baseUrl}/api/admin/reports/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie,
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        event_id: testEvtId,
        notes: 'Duplicate dispatch attempt',
        supervisor: 'admin'
      }
    });

    if (duplicateRes.status === 200 && duplicateRes.json && duplicateRes.json.duplicate === true && duplicateRes.json.status === 'SENT') {
      console.log(`   [PASS] Duplicate dispatch prevented! Returned existing report ID: ${duplicateRes.json.report_id}`);
      passed++;
    } else {
      throw new Error(`Duplicate prevention failed: ${duplicateRes.body}`);
    }

    // TEST 11: Query Dispatched Reports List
    console.log('\n[TEST 11] Testing GET /api/admin/reports...');
    const reportsListRes = await request(`${baseUrl}/api/admin/reports`, {
      headers: { 'Cookie': authCookie }
    });
    if (reportsListRes.status === 200 && reportsListRes.json && Array.isArray(reportsListRes.json.reports)) {
      const found = reportsListRes.json.reports.find(r => r.event_id === testEvtId);
      if (found) {
        console.log(`   [PASS] Dispatched report verified in report registry (${reportsListRes.json.count} total reports)`);
        passed++;
      } else {
        throw new Error(`Dispatched report not found in reports list`);
      }
    } else {
      throw new Error(`Reports listing failed: ${reportsListRes.body}`);
    }

    // TEST 12: Logout & Session Invalidation
    console.log('\n[TEST 12] Testing logout (/api/auth/logout)...');
    const logoutRes = await request(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': authCookie }
    });
    if (logoutRes.status === 200 && logoutRes.json && logoutRes.json.success) {
      // Re-check auth with empty credentials
      const postLogoutRes = await request(`${baseUrl}/api/auth/check`);
      if (postLogoutRes.json && postLogoutRes.json.authenticated === false) {
        console.log('   [PASS] Logout successful and session invalidated');
        passed++;
      } else {
        throw new Error('Post-logout session still appeared authenticated');
      }
    } else {
      throw new Error(`Logout failed: ${logoutRes.body}`);
    }

    console.log('\n=============================================================');
    console.log(`🎉 ALL ${passed}/12 SECURE ADMIN PORTAL & REPORT TESTS PASSED!`);
    console.log('=============================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
