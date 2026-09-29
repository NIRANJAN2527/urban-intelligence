/**
 * DRISHTIYANA - End-to-End Test Suite for Vehicle Detection, Persistence,
 * Density Aggregation, and Admin Map Switching (Tests 6 - 11)
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const supabase = require('./supabase');

async function runTests() {
  console.log('\n======================================================');
  console.log('   DRISHTIYANA - VEHICLE DENSITY & MAP E2E TEST SUITE  ');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function report(name, condition, extra = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${totalTests}: ${name} ${extra}`);
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${name} ${extra}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 6: Persistence of Vehicle Observations (Supabase & Disk Fallback)
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Vehicle Observations Persistence ---');
  const testObs1 = {
    observation_id: `VOBS-TEST-${Date.now()}-001`,
    session_id: 'SESSION-BUS-101',
    bus_id: 'BUS-101',
    camera_id: 'CAM-01',
    timestamp: new Date().toISOString(),
    latitude: 17.385044,
    longitude: 78.486671,
    car_count: 18,
    motorcycle_count: 7,
    bus_count: 2,
    truck_count: 3,
    total_vehicles: 30,
    source_type: 'LIVE'
  };

  const testObs2 = {
    observation_id: `VOBS-TEST-${Date.now()}-002`,
    session_id: 'SESSION-BUS-102',
    bus_id: 'BUS-102',
    camera_id: 'CAM-01',
    timestamp: new Date().toISOString(),
    latitude: 17.385100, // Same geographic cell (~100m)
    longitude: 78.486700,
    car_count: 20,
    motorcycle_count: 9,
    bus_count: 1,
    truck_count: 4,
    total_vehicles: 34,
    source_type: 'LIVE'
  };

  // Location B: Lower density region
  const testObsB = {
    observation_id: `VOBS-TEST-${Date.now()}-003`,
    session_id: 'SESSION-BUS-101',
    bus_id: 'BUS-101',
    camera_id: 'CAM-01',
    timestamp: new Date().toISOString(),
    latitude: 17.410000, // Different geographic cell
    longitude: 78.500000,
    car_count: 5,
    motorcycle_count: 2,
    bus_count: 1,
    truck_count: 0,
    total_vehicles: 8,
    source_type: 'LIVE'
  };

  const res1 = await supabase.insertVehicleObservation(testObs1);
  report('Insert vehicle observation 1', res1.success && res1.observation.total_vehicles === 30, `(${res1.source})`);

  const res2 = await supabase.insertVehicleObservation(testObs2);
  report('Insert vehicle observation 2', res2.success && res2.observation.total_vehicles === 34, `(${res2.source})`);

  const resB = await supabase.insertVehicleObservation(testObsB);
  report('Insert vehicle observation B (Cell B)', resB.success && resB.observation.total_vehicles === 8, `(${resB.source})`);

  // Verify retrieval
  const observations = await supabase.getVehicleObservations({ timeWindowMinutes: 60 });
  const foundObs1 = observations.find(o => o.observation_id === testObs1.observation_id);
  report('Retrieve persisted observation from database/outbox', foundObs1 && foundObs1.total_vehicles === 30);

  // --------------------------------------------------------------------------
  // TEST 7 & 8 & 9: Spatial Grid Aggregation & Real Density Heatmap Calculation
  // --------------------------------------------------------------------------
  console.log('\n--- Real Density Heatmap Calculation & Aggregation ---');
  const densityAll = await supabase.getTrafficDensityGrid('all', 60);

  report('Density grid returns valid points array', Array.isArray(densityAll.points) && densityAll.points.length > 0);
  report('Density grid total vehicles matches sum of real observations', densityAll.totalVehicles >= 72);
  report('Density breakdown has cars, motorcycles, buses, trucks',
    densityAll.breakdown.cars >= 43 &&
    densityAll.breakdown.motorcycles >= 18 &&
    densityAll.breakdown.buses >= 4 &&
    densityAll.breakdown.trucks >= 7
  );

  // Verify Real Intensity Math: Cell A (64 vehicles) has greater intensity than Cell B (8 vehicles)
  const cellA = densityAll.cells.find(c => Math.abs(c.latitude - 17.385) < 0.005);
  const cellB = densityAll.cells.find(c => Math.abs(c.latitude - 17.410) < 0.005);
  report('Cell A (high traffic) and Cell B (low traffic) both aggregated into geographic bins', !!(cellA && cellB));
  if (cellA && cellB) {
    report('Cell A count > Cell B count (real traffic density)', cellA.count > cellB.count, `(${cellA.count} vs ${cellB.count})`);

    const pointA = densityAll.points.find(p => Math.abs(p[0] - cellA.latitude) < 0.0001 && Math.abs(p[1] - cellA.longitude) < 0.0001);
    const pointB = densityAll.points.find(p => Math.abs(p[0] - cellB.latitude) < 0.0001 && Math.abs(p[1] - cellB.longitude) < 0.0001);
    report('Heatmap intensity point A > point B (real normalized intensity, no random fake values)',
      pointA && pointB && pointA[2] > pointB[2], `(Intensity: ${pointA?.[2]} vs ${pointB?.[2]})`);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Vehicle Type Filtering
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Vehicle Type Filtering ---');
  const densityCarsOnly = await supabase.getTrafficDensityGrid('car', 60);
  const densityBusesOnly = await supabase.getTrafficDensityGrid('bus', 60);
  const densityTrucksOnly = await supabase.getTrafficDensityGrid('truck', 60);
  const densityMotorcyclesOnly = await supabase.getTrafficDensityGrid('motorcycle', 60);

  report('Car-only filter aggregates only car observations',
    densityCarsOnly.cells.every(c => c.count === c.cars),
    `Car points: ${densityCarsOnly.points.length}`
  );
  report('Bus-only filter aggregates only bus observations',
    densityBusesOnly.cells.every(c => c.count === c.buses),
    `Bus points: ${densityBusesOnly.points.length}`
  );
  report('Truck-only filter aggregates only truck observations',
    densityTrucksOnly.cells.every(c => c.count === c.trucks),
    `Truck points: ${densityTrucksOnly.points.length}`
  );
  report('Motorcycle-only filter aggregates only motorcycle observations',
    densityMotorcyclesOnly.cells.every(c => c.count === c.motorcycles),
    `Motorcycle points: ${densityMotorcyclesOnly.points.length}`
  );

  // --------------------------------------------------------------------------
  // TEST 11: Empty State Handling
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Empty State Verification ---');
  // Query with 1 millisecond window in past -> 0 observations
  const emptyDensity = await supabase.getTrafficDensityGrid('all', 0.00001);
  report('Empty period returns 0 points (no fake/random points generated)', emptyDensity.points.length === 0);
  report('Empty period returns clean empty breakdown', emptyDensity.totalVehicles === 0);

  // --------------------------------------------------------------------------
  // TEST 7, 8, 9: Frontend Map Mode Switcher & DOM Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TESTS 7-9: Admin Map Architecture & Mode Switcher Inspection ---');
  const adminHtmlPath = path.join(__dirname, '..', 'public', 'admin.html');
  const adminJsPath = path.join(__dirname, '..', 'public', 'admin.js');
  const adminCssPath = path.join(__dirname, '..', 'public', 'admin.css');

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  const adminCss = fs.readFileSync(adminCssPath, 'utf8');

  // Verify ONE unified map area
  const mapCanvasMatches = adminHtml.match(/id="adminGisMap"/g) || [];
  report('Admin contains exactly ONE GIS map container (#adminGisMap)', mapCanvasMatches.length === 1);

  // Verify Segmented Toggle controls
  report('Admin HTML contains segmented mode toggle buttons',
    adminHtml.includes('id="btnModeEvents"') && adminHtml.includes('id="btnModeDensity"')
  );

  // Verify Traffic Density toolbar and filters
  report('Admin HTML contains traffic density toolbar with vehicle & time filters',
    adminHtml.includes('id="trafficDensityToolbar"') &&
    adminHtml.includes('id="densityVehicleFilter"') &&
    adminHtml.includes('id="densityTimeFilter"')
  );

  // Verify Compact Metrics
  report('Admin HTML contains compact summary metrics for vehicles',
    adminHtml.includes('id="densityValTotal"') &&
    adminHtml.includes('id="densityValCars"') &&
    adminHtml.includes('id="densityValMotorcycles"') &&
    adminHtml.includes('id="densityValBuses"') &&
    adminHtml.includes('id="densityValTrucks"')
  );

  // Verify Clean Empty State
  report('Admin HTML contains dedicated density empty state message',
    adminHtml.includes('id="densityEmptyState"') &&
    adminHtml.includes('No vehicle density data available for this period.')
  );

  // Verify admin.js mode switcher logic
  report('admin.js implements switchMapMode with full layer segregation',
    adminJs.includes("function switchMapMode") &&
    adminJs.includes("currentMapMode === 'EVENTS'") &&
    adminJs.includes("currentMapMode === 'DENSITY'")
  );

  // Verify event markers are hidden in density mode
  report('admin.js removes event markers when entering DENSITY mode',
    adminJs.includes("leafletMap.removeLayer(marker)")
  );

  // Verify heatLayer is removed when entering EVENTS mode
  report('admin.js removes heatLayer when entering EVENTS mode',
    adminJs.includes("leafletMap.removeLayer(trafficHeatLayer)")
  );

  // Verify CSS expansion
  report('admin.css contains .density-mode-active full-width map expansion',
    adminCss.includes("#view-overview.density-mode-active")
  );

  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED!`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[Test Execution Error]:', err);
  process.exit(1);
});
