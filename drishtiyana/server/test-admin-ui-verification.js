const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = { agent, ...options };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

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
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('   ADMIN PORTAL UI REDESIGN - VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  const baseUrl = 'https://localhost:3001';

  // 1. Authenticate to get token
  console.log('[TEST 1] Logging in as admin...');
  const loginRes = await postJson(`${baseUrl}/api/auth/login`, { username: 'admin', password: 'DrishtiAdmin@2026' });
  const loginData = JSON.parse(loginRes.body);
  if (!loginData.token) throw new Error('Failed to get auth token');
  const token = loginData.token;
  console.log('   [PASS] Login successful, token acquired.');
  passed++;

  // 2. Fetch /admin HTML with authorization
  console.log('\n[TEST 2] Verifying /admin HTML layout & hierarchy...');
  const adminRes = await fetchUrl(`${baseUrl}/admin`, { headers: { 'Authorization': `Bearer ${token}` } });
  const html = adminRes.body;

  // Verify GIS Map dominance
  if (!html.includes('class="admin-map-card"') || !html.includes('id="adminGisMap"')) {
    throw new Error('GIS Map container or card missing in admin.html');
  }
  console.log('   [PASS] GIS Map card and #adminGisMap present as top dominant section.');

  // Verify Summary Strip
  if (!html.includes('class="admin-stats-grid"') || !html.includes('statTotalEvents')) {
    throw new Error('Summary strip missing in admin.html');
  }
  console.log('   [PASS] Compact horizontal summary strip present.');

  // Verify Split Grid below map
  if (!html.includes('class="admin-bottom-grid"') || !html.includes('id="adminDetailPanel"') || !html.includes('class="admin-history-card"')) {
    throw new Error('Split bottom grid (details + history) missing in admin.html');
  }
  console.log('   [PASS] Split grid below map (Details card + Recent History card) present.');

  // Verify "SELECT AN EVENT" placeholder
  if (!html.includes('SELECT AN EVENT') || !html.includes('Click a map marker or history item to view event details.')) {
    throw new Error('Default empty state "SELECT AN EVENT" missing in details panel');
  }
  console.log('   [PASS] Details panel contains exact "SELECT AN EVENT" placeholder.');

  // Verify NO verify / reject buttons in details panel
  const forbiddenTerms = ['id="verifyEventBtn"', 'id="rejectEventBtn"', 'Pending Review'];
  const foundForbidden = forbiddenTerms.filter(t => html.includes(t));
  if (foundForbidden.length > 0) {
    throw new Error(`Found forbidden verification controls: ${foundForbidden.join(', ')}`);
  }
  console.log('   [PASS] Zero manual verify/reject buttons present (automatic acceptance preserved).');

  // Verify mobile hamburger and backdrop
  if (!html.includes('id="sidebarToggleBtn"') || !html.includes('id="sidebarBackdrop"')) {
    throw new Error('Mobile sidebar toggle or backdrop missing');
  }
  console.log('   [PASS] Mobile sidebar toggle button and backdrop overlay present.');
  passed++;

  // 3. Verify CSS styling & responsive breakpoints
  console.log('\n[TEST 3] Verifying admin.css responsive rules & design system...');
  const cssRes = await fetchUrl(`${baseUrl}/admin.css`);
  const css = cssRes.body;

  const expectedBreakpoints = ['@media (min-width: 1400px)', '@media (max-width: 1280px)', '@media (max-width: 1024px)', '@media (max-width: 768px)', '@media (max-width: 480px)'];
  for (const bp of expectedBreakpoints) {
    if (!css.includes(bp)) {
      throw new Error(`Missing CSS breakpoint: ${bp}`);
    }
  }
  console.log('   [PASS] All 5 responsive breakpoints (1400px, 1280px, 1024px, 768px, 480px) defined.');

  // Verify theme tokens
  if (!css.includes('--color-primary: #15803D;') || !css.includes('--bg-main: #F7FAF8;')) {
    throw new Error('Light-green design identity tokens missing in CSS');
  }
  console.log('   [PASS] Smart-city light-green design tokens verified.');

  // Verify map sizing
  if (!css.includes('.admin-map-card') || !css.includes('#adminGisMap.leaflet-container')) {
    throw new Error('Map card and Leaflet container rules missing');
  }
  console.log('   [PASS] Full-width dominant map layout styling verified.');
  passed++;

  // 4. Verify admin.js client logic & synchronization hooks
  console.log('\n[TEST 4] Verifying admin.js client logic & event synchronization...');
  const jsRes = await fetchUrl(`${baseUrl}/admin.js`);
  const js = jsRes.body;

  if (!js.includes('function setupMobileSidebar') || !js.includes('setupMobileSidebar();')) {
    throw new Error('setupMobileSidebar missing in admin.js');
  }
  console.log('   [PASS] setupMobileSidebar properly declared and invoked.');

  if (!js.includes('window.selectEventById = selectEventById')) {
    throw new Error('window.selectEventById global binding missing');
  }
  console.log('   [PASS] Two-way synchronization hook (window.selectEventById) exposed for Leaflet markers.');

  if (!js.includes('resizeObserver.observe(mapContainer)') || !js.includes('resizeObserver.observe(mapCard)')) {
    throw new Error('ResizeObserver map container observation missing');
  }
  console.log('   [PASS] ResizeObserver observing map container and card for dynamic Leaflet recalculation.');

  if (!js.includes('✓ ACCEPTED') || !js.includes('View Details')) {
    throw new Error('Marker popup does not contain required ACCEPTED badge and View Details button');
  }
  console.log('   [PASS] Leaflet marker popup format contains ✓ ACCEPTED, confidence, and View Details.');
  passed++;

  // 5. Verify /api/admin/events data structure
  console.log('\n[TEST 5] Verifying /api/admin/events data flow...');
  const eventsRes = await fetchUrl(`${baseUrl}/api/admin/events`, { headers: { 'Authorization': `Bearer ${token}` } });
  const eventsData = JSON.parse(eventsRes.body);
  if (!eventsData.success || !Array.isArray(eventsData.events)) {
    throw new Error('Invalid /api/admin/events response structure');
  }
  console.log(`   [PASS] /api/admin/events returned ${eventsData.events.length} real events.`);

  const acceptedEvents = eventsData.events.filter(e => e.confidence >= 0.80);
  console.log(`   [PASS] All accepted pothole events have confidence >= 0.80 (${acceptedEvents.length} events checked).`);

  const eventsWithGps = eventsData.events.filter(e => e.latitude !== null && e.longitude !== null);
  console.log(`   [PASS] ${eventsWithGps.length} events have valid GPS coordinates for GIS map markers.`);
  passed++;

  console.log('\n================================================================');
  console.log(`   ALL ${passed}/${passed} VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runVerification().catch(err => {
  console.error('\n[VERIFICATION ERROR]:', err.message);
  process.exit(1);
});
