/**
 * Comprehensive verification script for:
 * DRISHTIYANA ADMIN - FIX EVENTS MAP + ALL CATEGORY MAPS
 */

const fs = require('fs');
const path = require('path');

const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
const adminCss = fs.readFileSync(path.join(__dirname, '../public/admin.css'), 'utf8');
const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin.js'), 'utf8');

let totalTests = 0;
let passedTests = 0;

function test(title, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${title}`);
  } else {
    console.error(`[FAIL] ${title} - ${details}`);
  }
}

console.log('======================================================');
console.log(' DRISHTIYANA ADMIN - GIS MAPS & CUSTOM PINS VERIFICATION');
console.log('======================================================\n');

// 1. Data Pipeline & Formula: REAL SUPABASE EVENTS + FRONTEND-ONLY DEMO EVENTS = MAP PRESENTATION DATA
test('getCombinedPresentationEvents helper function is implemented',
  adminJs.includes('function getCombinedPresentationEvents()')
);

test('Real events have priority and are deduped against demo events',
  adminJs.includes('const realIds = new Set(validRealEvents.map(e => e.event_id || e.id));') &&
  adminJs.includes('const demoList = DEMO_ALL_EVENTS.filter(d => !realIds.has(d.event_id || d.id));')
);

// 2. Demo events data set contains Road, Traffic, Safety (at least 6 each)
test('DEMO_ALL_EVENTS contains at least 6 Road detections',
  (adminJs.match(/id:\s*"demo-road-/g) || []).length >= 6
);

test('DEMO_ALL_EVENTS contains at least 6 Traffic detections',
  (adminJs.match(/id:\s*"demo-traffic-/g) || []).length >= 6
);

test('DEMO_ALL_EVENTS contains at least 6 Safety detections',
  (adminJs.match(/id:\s*"demo-safety-/g) || []).length >= 6
);

test('All demo detections have is_demo: true and coordinates',
  adminJs.includes('is_demo: true') &&
  adminJs.includes('latitude: 17.') &&
  adminJs.includes('longitude: 78.')
);

// 3. Custom Designed Pins (No emojis, no ugly default leaflet pins)
test('Custom teardrop GIS marker CSS implemented (.gis-marker-pin)',
  adminCss.includes('.gis-marker-pin') &&
  adminCss.includes('.gis-marker-container') &&
  adminCss.includes('border-radius: 50% 50% 50% 0;')
);

test('Category-specific pin styles for road, traffic, safety, critical',
  adminCss.includes('.gis-marker-pin.road') &&
  adminCss.includes('.gis-marker-pin.traffic') &&
  adminCss.includes('.gis-marker-pin.safety') &&
  adminCss.includes('.gis-marker-pin.critical')
);

test('createCategoryIcon uses custom SVG teardrop pins without emojis',
  adminJs.includes('function createCategoryIcon') &&
  adminJs.includes('gis-marker-container') &&
  adminJs.includes('gis-marker-pin') &&
  !adminJs.includes('pin-emoji')
);

// 4. Hover on Every Pin: Compact Tooltip Card (Small, clean, readable)
test('Compact tooltip CSS styles defined (.gis-compact-tooltip, .gis-hover-tooltip)',
  adminCss.includes('.leaflet-tooltip.gis-hover-tooltip') &&
  adminCss.includes('.gis-compact-tooltip') &&
  adminCss.includes('.gis-tt-title') &&
  adminCss.includes('.gis-tt-cat')
);

test('formatMarkerTooltip implements Road, Traffic vehicle grid, and Safety formats',
  adminJs.includes('function formatMarkerTooltip') &&
  adminJs.includes('gis-compact-tooltip') &&
  adminJs.includes('Confidence') &&
  adminJs.includes('gis-tt-grid-2x2') &&
  adminJs.includes('Public Safety')
);

test('Markers bind tooltip with compact hover configuration',
  adminJs.includes("className: 'gis-hover-tooltip'") &&
  adminJs.includes("direction: 'top'") &&
  adminJs.includes("offset: [0, -28]")
);

// 5. Click Pin -> Opens Existing Event Report Drawer
test('Marker click opens report drawer via selectEventById',
  adminJs.includes("selectEventById(evt.event_id || evt.id, true)")
);

test('selectEventById finds demo events in DEMO_EVENTS_MAP and displays drawer',
  adminJs.includes('if (!evt && DEMO_EVENTS_MAP.has(eventId))') &&
  adminJs.includes("adminDetailPanel.classList.add('drawer-open')")
);

// 6. Category Filtering before marker creation
test('applyDepartmentFiltersAndRender filters combined events before renderMapMarkers',
  adminJs.includes('function applyDepartmentFiltersAndRender()') &&
  adminJs.includes('const combined = getCombinedPresentationEvents();') &&
  adminJs.includes('applyDepartmentFiltersAndRender();')
);

test('eventsSubFilterGroup contains ALL, ROADS, TRAFFIC, SAFETY tabs',
  adminHtml.includes('id="eventsSubFilterGroup"') &&
  adminHtml.includes('data-subcat="all"') &&
  adminHtml.includes('data-subcat="road"') &&
  adminHtml.includes('data-subcat="traffic"') &&
  adminHtml.includes('data-subcat="safety"')
);

// 7. Category Pages (Road, Traffic, Safety, All Events)
const normalizedJs = adminJs.replace(/\r\n/g, '\n');
test('getFilteredRoadEvents uses combined presentation events',
  normalizedJs.includes('function getFilteredRoadEvents() {\n  return getCombinedPresentationEvents().filter(isRoadEvent);\n}')
);

test('renderRoadDefectHeatmap renders custom road pins to window.roadMapMarkersLayer',
  adminJs.includes('window.roadMapMarkersLayer = L.layerGroup().addTo(roadMap);') &&
  adminJs.includes('formatMarkerTooltip(evt)')
);

test('renderTrafficView renders custom traffic pins to window.trafficMapMarkersLayer',
  adminJs.includes('window.trafficMapMarkersLayer = L.layerGroup().addTo(trafficViewMap);') &&
  adminJs.includes('getCombinedPresentationEvents().filter(isTrafficEvent)')
);

test('getFilteredSafetyEvents uses combined presentation events',
  normalizedJs.includes('function getFilteredSafetyEvents() {\n  return getCombinedPresentationEvents().filter(isSafetyEvent);\n}')
);

test('renderSafetyHeatmap renders custom safety pins to window.safetyMapMarkersLayer',
  adminJs.includes('window.safetyMapMarkersLayer = L.layerGroup().addTo(safetyMap);')
);

// 8. Events list & DEMO badge
test('renderAllEventsView uses combined presentation events',
  adminJs.includes('function renderAllEventsView()') &&
  adminJs.includes('const combined = getCombinedPresentationEvents();')
);

test('DEMO badge appears on static records and NOT on real records',
  adminCss.includes('.badge-demo') &&
  adminJs.includes("const demoBadge = evt.is_demo ? ' <span class=\"badge-demo\">DEMO</span>' : '';")
);

// 9. Non-empty maps & auto-fit bounds
test('fitMapToMarkers, fitRoadMapBounds, fitTrafficViewMapBounds, fitSafetyMapBounds defined',
  adminJs.includes('function fitMapToMarkers()') &&
  adminJs.includes('function fitRoadMapBounds()') &&
  adminJs.includes('function fitTrafficViewMapBounds()') &&
  adminJs.includes('function fitSafetyMapBounds()')
);

// 10. Demo data isolation from database
test('Demo records isolated from Supabase and Redis persistence APIs',
  !adminJs.includes("POST', body: JSON.stringify(demo") &&
  adminJs.includes('is_demo: true')
);

console.log('\n======================================================');
console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED!`);
console.log('======================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
