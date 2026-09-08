const fs = require('fs');
const path = require('path');

// Test nearest-neighbor correlation algorithm (matching viewer.js implementation)
function getGpsForVideoTimestamp(targetTimestampMs, gpsRecords) {
  if (!gpsRecords || gpsRecords.length === 0) return null;
  if (gpsRecords.length === 1) {
    const recTime = new Date(gpsRecords[0].gps_timestamp).getTime();
    return { record: gpsRecords[0], deltaMs: Math.abs(recTime - targetTimestampMs) };
  }

  let low = 0;
  let high = gpsRecords.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midTime = new Date(gpsRecords[mid].gps_timestamp).getTime();
    if (midTime === targetTimestampMs) {
      return { record: gpsRecords[mid], deltaMs: 0 };
    }
    if (midTime < targetTimestampMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const candA = gpsRecords[Math.max(0, high)];
  const candB = gpsRecords[Math.min(gpsRecords.length - 1, low)];
  const diffA = Math.abs(new Date(candA.gps_timestamp).getTime() - targetTimestampMs);
  const diffB = Math.abs(new Date(candB.gps_timestamp).getTime() - targetTimestampMs);

  if (diffA <= diffB) {
    return { record: candA, deltaMs: diffA };
  } else {
    return { record: candB, deltaMs: diffB };
  }
}

async function runUploadPipelineTest() {
  console.log('\n======================================================');
  console.log('   DRISHTIYANA - File Upload & Correlation Test Suite');
  console.log('======================================================');

  const BASE_URL = 'http://localhost:3000';

  // 1. Unit Test: Nearest-Neighbor Timestamp Correlation Algorithm
  console.log('\n[Test 1] Testing Nearest-Neighbor Correlation Algorithm...');
  const mockGpsDataset = [
    { gps_timestamp: '2026-09-08T10:30:00.000Z', latitude: 17.385000, longitude: 78.486000 },
    { gps_timestamp: '2026-09-08T10:30:01.000Z', latitude: 17.385100, longitude: 78.486100 },
    { gps_timestamp: '2026-09-08T10:30:02.000Z', latitude: 17.385200, longitude: 78.486200 },
    { gps_timestamp: '2026-09-08T10:30:05.000Z', latitude: 17.385500, longitude: 78.486500 }
  ];

  // Exact match
  const match1 = getGpsForVideoTimestamp(new Date('2026-09-08T10:30:01.000Z').getTime(), mockGpsDataset);
  console.log('   Exact match (10:30:01.000): delta =', match1.deltaMs, 'ms, lat =', match1.record.latitude);
  if (match1.deltaMs !== 0 || match1.record.latitude !== 17.385100) {
    throw new Error('Exact timestamp match failed');
  }

  // Intermediate match (e.g. 10:30:01.400Z -> should match 10:30:01.000Z with delta 400ms)
  const match2 = getGpsForVideoTimestamp(new Date('2026-09-08T10:30:01.400Z').getTime(), mockGpsDataset);
  console.log('   Interpolated match (10:30:01.400): delta =', match2.deltaMs, 'ms, lat =', match2.record.latitude);
  if (match2.deltaMs !== 400 || match2.record.latitude !== 17.385100) {
    throw new Error('Nearest-neighbor interpolation match failed');
  }

  // Intermediate match (e.g. 10:30:01.800Z -> should match 10:30:02.000Z with delta 200ms)
  const match3 = getGpsForVideoTimestamp(new Date('2026-09-08T10:30:01.800Z').getTime(), mockGpsDataset);
  console.log('   Interpolated match (10:30:01.800): delta =', match3.deltaMs, 'ms, lat =', match3.record.latitude);
  if (match3.deltaMs !== 200 || match3.record.latitude !== 17.385200) {
    throw new Error('Nearest-neighbor upper bound match failed');
  }
  console.log('✅ Correlation algorithm unit tests passed!');

  // 2. Prepare Sample Files for API Tests
  const sampleJsonPath = path.join(__dirname, '../sample_data/pothole_test_01.json');
  const sampleCsvPath = path.join(__dirname, '../sample_data/pothole_test_01.csv');

  // Use real sample video if present, or create a lightweight mock MP4 file
  const realVideoPath = path.join(__dirname, 'uploads', 'ruralRoad_potHoles-1788881907973.mp4');
  let mockVideoPath = realVideoPath;
  if (!fs.existsSync(realVideoPath)) {
    mockVideoPath = path.join(__dirname, 'mock_road_test.mp4');
    fs.writeFileSync(mockVideoPath, Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]));
  }

  // 3. Test POST /api/upload-session with JSON GPS
  console.log('\n[Test 2] Testing POST /api/upload-session with JSON GPS...');
  const formDataJson = new FormData();
  formDataJson.append('video', new Blob([fs.readFileSync(mockVideoPath)], { type: 'video/mp4' }), 'mock_road_test.mp4');
  formDataJson.append('gps', new Blob([fs.readFileSync(sampleJsonPath)], { type: 'application/json' }), 'pothole_test_01.json');
  formDataJson.append('bus_id', 'BUS-101');

  const resJson = await fetch(`${BASE_URL}/api/upload-session`, {
    method: 'POST',
    body: formDataJson
  });
  const jsonBody = await resJson.json();
  console.log('   Upload JSON Response:', resJson.status, jsonBody.session_id, `(${jsonBody.gps_records_count} GPS points)`);

  if (resJson.status !== 200 || !jsonBody.session_id || jsonBody.gps_records_count !== 13) {
    throw new Error(`JSON upload session failed: ${JSON.stringify(jsonBody)}`);
  }
  console.log('✅ JSON file upload test passed!');

  // 4. Test POST /api/upload-session with CSV GPS
  console.log('\n[Test 3] Testing POST /api/upload-session with CSV GPS...');
  const formDataCsv = new FormData();
  formDataCsv.append('video', new Blob([fs.readFileSync(mockVideoPath)], { type: 'video/mp4' }), 'mock_road_test.mp4');
  formDataCsv.append('gps', new Blob([fs.readFileSync(sampleCsvPath)], { type: 'text/csv' }), 'pothole_test_01.csv');
  formDataCsv.append('bus_id', 'BUS-102');

  const resCsv = await fetch(`${BASE_URL}/api/upload-session`, {
    method: 'POST',
    body: formDataCsv
  });
  const csvBody = await resCsv.json();
  console.log('   Upload CSV Response:', resCsv.status, csvBody.session_id, `(${csvBody.gps_records_count} GPS points)`);

  if (resCsv.status !== 200 || !csvBody.session_id || csvBody.gps_records_count !== 13) {
    throw new Error(`CSV upload session failed: ${JSON.stringify(csvBody)}`);
  }
  console.log('✅ CSV file upload test passed!');

  // 5. Test Invalid Format Rejection
  console.log('\n[Test 4] Testing Invalid Format Validation Rejection...');
  const formDataBad = new FormData();
  formDataBad.append('video', new Blob(['fake video'], { type: 'text/plain' }), 'malicious.exe');
  formDataBad.append('gps', new Blob([fs.readFileSync(sampleJsonPath)], { type: 'application/json' }), 'pothole_test_01.json');

  const resBad = await fetch(`${BASE_URL}/api/upload-session`, {
    method: 'POST',
    body: formDataBad
  });
  console.log('   Invalid Format Response:', resBad.status);
  if (resBad.status !== 400) {
    throw new Error('Failed to reject invalid video extension');
  }
  console.log('✅ Invalid format rejection test passed!');

  // 6. Test POST /api/process-session/:sessionId
  console.log('\n[Test 5] Testing POST /api/process-session/:sessionId...');
  const resProcess = await fetch(`${BASE_URL}/api/process-session/${jsonBody.session_id}`, {
    method: 'POST'
  });
  const processBody = await resProcess.json();
  console.log('   Process API Response:', resProcess.status, processBody.status || processBody);
  if (resProcess.status !== 200 || (processBody.status !== 'PROCESSING_COMPLETE' && processBody.status !== 'PROCESSING_READY' && processBody.status !== 'PROCESSING_STARTED')) {
    throw new Error(`Process session API failed: ${JSON.stringify(processBody)}`);
  }
  console.log('✅ AI Processing API test passed!');

  // Cleanup temporary mock video if created
  if (mockVideoPath !== realVideoPath && fs.existsSync(mockVideoPath)) {
    fs.unlinkSync(mockVideoPath);
  }

  console.log('\n======================================================');
  console.log('       MODE 2 UPLOAD & CORRELATION VERIFICATION        ');
  console.log('======================================================');
  console.log('Correlation Algorithm:       PASS');
  console.log('JSON File Upload & Parse:    PASS');
  console.log('CSV File Upload & Parse:     PASS');
  console.log('Invalid Format Rejection:    PASS');
  console.log('AI Pipeline Standby API:     PASS');
  console.log('======================================================\n');
  console.log('🎉 ALL MODE 2 TESTS PASSED SUCCESSFULLY!');
  process.exitCode = 0;
}

runUploadPipelineTest().catch(err => {
  console.error('Test pipeline error:', err);
  process.exit(1);
});
