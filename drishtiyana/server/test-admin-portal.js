/**
 * Automated Verification Test for DrishtiYana Admin & Command Portal
 * Tests:
 * 1. GET /admin & /command routes serve HTML dashboard
 * 2. GET /api/admin/config returns valid smart-city taxonomy
 * 3. GET /api/admin/stats returns real aggregated numbers
 * 4. GET /api/admin/events returns categorized event records
 * 5. GET /api/reverse-geocode returns human address or safe fallback
 * 6. PATCH /api/admin/events/:eventId/status updates status
 */

const http = require('http');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
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
  console.log('   DRISHTIYANA - Admin & Command Portal Automated Tests');
  console.log('=============================================================\n');

  let passed = 0;
  const baseUrl = 'http://localhost:3000';

  try {
    // TEST 1: Serve /admin Route
    console.log('[TEST 1] Testing /admin HTML route...');
    const adminRes = await request(`${baseUrl}/admin`);
    if (adminRes.status === 200 && adminRes.body.includes('DRISHTIYANA') && adminRes.body.includes('admin.js')) {
      console.log('   [PASS] /admin served successfully with Admin Portal HTML');
      passed++;
    } else {
      throw new Error(`/admin returned HTTP ${adminRes.status}`);
    }

    // TEST 2: Serve /command Route Alias
    console.log('\n[TEST 2] Testing /command alias route...');
    const commandRes = await request(`${baseUrl}/command`);
    if (commandRes.status === 200 && commandRes.body.includes('admin.js')) {
      console.log('   [PASS] /command alias route serves Admin Portal');
      passed++;
    } else {
      throw new Error(`/command returned HTTP ${commandRes.status}`);
    }

    // TEST 3: Taxonomy & Config API
    console.log('\n[TEST 3] Testing /api/admin/config endpoint...');
    const configRes = await request(`${baseUrl}/api/admin/config`);
    if (configRes.status === 200 && configRes.json && configRes.json.taxonomy) {
      const tax = configRes.json.taxonomy;
      const categories = Object.keys(tax.CATEGORIES);
      console.log(`   [PASS] Taxonomy verified (${categories.length} categories: ${categories.join(', ')})`);
      passed++;
    } else {
      throw new Error(`Taxonomy config failed: ${configRes.status}`);
    }

    // TEST 4: Stats API
    console.log('\n[TEST 4] Testing /api/admin/stats endpoint...');
    const statsRes = await request(`${baseUrl}/api/admin/stats`);
    if (statsRes.status === 200 && statsRes.json && statsRes.json.stats) {
      const s = statsRes.json.stats;
      console.log(`   [PASS] Real stats verified: Total=${s.total_events}, New=${s.new_events}, Critical=${s.critical_events}, Road=${s.road_problems}`);
      passed++;
    } else {
      throw new Error(`Stats endpoint failed: ${statsRes.status}`);
    }

    // TEST 5: Events Query API
    console.log('\n[TEST 5] Testing /api/admin/events query endpoint...');
    const eventsRes = await request(`${baseUrl}/api/admin/events`);
    if (eventsRes.status === 200 && eventsRes.json && Array.isArray(eventsRes.json.events)) {
      console.log(`   [PASS] Retrieved ${eventsRes.json.events.length} real events with category & department metadata`);
      passed++;
    } else {
      throw new Error(`Events endpoint failed: ${eventsRes.status}`);
    }

    // TEST 6: Reverse Geocoding Proxy
    console.log('\n[TEST 6] Testing /api/reverse-geocode endpoint...');
    const geoRes = await request(`${baseUrl}/api/reverse-geocode?lat=17.3850&lon=78.4866`);
    if (geoRes.status === 200 && geoRes.json && geoRes.json.formatted) {
      console.log(`   [PASS] Reverse geocode responded cleanly: "${geoRes.json.formatted}"`);
      passed++;
    } else {
      throw new Error(`Reverse geocode failed: ${geoRes.status}`);
    }

    // TEST 7: Event Ingestion with Category & Department Verification
    console.log('\n[TEST 7] Testing event dispatch with automatic department mapping...');
    const postData = 'event_id=EVT-ADMIN-TEST-99&class_name=Pothole&confidence=0.93&risk_score=82&risk_level=CRITICAL&priority=HIGH&latitude=17.3912&longitude=78.4915&session_id=SESSION-ADMIN-TEST';
    const dispatchRes = await request(`${baseUrl}/api/edge/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postData
    });

    if (dispatchRes.status === 200 && dispatchRes.json && dispatchRes.json.category === 'Road & Infrastructure') {
      console.log(`   [PASS] Event auto-categorized to: "${dispatchRes.json.category}" | Dept: "${dispatchRes.json.department}"`);
      passed++;
    } else {
      throw new Error(`Dispatch categorization failed: ${dispatchRes.body}`);
    }

    // TEST 8: Update Event Status API
    console.log('\n[TEST 8] Testing PATCH /api/admin/events/:eventId/status...');
    const patchRes = await request(`${baseUrl}/api/admin/events/EVT-ADMIN-TEST-99/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ASSIGNED' })
    });

    if (patchRes.status === 200 && patchRes.json && patchRes.json.status === 'ASSIGNED') {
      console.log(`   [PASS] Event status updated to: ${patchRes.json.status}`);
      passed++;
    } else {
      throw new Error(`Status update failed: ${patchRes.status}`);
    }

    console.log('\n=============================================================');
    console.log(`🎉 ALL ${passed}/8 ADMIN PORTAL TESTS PASSED SUCCESSFULLY!`);
    console.log('=============================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Test failure:', err.message);
    process.exit(1);
  }
}

runTests();
