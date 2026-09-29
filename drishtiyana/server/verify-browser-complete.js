const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('DRISHTIYANA - COMPREHENSIVE BROWSER MAP RENDERING VERIFICATION');
  console.log('================================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050 });

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
    if (text.includes('[GIS') || text.includes('ERROR') || text.includes('Error')) {
      console.log(`[BROWSER CONSOLE] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]', err.message);
  });

  console.log('\n[1/6] Navigating to http://localhost:3000/login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

  if (page.url().includes('/login')) {
    console.log('[1/6] Logging in with admin credentials...');
    await page.type('#username', 'admin');
    await page.type('#password', 'DrishtiAdmin@2026');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#submitBtn')
    ]);
  }

  console.log('[1/6] Current URL:', page.url());
  // Wait 4 seconds for full map rendering, socket connection, and presentation dataset sync
  await new Promise(r => setTimeout(r, 4000));

  // 1. VERIFY DOM MARKER EXISTENCE & COMPUTED STYLES
  console.log('\n[2/6] Verifying Leaflet DOM Markers & Screen Geometry...');
  const markerVerification = await page.evaluate(() => {
    const mapEl = document.getElementById('adminGisMap');
    const mapRect = mapEl ? mapEl.getBoundingClientRect() : null;

    const markers = Array.from(document.querySelectorAll('.leaflet-marker-icon'));
    const pins = Array.from(document.querySelectorAll('.gis-marker-pin'));
    const detectionPane = document.querySelector('.leaflet-detectionPane-pane');

    const validPositions = [];
    const invalidPositions = [];

    markers.forEach((m, idx) => {
      const rect = m.getBoundingClientRect();
      const style = window.getComputedStyle(m);
      const isVisible = style.display === 'flex' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
      const hasDimensions = rect.width > 0 && rect.height > 0;
      const isInsideMap = mapRect && rect.top >= mapRect.top - 50 && rect.bottom <= mapRect.bottom + 50 &&
                          rect.left >= mapRect.left - 50 && rect.right <= mapRect.right + 50;

      const info = {
        idx,
        width: rect.width,
        height: rect.height,
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        hasDimensions,
        isVisible,
        isInsideMap
      };

      if (isVisible && hasDimensions && isInsideMap) {
        validPositions.push(info);
      } else {
        invalidPositions.push(info);
      }
    });

    return {
      mapExists: !!mapEl,
      mapRect: mapRect ? { width: mapRect.width, height: mapRect.height, top: mapRect.top, left: mapRect.left } : null,
      leafletMapGlobal: !!window.leafletMap,
      leafletZoom: window.leafletMap ? window.leafletMap.getZoom() : null,
      leafletCenter: window.leafletMap ? window.leafletMap.getCenter() : null,
      markerMapCount: window.mapMarkersMap ? window.mapMarkersMap.size : 0,
      domMarkerCount: markers.length,
      gisPinCount: pins.length,
      detectionPaneExists: !!detectionPane,
      detectionPaneChildrenCount: detectionPane ? detectionPane.children.length : 0,
      detectionPaneZIndex: detectionPane ? window.getComputedStyle(detectionPane).zIndex : null,
      validMarkersCount: validPositions.length,
      invalidMarkersCount: invalidPositions.length,
      sampleMarkers: validPositions.slice(0, 3)
    };
  });

  console.log('Marker Verification Result:', JSON.stringify(markerVerification, null, 2));

  if (markerVerification.domMarkerCount === 0 || markerVerification.validMarkersCount === 0) {
    throw new Error('FAIL: Zero visible Leaflet markers found in the browser DOM!');
  }
  console.log(`[PASS] Successfully verified ${markerVerification.validMarkersCount} visible markers in Leaflet detection pane.`);

  // Save full map screenshot with all detection pins visible
  const allPinsPath = path.join(__dirname, 'admin-events-all-markers.png');
  await page.screenshot({ path: allPinsPath, fullPage: false });
  console.log(`[PASS] Full map screenshot saved: ${allPinsPath}`);

  // 2. VERIFY HOVER TOOLTIP INTERACTION
  console.log('\n[3/6] Verifying Hover Tooltip on GIS Detection Marker...');
  const firstPin = await page.$('.gis-marker-pin');
  if (!firstPin) throw new Error('No .gis-marker-pin element found to hover!');

  await firstPin.hover();
  await new Promise(r => setTimeout(r, 600));

  const tooltipInfo = await page.evaluate(() => {
    const tooltip = document.querySelector('.leaflet-tooltip.gis-hover-tooltip');
    const compactCard = document.querySelector('.gis-compact-tooltip');
    if (!tooltip) return { exists: false };
    const rect = tooltip.getBoundingClientRect();
    const style = window.getComputedStyle(tooltip);
    return {
      exists: true,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0,
      width: rect.width,
      height: rect.height,
      title: compactCard ? compactCard.querySelector('.gis-tt-title')?.textContent : null,
      cat: compactCard ? compactCard.querySelector('.gis-tt-cat')?.textContent : null,
      className: compactCard ? compactCard.className : null,
      htmlSnippet: tooltip.innerHTML.slice(0, 150)
    };
  });

  console.log('Tooltip Hover Result:', JSON.stringify(tooltipInfo, null, 2));
  if (!tooltipInfo.exists || !tooltipInfo.visible) {
    throw new Error('FAIL: Hover tooltip did not visibly appear upon hovering marker!');
  }
  console.log(`[PASS] Hover tooltip verified: "${tooltipInfo.title}" (${tooltipInfo.cat})`);

  const hoverTooltipPath = path.join(__dirname, 'admin-marker-hover-tooltip.png');
  await page.screenshot({ path: hoverTooltipPath, fullPage: false });
  console.log(`[PASS] Hover tooltip screenshot saved: ${hoverTooltipPath}`);

  // 3. VERIFY CLICK = EXISTING REPORT DRAWER OPENS
  console.log('\n[4/6] Verifying Click Opens Existing Report Drawer (selectEventById)...');
  await firstPin.click();
  await new Promise(r => setTimeout(r, 800));

  const drawerInfo = await page.evaluate(() => {
    const panel = document.getElementById('adminDetailPanel');
    const backdrop = document.getElementById('drawerBackdrop');
    const titleEl = document.getElementById('detailProblem');
    const catEl = document.getElementById('detailCategoryBadge');

    const isOpen = panel && panel.classList.contains('drawer-open');
    const isBackdropActive = backdrop && backdrop.classList.contains('active');

    return {
      panelExists: !!panel,
      drawerOpen: isOpen,
      backdropActive: isBackdropActive,
      problem: titleEl ? titleEl.textContent : null,
      category: catEl ? catEl.textContent : null
    };
  });

  console.log('Report Drawer Click Result:', JSON.stringify(drawerInfo, null, 2));
  if (!drawerInfo.drawerOpen) {
    throw new Error('FAIL: Clicking the marker did not open the admin report drawer (.drawer-open)!');
  }
  console.log(`[PASS] Report drawer successfully opened for "${drawerInfo.problem}" (${drawerInfo.category})`);

  const drawerOpenPath = path.join(__dirname, 'admin-marker-drawer-open.png');
  await page.screenshot({ path: drawerOpenPath, fullPage: false });
  console.log(`[PASS] Report drawer screenshot saved: ${drawerOpenPath}`);

  // Close the drawer properly
  await page.evaluate(() => {
    const closeBtn = document.getElementById('closeDetailDrawerBtn');
    if (closeBtn) closeBtn.click();
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    const panel = document.getElementById('adminDetailPanel');
    if (panel) panel.classList.remove('drawer-open');
  });
  await new Promise(r => setTimeout(r, 600));

  // 4. VERIFY CATEGORY FILTER TABS (ROADS, TRAFFIC, SAFETY, ALL)
  console.log('\n[5/6] Verifying Category Filter Switching & Dynamic Marker Updates...');

  // A. ROADS TAB
  console.log('-> Switching to ROADS category...');
  await page.evaluate(() => {
    const btn = document.querySelector('.sub-tab-btn[data-subcat="road"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const roadTabInfo = await page.evaluate(() => {
    const pins = Array.from(document.querySelectorAll('.gis-marker-pin'));
    const roadPins = pins.filter(p => p.classList.contains('road'));
    const trafficPins = pins.filter(p => p.classList.contains('traffic'));
    const safetyPins = pins.filter(p => p.classList.contains('safety'));
    return {
      totalPins: pins.length,
      roadPins: roadPins.length,
      trafficPins: trafficPins.length,
      safetyPins: safetyPins.length,
      badgeText: document.getElementById('mapEventCountBadge')?.textContent
    };
  });
  console.log('Road Tab Result:', roadTabInfo);
  if (roadTabInfo.totalPins === 0 || roadTabInfo.trafficPins > 0) {
    throw new Error('FAIL: Road filter did not isolate road markers!');
  }
  await page.screenshot({ path: path.join(__dirname, 'admin-category-roads.png'), fullPage: false });

  // B. TRAFFIC TAB
  console.log('-> Switching to TRAFFIC category...');
  await page.evaluate(() => {
    const btn = document.querySelector('.sub-tab-btn[data-subcat="traffic"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const trafficTabInfo = await page.evaluate(() => {
    const pins = Array.from(document.querySelectorAll('.gis-marker-pin'));
    const roadPins = pins.filter(p => p.classList.contains('road'));
    const trafficPins = pins.filter(p => p.classList.contains('traffic'));
    const safetyPins = pins.filter(p => p.classList.contains('safety'));
    return {
      totalPins: pins.length,
      roadPins: roadPins.length,
      trafficPins: trafficPins.length,
      safetyPins: safetyPins.length,
      badgeText: document.getElementById('mapEventCountBadge')?.textContent
    };
  });
  console.log('Traffic Tab Result:', trafficTabInfo);
  if (trafficTabInfo.totalPins === 0 || trafficTabInfo.roadPins > 0) {
    throw new Error('FAIL: Traffic filter did not isolate traffic markers!');
  }
  await page.screenshot({ path: path.join(__dirname, 'admin-category-traffic.png'), fullPage: false });

  // C. SAFETY TAB
  console.log('-> Switching to SAFETY category...');
  await page.evaluate(() => {
    const btn = document.querySelector('.sub-tab-btn[data-subcat="safety"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const safetyTabInfo = await page.evaluate(() => {
    const pins = Array.from(document.querySelectorAll('.gis-marker-pin'));
    const roadPins = pins.filter(p => p.classList.contains('road'));
    const trafficPins = pins.filter(p => p.classList.contains('traffic'));
    const safetyPins = pins.filter(p => p.classList.contains('safety'));
    return {
      totalPins: pins.length,
      roadPins: roadPins.length,
      trafficPins: trafficPins.length,
      safetyPins: safetyPins.length,
      badgeText: document.getElementById('mapEventCountBadge')?.textContent
    };
  });
  console.log('Safety Tab Result:', safetyTabInfo);
  if (safetyTabInfo.totalPins === 0 || safetyTabInfo.roadPins > 0 || safetyTabInfo.trafficPins > 0) {
    throw new Error('FAIL: Safety filter did not isolate safety markers!');
  }
  await page.screenshot({ path: path.join(__dirname, 'admin-category-safety.png'), fullPage: false });

  // D. ALL TAB
  console.log('-> Switching back to ALL category...');
  await page.evaluate(() => {
    const btn = document.querySelector('.sub-tab-btn[data-subcat="all"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const allTabInfo = await page.evaluate(() => {
    const pins = Array.from(document.querySelectorAll('.gis-marker-pin'));
    return {
      totalPins: pins.length,
      badgeText: document.getElementById('mapEventCountBadge')?.textContent
    };
  });
  console.log('All Tab Result:', allTabInfo);
  if (allTabInfo.totalPins <= roadTabInfo.totalPins) {
    throw new Error('FAIL: ALL filter did not restore combined markers!');
  }

  console.log('\n[6/6] Verifying GIS marker debug logs in browser console...');
  const gisMarkerLogs = consoleLogs.filter(l => l.includes('[GIS MARKER]'));
  const gisMarkerAddedLogs = consoleLogs.filter(l => l.includes('[GIS MARKER ADDED]'));
  const gisMapLogs = consoleLogs.filter(l => l.includes('[GIS MAP]'));

  console.log(`- [GIS MARKER] logs emitted: ${gisMarkerLogs.length}`);
  console.log(`- [GIS MARKER ADDED] logs emitted: ${gisMarkerAddedLogs.length}`);
  console.log(`- [GIS MAP] logs emitted: ${gisMapLogs.length}`);
  if (gisMapLogs.length > 0) {
    console.log(`  Latest [GIS MAP] log: ${gisMapLogs[gisMapLogs.length - 1]}`);
  }

  await browser.close();

  console.log('\n================================================================');
  console.log('ALL BROWSER E2E VERIFICATIONS PASSED WITH FLYING COLORS!');
  console.log('================================================================');
}

runBrowserVerification().catch(err => {
  console.error('\n[VERIFICATION ERROR]', err);
  process.exit(1);
});
