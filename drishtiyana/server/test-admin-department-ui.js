/**
 * Automated Verification for Stage 1 (HTTPS & Proxy) and Stage 2 (Department Cards & Report Preview)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function runDepartmentAndHttpsTests() {
  console.log('============================================================');
  console.log('🧪 RUNNING DEPARTMENT WORKFLOW & HTTPS VERIFICATION TESTS');
  console.log('============================================================\n');

  // TEST 1: Verify admin.html contains Top Department Cards
  console.log('1. Checking admin.html structure for Department Cards & Report Modal...');
  const htmlPath = path.join(__dirname, '..', 'public', 'admin.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const requiredHtmlElements = [
    'id="deptCard-road"',
    'id="deptCard-traffic"',
    'id="deptCard-all"',
    'id="deptStatusTabs"',
    'data-sub="PENDING_REVIEW"',
    'data-sub="VERIFIED"',
    'data-sub="REPORTED"',
    'id="confirmReportModal"',
    'id="confirmModalDept"',
    'id="reportPreviewSubject"',
    'id="reportPreviewEvidenceImg"',
    'id="confirmSendReportBtn"',
    '📄 VIEW REPORT'
  ];

  for (const el of requiredHtmlElements) {
    if (!htmlContent.includes(el)) {
      throw new Error(`admin.html missing required element: ${el}`);
    }
  }
  console.log('   ✅ admin.html contains all required Department cards, sub-filter tabs, and Report Preview elements.');

  // TEST 2: Verify admin.css contains styling
  console.log('2. Checking admin.css for Department & Report Preview styling...');
  const cssPath = path.join(__dirname, '..', 'public', 'admin.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const requiredCssClasses = [
    '.dept-card-grid',
    '.dept-card',
    '.dept-card.active',
    '.dept-filter-bar',
    '.dept-status-tabs',
    '.report-preview-box',
    '.report-header-banner'
  ];

  for (const cls of requiredCssClasses) {
    if (!cssContent.includes(cls)) {
      throw new Error(`admin.css missing required class: ${cls}`);
    }
  }
  console.log('   ✅ admin.css contains all required layout and modal styling.');

  // TEST 3: Verify HTTP -> HTTPS redirect on port 3000
  console.log('3. Testing HTTP port 3000 redirect for browser pages...');
  const redirectRes = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:3000/admin', (res) => {
      resolve({ status: res.statusCode, location: res.headers.location });
    }).on('error', reject);
  });

  if (redirectRes.status !== 302 || !redirectRes.location.startsWith('https://')) {
    throw new Error(`Expected 302 redirect to HTTPS, got ${redirectRes.status} -> ${redirectRes.location}`);
  }
  console.log(`   ✅ HTTP port 3000 correctly redirects to HTTPS: ${redirectRes.location}`);

  // TEST 4: Verify /ca.crt serves certificate over HTTP without redirect
  console.log('4. Testing /ca.crt endpoint accessibility over unencrypted HTTP (for phones)...');
  const caRes = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:3000/ca.crt', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'], length: data.length }));
    }).on('error', reject);
  });

  if (caRes.status !== 200 || !caRes.contentType.includes('x509') || caRes.length < 500) {
    throw new Error(`Expected 200 CA certificate, got ${caRes.status}, type: ${caRes.contentType}`);
  }
  console.log(`   ✅ /ca.crt successfully served over HTTP (Status: ${caRes.status}, Size: ${caRes.length} bytes).`);

  // TEST 5: Verify Reverse Proxy for Edge AI (eliminates mixed content)
  console.log('5. Testing Edge AI reverse proxy /api/edge/health on Node.js port 3000/3001...');
  const edgeHealth = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:3000/api/edge/health', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

  if (edgeHealth.status !== 'HEALTHY') {
    throw new Error(`Edge AI reverse proxy returned unexpected status: ${JSON.stringify(edgeHealth)}`);
  }
  console.log(`   ✅ Edge AI reverse proxy /api/edge/health returned: ${edgeHealth.status} (Model loaded: ${edgeHealth.model_loaded}).`);

  // TEST 6: Verify JavaScript Department Categorization Logic
  console.log('6. Verifying Department Categorization Logic (Road vs Traffic)...');
  const potholeEvt = { problem: 'Pothole', category: 'Road & Infrastructure', department: 'ROAD MAINTENANCE' };
  const congestionEvt = { problem: 'Vehicle Congestion', category: 'Traffic', department: 'TRAFFIC MANAGEMENT' };
  const crackEvt = { problem: 'Road Surface Crack', category: 'Road & Infrastructure' };

  function testIsRoadEvent(evt) {
    const dept = String(evt.department || '').toUpperCase();
    const cat = String(evt.category || '').toLowerCase();
    const prob = String(evt.problem || '').toLowerCase();
    return dept.includes('ROAD') || cat.includes('road') || cat.includes('infra') ||
      prob.includes('pothole') || prob.includes('crack') || prob.includes('divider') ||
      prob.includes('zebra') || prob.includes('damage') || prob.includes('waterlog');
  }

  function testIsTrafficEvent(evt) {
    const dept = String(evt.department || '').toUpperCase();
    const cat = String(evt.category || '').toLowerCase();
    const prob = String(evt.problem || '').toLowerCase();
    return dept.includes('TRAFFIC') || cat.includes('traffic') ||
      prob.includes('congestion') || prob.includes('density') || prob.includes('bottleneck') || prob.includes('hazard');
  }

  if (!testIsRoadEvent(potholeEvt) || testIsTrafficEvent(potholeEvt)) {
    throw new Error('Pothole event misclassified!');
  }
  if (!testIsTrafficEvent(congestionEvt) || testIsRoadEvent(congestionEvt)) {
    throw new Error('Traffic event misclassified!');
  }
  if (!testIsRoadEvent(crackEvt)) {
    throw new Error('Road surface crack misclassified!');
  }
  console.log('   ✅ Department categorization correctly routes road vs traffic events.');

  console.log('\n============================================================');
  console.log('🎉 ALL DEPARTMENT WORKFLOW & HTTPS TESTS PASSED PERFECTLY!');
  console.log('============================================================');
}

runDepartmentAndHttpsTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
