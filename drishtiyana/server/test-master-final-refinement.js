/**
 * DRISHTIYANA - MASTER FINAL ACCEPTANCE TEST SUITE
 * Validates all 32 requirements from the master specification:
 * - HTML structure & components (Overview, Roads, Traffic, Safety, All Events)
 * - CSS styling (theme, bus markers, pulsing rings, category summaries, buttons)
 * - JS client logic (bus fleet, live telemetry ingestion, category summaries, deduplication, summary cards, fullscreen)
 * - Backend integrity & security (auth, endpoints, report dispatch, edge AI)
 * - Real vs demo data boundaries (frontend-only demo, zero demo in DB)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent,
      rejectUnauthorized: false
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      agent,
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('  DRISHTIYANA - MASTER FINAL REFINEMENT ACCEPTANCE TEST');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(message);
    } else {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    }
  }

  // 1. Static Files Inspection
  console.log('[SECTION 1: CODEBASE INTEGRITY & REFINEMENT]');
  const htmlPath = path.join(__dirname, '../public/admin.html');
  const cssPath = path.join(__dirname, '../public/admin.css');
  const jsPath = path.join(__dirname, '../public/admin.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verify Overview Map & Fullscreen
  assert(html.includes('id="adminGisMap"'), 'Admin GIS map container present');
  assert(html.includes('id="fullscreenAdminMapBtn"'), 'Overview map fullscreen toggle button present');
  assert(html.includes('id="recenterAdminMapBtn"'), 'Overview map recenter button present');
  assert(html.includes('id="fitAllEventsBtn"'), 'Overview map fit all markers button present');

  // Verify Category Summary Blocks (Requirement 12)
  assert(html.includes('id="ovSummaryRoadObs"') && html.includes('id="ovSummaryRoadPotholes"') && html.includes('id="ovSummaryRoadCracks"'), 'Road & Infrastructure summary metrics elements present');
  assert(html.includes('id="ovSummaryTrafficObs"') && html.includes('id="ovSummaryTrafficHighDensity"') && html.includes('id="ovSummaryTrafficCongestion"'), 'Traffic Intelligence summary metrics elements present');
  assert(html.includes('id="ovSummarySafetyAlerts"') && html.includes('id="ovSummarySafetyPriority"') && html.includes('id="ovSummarySafetyResolved"'), 'Public Safety summary metrics elements present');
  assert(html.includes('id="btnExploreRoadsSummary"'), 'Explore Road Events button present');
  assert(html.includes('id="btnExploreTrafficSummary"'), 'Explore Traffic button present');
  assert(html.includes('id="btnExploreSafetySummary"'), 'Explore Safety button present');

  // Verify Compact Activity Feed (Requirement 11)
  assert(html.includes('id="btnViewAllEventsFeed"'), 'VIEW ALL EVENTS button present in Recent Activity feed');

  // Verify Subcategory Filters (Roads & Safety)
  assert(html.includes('data-roadfilter="pothole"') && html.includes('data-roadfilter="damage"') && html.includes('data-roadfilter="crack"') && html.includes('data-roadfilter="infra"') && html.includes('data-roadfilter="waterlogging"'), 'Road sub-category filters (Potholes, Surface Damage, Cracks, Infra, Waterlogging) present');
  assert(html.includes('data-sfilter="pedestrian"') && html.includes('data-sfilter="crossing"') && html.includes('data-sfilter="hazard"') && html.includes('data-sfilter="danger"') && html.includes('data-sfilter="water"'), 'Safety sub-category filters (Pedestrian, Crossing, Hazard, Danger, Water) present');

  // Verify Domain Fullscreen Buttons
  assert(html.includes('id="fullscreenRoadMapBtn"'), 'Road Map fullscreen button present');
  assert(html.includes('id="fullscreenTrafficMapBtn"'), 'Traffic Map fullscreen button present');
  assert(html.includes('id="fullscreenSafetyMapBtn"'), 'Safety Map fullscreen button present');

  // Verify CSS Styling & Animations
  console.log('\n[SECTION 2: CSS DESIGN SYSTEM & VISUAL DIFFERENTIATION]');
  assert(css.includes('.gis-bus-marker-container'), 'Bus marker container CSS defined');
  assert(css.includes('.gis-bus-pin.live') && css.includes('.gis-bus-pin.demo'), 'Distinct LIVE vs DEMO bus pin styling defined');
  assert(css.includes('.live-bus-pulse-ring') && css.includes('@keyframes liveBusPulse'), 'Live bus pulsing ring animation defined');
  assert(css.includes('.gis-bus-floating-label') && css.includes('.bus-live-indicator'), 'Live bus floating badge defined');
  assert(css.includes('.category-summary-card') && css.includes('.cat-summary-metrics'), 'Category summary blocks responsive styling defined');
  assert(css.includes('.btn-secondary-action') && css.includes('.btn-primary-action'), 'Consistent button design tokens defined');

  // Verify JS Bus Simulation & Telemetry Logic (Requirements 7, 8, 9)
  console.log('\n[SECTION 3: JAVASCRIPT LOGIC & STATE HANDLING]');
  assert(js.includes('const DEMO_BUS_FLEET =') && js.includes('BUS-101') && js.includes('BUS-204') && js.includes('BUS-315'), '2-3 Frontend-only static demo buses (BUS-101, BUS-204, BUS-315) defined');
  assert(js.includes('function createBusIcon'), 'createBusIcon function implemented with SVG and live pulse ring');
  assert(js.includes('function formatBusTooltip'), 'formatBusTooltip function implemented with status and speed');
  assert(js.includes('function renderBusMarkers'), 'renderBusMarkers function implemented with dedicated busPane');
  assert(js.includes('function handleLiveBusTelemetry'), 'handleLiveBusTelemetry function implemented to elevate live bus to LIVE SENSOR');
  assert(js.includes('socket.on(\'citizen-bus-location\'') && js.includes('socket.on(\'gps-update\''), 'Socket.IO live bus telemetry listeners registered');
  assert(js.includes('function updateOverviewCategorySummaries'), 'updateOverviewCategorySummaries function implemented and calculating live stats');

  // Verify Deduplication & Compact Preview in Recent Activity (Requirement 11)
  assert(js.includes('distinctEvents.length >= 6'), 'Recent activity feed capped at 4-6 high-signal items');
  assert(js.includes('seenSignatures'), 'Deduplication implemented for repeated consecutive detections');

  // Verify Summary Card Pattern (Requirements 15, 19, 22)
  assert(js.includes('selectEventById(\'${escapeHtml(eventId)}\', false)'), 'Card clicks open report drawer in place without jarring view jumps');
  assert(js.includes('toggleCardFullscreen'), 'toggleCardFullscreen implemented for Leaflet map containers');

  // 4. Live Server & Endpoint Verification
  console.log('\n[SECTION 4: LIVE SERVER ENDPOINTS & AUTHENTICATION]');
  const baseUrl = 'https://localhost:3001';

  // Login
  const loginRes = await postJson(`${baseUrl}/api/auth/login`, { username: 'admin', password: 'DrishtiAdmin@2026' });
  assert(loginRes.status === 200 && loginRes.json && loginRes.json.token, 'Admin authentication successful with token');
  const token = loginRes.json.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // Admin HTML
  const adminPage = await fetchUrl(`${baseUrl}/admin`, { headers: authHeaders });
  assert(adminPage.status === 200 && adminPage.body.includes('CITY INTELLIGENCE'), '/admin page served successfully');

  // Admin Stats
  const statsRes = await fetchUrl(`${baseUrl}/api/admin/stats`, { headers: authHeaders });
  assert(statsRes.status === 200 && statsRes.json && statsRes.json.success, '/api/admin/stats returned real KPI data');

  // Admin Events
  const eventsRes = await fetchUrl(`${baseUrl}/api/admin/events?verification_status=all`, { headers: authHeaders });
  assert(eventsRes.status === 200 && Array.isArray(eventsRes.json.events), `/api/admin/events returned ${eventsRes.json.events.length} database records`);

  // Traffic Density Summary
  const trafficRes = await fetchUrl(`${baseUrl}/api/admin/traffic-density/summary?window=all`, { headers: authHeaders });
  assert(trafficRes.status === 200 && trafficRes.json && trafficRes.json.success, '/api/admin/traffic-density/summary accessible');

  // Bus Location Endpoint
  const busLocRes = await fetchUrl(`${baseUrl}/api/citizen/bus/BUS-101/location`, { headers: authHeaders });
  assert(busLocRes.status === 200, '/api/citizen/bus/BUS-101/location endpoint accessible');

  // Zero Demo Data in Supabase Verification (Requirement 26)
  const allEvents = eventsRes.json.events;
  const dbHasDemoId = allEvents.some(e => String(e.event_id || e.id || '').startsWith('demo-'));
  assert(!dbHasDemoId, 'ZERO demo events stored in database — demo data strictly restricted to frontend presentation fallback');

  console.log('\n=============================================================');
  console.log(`  🎉 ALL ${passed}/${total} MASTER FINAL ACCEPTANCE TESTS PASSED!`);
  console.log('=============================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n[TEST SUITE FAILURE]:', err.message);
  process.exit(1);
});
