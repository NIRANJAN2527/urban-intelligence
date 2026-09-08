/**
 * DRISHTIYANA - COMMAND & ADMIN PORTAL CLIENT SCRIPT
 * Central supervisor dashboard for city authorities:
 * - Real database event querying & live statistics
 * - Interactive GIS map with category-specific pins & animations
 * - Full event metadata & evidence inspection
 * - Cached reverse geocoding
 * - Real-time Socket.IO synchronization
 * - Two-way map <-> event table coordination
 */

// ==============================================================================
// 1. STATE & DATA CACHES
// ==============================================================================
let leafletMap = null;
let mapMarkersMap = new Map(); // key: event_id, val: L.Marker
let allEventsCache = [];
let selectedEventId = null;
let clientAddressCache = new Map(); // key: "lat,lon", val: address

const socket = io({ transports: ['websocket', 'polling'] });

// DOM Elements - Navigation, User & Stats
const adminUserDisplay = document.getElementById('adminUserDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const adminTotalEventsBadge = document.getElementById('adminTotalEventsBadge');
const adminDbBadge = document.getElementById('adminDbBadge');
const adminDbDot = document.getElementById('adminDbDot');
const adminDbText = document.getElementById('adminDbText');
const adminServerBadge = document.getElementById('adminServerBadge');
const adminServerDot = document.getElementById('adminServerDot');
const adminServerText = document.getElementById('adminServerText');

const statTotalEvents = document.getElementById('statTotalEvents');
const statPendingReview = document.getElementById('statPendingReview');
const statVerified = document.getElementById('statVerified');
const statRejected = document.getElementById('statRejected');
const statReportsSent = document.getElementById('statReportsSent');
const statNewEvents = document.getElementById('statNewEvents');
const statHighPriority = document.getElementById('statHighPriority');
const statCriticalEvents = document.getElementById('statCriticalEvents');
const statRoadProblems = document.getElementById('statRoadProblems');
const statTrafficProblems = document.getElementById('statTrafficProblems');
const statSafetyIncidents = document.getElementById('statSafetyIncidents');

const badgeRoadCount = document.getElementById('badgeRoadCount');
const badgeTrafficCount = document.getElementById('badgeTrafficCount');
const badgeSafetyCount = document.getElementById('badgeSafetyCount');
const badgeTotalCount = document.getElementById('badgeTotalCount');
const mapEventCountBadge = document.getElementById('mapEventCountBadge');

// DOM Elements - Details Panel
const adminDetailPanel = document.getElementById('adminDetailPanel');
const detailPlaceholder = document.getElementById('detailPlaceholder');
const detailContent = document.getElementById('detailContent');
const detailStatusBadge = document.getElementById('detailStatusBadge');
const detailVerificationBadge = document.getElementById('detailVerificationBadge');
const detailVerificationBanner = document.getElementById('detailVerificationBanner');
const detailBannerTitle = document.getElementById('detailBannerTitle');
const detailBannerBadge = document.getElementById('detailBannerBadge');
const detailBannerDesc = document.getElementById('detailBannerDesc');
const verifyEventBtn = document.getElementById('verifyEventBtn');
const rejectEventBtn = document.getElementById('rejectEventBtn');

const detailEvidenceImg = document.getElementById('detailEvidenceImg');
const detailEvidenceUnavailable = document.getElementById('detailEvidenceUnavailable');
const detailEvidenceTag = document.getElementById('detailEvidenceTag');
const detailCategoryBadge = document.getElementById('detailCategoryBadge');
const detailRiskBadge = document.getElementById('detailRiskBadge');
const detailPriorityBadge = document.getElementById('detailPriorityBadge');

const detailEvtId = document.getElementById('detailEvtId');
const detailConf = document.getElementById('detailConf');
const detailProblem = document.getElementById('detailProblem');
const detailObservations = document.getElementById('detailObservations');
const detailDepartment = document.getElementById('detailDepartment');
const detailAddress = document.getElementById('detailAddress');
const detailLat = document.getElementById('detailLat');
const detailLon = document.getElementById('detailLon');
const detailBusId = document.getElementById('detailBusId');
const detailCameraId = document.getElementById('detailCameraId');
const detailDetectedTime = document.getElementById('detailDetectedTime');
const detailSessionId = document.getElementById('detailSessionId');
const detailWorkOrder = document.getElementById('detailWorkOrder');
const detailStatusSelect = document.getElementById('detailStatusSelect');

// DOM Elements - Department Dispatch Action Card
const detailReportStatusBadge = document.getElementById('detailReportStatusBadge');
const detailDispatchDept = document.getElementById('detailDispatchDept');
const reportNotesInput = document.getElementById('reportNotesInput');
const sendReportBtn = document.getElementById('sendReportBtn');
const sendReportBtnText = document.getElementById('sendReportBtnText');
const sendReportSpinner = document.getElementById('sendReportSpinner');
const reportFeedback = document.getElementById('reportFeedback');
const reportLockNotice = document.getElementById('reportLockNotice');

// DOM Elements - Filter Bar
const verificationFilterGroup = document.getElementById('verificationFilterGroup');
let currentVerificationFilter = 'all'; // Accepted detections shown by default

const filterSearchInput = document.getElementById('filterSearchInput');
const filterCategorySelect = document.getElementById('filterCategorySelect');
const filterDepartmentSelect = document.getElementById('filterDepartmentSelect');
const filterRiskSelect = document.getElementById('filterRiskSelect');
const filterPrioritySelect = document.getElementById('filterPrioritySelect');
const filterStatusSelect = document.getElementById('filterStatusSelect');
const filterReportStatusSelect = document.getElementById('filterReportStatusSelect');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const refreshEventsBtn = document.getElementById('refreshEventsBtn');
const recenterAdminMapBtn = document.getElementById('recenterAdminMapBtn');
const fitAllEventsBtn = document.getElementById('fitAllEventsBtn');

// DOM Elements - Table
const eventsTableBody = document.getElementById('eventsTableBody');
const tableEmptyState = document.getElementById('tableEmptyState');

// Modal Elements
const imageModal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImg');
const closeModalBtn = document.getElementById('closeModalBtn');

// Dispatch Confirmation Modal Elements
const confirmReportModal = document.getElementById('confirmReportModal');
const confirmModalDept = document.getElementById('confirmModalDept');
const confirmModalEventId = document.getElementById('confirmModalEventId');
const confirmModalProblem = document.getElementById('confirmModalProblem');
const confirmModalConf = document.getElementById('confirmModalConf');
const cancelReportBtn = document.getElementById('cancelReportBtn');
const confirmSendReportBtn = document.getElementById('confirmSendReportBtn');
const reportPreviewSubject = document.getElementById('reportPreviewSubject');
const reportPreviewPriority = document.getElementById('reportPreviewPriority');
const reportPreviewTimestamp = document.getElementById('reportPreviewTimestamp');
const reportPreviewLocation = document.getElementById('reportPreviewLocation');
const reportPreviewEvidenceImg = document.getElementById('reportPreviewEvidenceImg');
const reportPreviewEvidencePlaceholder = document.getElementById('reportPreviewEvidencePlaceholder');
const reportPreviewDesc = document.getElementById('reportPreviewDesc');

// Top Department Cards & Sub-Filter Bar Elements
const deptCardRoad = document.getElementById('deptCard-road');
const deptCardTraffic = document.getElementById('deptCard-traffic');
const deptCardAll = document.getElementById('deptCard-all');
const deptCountRoadEl = document.getElementById('deptCountRoad');
const deptCountTrafficEl = document.getElementById('deptCountTraffic');
const deptCountAllEl = document.getElementById('deptCountAll');
const selectedDeptHeading = document.getElementById('selectedDeptHeading');
const deptStatusTabs = document.getElementById('deptStatusTabs');
const subCountPendingEl = document.getElementById('subCountPending');
const subCountVerifiedEl = document.getElementById('subCountVerified');
const subCountReportedEl = document.getElementById('subCountReported');
const subCountAllEl = document.getElementById('subCountAll');

// ==============================================================================
// 1.1 AUTHENTICATION HELPERS
// ==============================================================================
function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const token = sessionStorage.getItem('drishtiyana_admin_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function checkAuthentication() {
  try {
    const res = await fetch('/api/auth/check', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.authenticated) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return false;
    }
    if (adminUserDisplay && data.user && data.user.username) {
      adminUserDisplay.textContent = data.user.username;
    }
    return true;
  } catch (err) {
    window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
    return false;
  }
}

function setupLogoutHandler() {
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
      } catch (e) {}
      sessionStorage.removeItem('drishtiyana_admin_token');
      sessionStorage.removeItem('drishtiyana_admin_user');
      window.location.replace('/login');
    });
  }
}

// ==============================================================================
// 2. INITIALIZATION ON LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuthentication();
  if (!isAuthed) return;

  initGisMap();
  setupSidebarNavigation();
  setupMobileSidebar();
  setupFilterListeners();
  setupVerificationButtons();
  setupSocketListeners();
  setupImageModal();
  setupReportSender();
  setupLogoutHandler();

  await fetchStats();
  await fetchAndRenderEvents();
});

// ==============================================================================
// 3. LEAFLET GIS MAP INITIALIZATION (OpenStreetMap)
// ==============================================================================
function initGisMap() {
  if (!window.L) {
    setTimeout(initGisMap, 200);
    return;
  }

  // Default coordinate (Hyderabad, Telangana)
  const defaultCenter = [17.385044, 78.486671];

  leafletMap = L.map('adminGisMap', {
    zoomControl: true,
    attributionControl: true
  }).setView(defaultCenter, 12);

  // OpenStreetMap standard tile layer (100% free, zero Google/paid API key required)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(leafletMap);

  // Add On-Map Interactive Legend
  const legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'gis-map-legend');
    div.innerHTML = `
      <div class="gis-map-legend-title">
        <span>🗺️ GIS DEFECT LEGEND</span>
      </div>
      <div class="gis-legend-row">
        <span class="gis-legend-icon">🕳️</span>
        <span><strong>Pothole / Road Damage</strong></span>
      </div>
      <div class="gis-legend-row">
        <span class="gis-legend-icon">🌊</span>
        <span><strong>Waterlogging / Drainage</strong></span>
      </div>
      <div class="gis-legend-row">
        <span class="gis-legend-icon">🚧</span>
        <span><strong>Divider / Zebra / Sign</strong></span>
      </div>
      <div class="gis-legend-row">
        <span class="gis-legend-icon">🚦</span>
        <span><strong>Traffic / Congestion</strong></span>
      </div>
      <div class="gis-legend-row">
        <span class="gis-legend-icon">🛡️</span>
        <span><strong>Safety Risk / Incident</strong></span>
      </div>
      <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(30,41,59,0.25); font-size: 11px;">
        <div class="gis-legend-row">
          <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#15803D; border:1px solid #14532D; margin-right:4px;"></span>
          <span>🟢 <strong>Accepted Detection (Confidence ≥ 80%)</strong></span>
        </div>
      </div>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legendControl.addTo(leafletMap);

  // Map Controls Event Listeners
  if (recenterAdminMapBtn) {
    recenterAdminMapBtn.addEventListener('click', () => {
      fitMapToMarkers();
    });
  }

  if (fitAllEventsBtn) {
    fitAllEventsBtn.addEventListener('click', () => {
      fitMapToMarkers();
    });
  }

  // CRITICAL FIX: ResizeObserver on map container guarantees full height without blank lower half
  const mapContainer = document.getElementById('adminGisMap');
  const mapCard = document.querySelector('.admin-map-card');
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
      }
    });
    if (mapContainer) resizeObserver.observe(mapContainer);
    if (mapCard) resizeObserver.observe(mapCard);
  }

  window.addEventListener('resize', () => {
    if (leafletMap) leafletMap.invalidateSize();
  });

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
  }, 350);
}

function createCategoryIcon(category, problem, riskLevel, verificationStatus) {
  let catClass = 'road';
  let subClass = '';
  let iconEmoji = '🚧';

  const catNorm = (category || '').toLowerCase();
  const probNorm = (problem || '').toLowerCase();
  const isPothole = probNorm.includes('pothole');

  // Dedicated Road Defect Pothole Marker with Custom SVG
  if (isPothole) {
    catClass = 'road';
    subClass = 'pothole';
  } else if (probNorm.includes('water') || probNorm.includes('flood') || probNorm.includes('drain')) {
    catClass = 'road';
    subClass = 'waterlogging';
    iconEmoji = '🌊';
  } else if (probNorm.includes('divider') || probNorm.includes('median')) {
    catClass = 'road';
    iconEmoji = '🚧';
  } else if (probNorm.includes('zebra') || probNorm.includes('crossing')) {
    catClass = 'road';
    iconEmoji = '🚸';
  } else if (probNorm.includes('sign') || probNorm.includes('board')) {
    catClass = 'road';
    iconEmoji = '🪧';
  } else if (catNorm.includes('traffic') || probNorm.includes('traffic') || probNorm.includes('congestion') || probNorm.includes('bottleneck') || probNorm.includes('density') || probNorm.includes('signal')) {
    // TRAFFIC CATEGORIES
    catClass = 'traffic';
    iconEmoji = '🚦';
  } else if (catNorm.includes('safety') || probNorm.includes('pedestrian') || probNorm.includes('rash') || probNorm.includes('accident') || probNorm.includes('hit-and-run') || probNorm.includes('hazard')) {
    // SAFETY CATEGORIES
    catClass = 'safety';
    iconEmoji = '🛡️';
  }

  const isCritical = (riskLevel || '').toUpperCase() === 'CRITICAL';
  const vStat = (verificationStatus || 'ACCEPTED').toUpperCase();

  const vClass = 'marker-verified';
  const vBadgeHtml = '<span class="marker-vbadge verified" title="Pothole: Accepted Detection">✓</span>';

  // Use crisp road-damage SVG for potholes
  let innerIconHtml = iconEmoji;
  if (isPothole) {
    innerIconHtml = `
      <svg class="pothole-svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" title="Road Damage: Pothole">
        <path d="M2 18h20"/>
        <path d="M5 18l3-6 4 3 4-7 2 4 3-2 1 8"/>
        <ellipse cx="12" cy="18" rx="5" ry="2.2" fill="currentColor" opacity="0.35"/>
      </svg>
    `;
  }

  return L.divIcon({
    className: 'gis-marker-container',
    html: `
      <div class="gis-marker-pin ${catClass} ${subClass} ${vClass} ${isCritical ? 'critical' : ''}" title="${problem || 'Pothole'} (Accepted Detection)">
        ${innerIconHtml}
        ${vBadgeHtml}
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19]
  });
}

function fitMapToMarkers() {
  if (!leafletMap || mapMarkersMap.size === 0) {
    if (leafletMap) leafletMap.setView([17.385044, 78.486671], 12);
    return;
  }

  const group = L.featureGroup(Array.from(mapMarkersMap.values()));
  leafletMap.fitBounds(group.getBounds().pad(0.18));
}

// ==============================================================================
// 4. DATA FETCHING & RENDERING
// ==============================================================================
async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (res.status === 401) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.stats) return;

    const s = data.stats;
    if (statTotalEvents) statTotalEvents.textContent = s.total_detections || s.total_events || 0;
    if (statPendingReview) statPendingReview.textContent = s.pending_review || 0;
    if (statVerified) statVerified.textContent = s.verified || 0;
    if (statRejected) statRejected.textContent = s.rejected || 0;
    if (statReportsSent) statReportsSent.textContent = s.reports_sent || s.reports_dispatched || 0;
    if (statNewEvents) statNewEvents.textContent = s.new_events || 0;
    if (statHighPriority) statHighPriority.textContent = s.high_priority || 0;
    if (statCriticalEvents) statCriticalEvents.textContent = s.critical_events || 0;
    if (statRoadProblems) statRoadProblems.textContent = s.road_problems || 0;
    if (statTrafficProblems) statTrafficProblems.textContent = s.traffic_problems || 0;
    if (statSafetyIncidents) statSafetyIncidents.textContent = s.safety_incidents || 0;

    if (badgeRoadCount) badgeRoadCount.textContent = s.road_problems || 0;
    if (badgeTrafficCount) badgeTrafficCount.textContent = s.traffic_problems || 0;
    if (badgeSafetyCount) badgeSafetyCount.textContent = s.safety_incidents || 0;
    if (badgeTotalCount) badgeTotalCount.textContent = s.total_events || 0;
    if (adminTotalEventsBadge) adminTotalEventsBadge.textContent = `EVENTS: ${s.total_events || 0}`;

    renderDepartmentBreakdown(s.by_department || {});
    renderAnalyticsBreakdown(s);
  } catch (err) {
    console.warn('[Admin Portal] Stats fetch error:', err.message);
  }
}

// Department-Centric State
let currentSelectedDepartment = 'ROAD MAINTENANCE'; // 'ROAD MAINTENANCE' | 'TRAFFIC' | 'ALL'
let currentSubFilter = 'ALL'; // 'ALL' | 'PENDING_REVIEW' | 'VERIFIED' | 'REPORTED'

function isRoadEvent(evt) {
  const dept = String(evt.department || '').toUpperCase();
  const cat = String(evt.category || '').toLowerCase();
  const prob = String(evt.problem || evt.problem_type || evt.class_name || '').toLowerCase();
  return dept.includes('ROAD') || cat.includes('road') || cat.includes('infra') ||
    prob.includes('pothole') || prob.includes('crack') || prob.includes('divider') ||
    prob.includes('zebra') || prob.includes('damage') || prob.includes('waterlog');
}

function isTrafficEvent(evt) {
  const dept = String(evt.department || '').toUpperCase();
  const cat = String(evt.category || '').toLowerCase();
  const prob = String(evt.problem || evt.problem_type || evt.class_name || '').toLowerCase();
  return dept.includes('TRAFFIC') || cat.includes('traffic') ||
    prob.includes('congestion') || prob.includes('density') || prob.includes('bottleneck') || prob.includes('hazard');
}

function applyDepartmentFiltersAndRender() {
  if (!Array.isArray(allEventsCache)) return;

  // 1. Calculate department overview counts from active events
  const activeEvents = allEventsCache.filter(e => e.is_active !== false && (e.verification_status || '').toUpperCase() !== 'REJECTED');
  const roadTotal = activeEvents.filter(isRoadEvent).length;
  const trafficTotal = activeEvents.filter(isTrafficEvent).length;
  const allTotal = activeEvents.length;

  if (deptCountRoadEl) deptCountRoadEl.textContent = roadTotal;
  if (deptCountTrafficEl) deptCountTrafficEl.textContent = trafficTotal;
  if (deptCountAllEl) deptCountAllEl.textContent = allTotal;

  // 2. Filter by currently selected department
  let deptFiltered = activeEvents;
  if (currentSelectedDepartment === 'ROAD MAINTENANCE') {
    deptFiltered = activeEvents.filter(isRoadEvent);
  } else if (currentSelectedDepartment === 'TRAFFIC') {
    deptFiltered = activeEvents.filter(isTrafficEvent);
  }

  // 3. Calculate sub-counts for the active department
  const subAccepted = deptFiltered.filter(e => (e.status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'VERIFIED').length;
  const subReported = deptFiltered.filter(e => (e.report_status || '').toUpperCase() === 'SENT').length;
  const subAll = deptFiltered.length;

  const subCountAcceptedEl = document.getElementById('subCountAccepted');
  if (subCountAcceptedEl) subCountAcceptedEl.textContent = subAccepted;
  if (subCountReportedEl) subCountReportedEl.textContent = subReported;
  if (subCountAllEl) subCountAllEl.textContent = subAll;

  // 4. Filter by sub-status tab
  let finalFiltered = deptFiltered;
  if (currentSubFilter === 'ACCEPTED') {
    finalFiltered = deptFiltered.filter(e => (e.status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'VERIFIED');
  } else if (currentSubFilter === 'REPORTED') {
    finalFiltered = deptFiltered.filter(e => (e.report_status || '').toUpperCase() === 'SENT');
  }

  renderEventsTable(finalFiltered);
  renderMapMarkers(finalFiltered);

  if (mapEventCountBadge) {
    mapEventCountBadge.textContent = `${mapMarkersMap.size} pin${mapMarkersMap.size === 1 ? '' : 's'}`;
  }
}

function selectDepartment(deptName) {
  currentSelectedDepartment = deptName;
  [deptCardRoad, deptCardTraffic, deptCardAll].forEach(c => {
    if (c) c.classList.remove('active');
  });
  if (deptName === 'ROAD MAINTENANCE' && deptCardRoad) deptCardRoad.classList.add('active');
  if (deptName === 'TRAFFIC' && deptCardTraffic) deptCardTraffic.classList.add('active');
  if (deptName === 'ALL' && deptCardAll) deptCardAll.classList.add('active');

  if (selectedDeptHeading) {
    selectedDeptHeading.textContent = deptName === 'TRAFFIC' ? 'TRAFFIC MANAGEMENT' : (deptName === 'ALL' ? 'ALL INCIDENTS' : 'ROAD MAINTENANCE');
  }

  applyDepartmentFiltersAndRender();
}

function selectSubFilter(subName) {
  currentSubFilter = subName;
  if (deptStatusTabs) {
    deptStatusTabs.querySelectorAll('.dept-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-sub') === subName);
    });
  }
  applyDepartmentFiltersAndRender();
}

// Admin Portal Validation: Events without valid GPS and frame image must not appear in the Admin Portal
function hasAdminPortalRequirements(evt) {
  if (!evt) return false;
  const lat = evt.latitude !== undefined && evt.latitude !== null ? parseFloat(evt.latitude) : NaN;
  const lon = evt.longitude !== undefined && evt.longitude !== null ? parseFloat(evt.longitude) : NaN;
  const hasValidGps = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  const img = evt.evidence_image_url || evt.image_url || evt.evidence_url || evt.frame_image || evt.evidence_image;
  const hasValidFrameImage = typeof img === 'string' && img.trim().length > 0 &&
                             img.trim().toLowerCase() !== 'null' && img.trim().toLowerCase() !== 'undefined' &&
                             img.trim().toLowerCase() !== 'n/a' && img.trim().toLowerCase() !== 'none';
  return hasValidGps && hasValidFrameImage;
}

async function fetchAndRenderEvents() {
  try {
    const params = new URLSearchParams();
    params.append('verification_status', 'all');
    params.append('include_inactive', 'true');
    const q = filterSearchInput ? filterSearchInput.value.trim() : '';
    if (q) params.append('search', q);

    const url = `/api/admin/events?${params.toString()}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.status === 401) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    allEventsCache = (data.events || []).filter(hasAdminPortalRequirements);

    applyDepartmentFiltersAndRender();
  } catch (err) {
    console.error('[Admin Portal] Failed to fetch events:', err);
    renderEventsTable([]);
    renderMapMarkers([]);
  }
}

// ==============================================================================
// 5. MAP MARKERS RENDERING & SYNCHRONIZATION
// ==============================================================================
function renderMapMarkers(events) {
  if (!leafletMap) return;

  // Clear existing markers
  for (const marker of mapMarkersMap.values()) {
    leafletMap.removeLayer(marker);
  }
  mapMarkersMap.clear();

  let validCoordsCount = 0;

  events.forEach(evt => {
    const vStat = (evt.verification_status || 'PENDING_REVIEW').toUpperCase();
    // Exclude soft-deleted / REJECTED events from active map layer
    if (evt.is_active === false || vStat === 'REJECTED') {
      return;
    }

    if (evt.latitude === null || evt.longitude === null || evt.latitude === undefined || evt.longitude === undefined) return;
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;

    validCoordsCount++;
    const icon = createCategoryIcon(evt.category, evt.problem, evt.risk_level, 'ACCEPTED');
    const marker = L.marker([lat, lon], { icon }).addTo(leafletMap);

    const confVal = typeof evt.confidence === 'number' ? evt.confidence : parseFloat(evt.confidence || 0);
    const confPct = Math.round(confVal * 100);
    const timeFormatted = evt.created_at
      ? new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    marker.bindPopup(`
      <div style="font-family: var(--font-sans, sans-serif); font-size: 12px; min-width: 210px; max-width: 260px; line-height: 1.45; color: #1E293B;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #0F172A; font-size: 13px; text-transform: uppercase; font-weight: 800;">${evt.problem || evt.class_name || 'POTHOLE'}</strong>
          <span style="font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #DCFCE7; color: #15803D; border: 1px solid #BBF7D0;">
            ✓ ACCEPTED
          </span>
        </div>

        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #64748B;">Confidence:</span>
            <strong style="color: #15803D; font-weight: 800;">${confPct}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #64748B;">Location:</span>
            <span style="font-family: var(--font-mono); font-size: 10.5px; color: #1E293B;">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #64748B;">Time:</span>
            <span style="color: #1E293B; font-weight: 500;">${timeFormatted}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748B;">Bus:</span>
            <span style="color: #1E293B; font-weight: 600;">${evt.bus_id || 'BUS-001'}</span>
          </div>
        </div>

        <button onclick="selectEventById('${evt.event_id}', false)" style="width: 100%; padding: 6px 10px; background: #15803D; color: #ffffff; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
          <span>🔍</span> View Details
        </button>
      </div>
    `);

    marker.on('click', () => {
      selectEventById(evt.event_id, false);
    });

    mapMarkersMap.set(evt.event_id, marker);
  });

  if (validCoordsCount > 0) {
    fitMapToMarkers();
  }
}

// ==============================================================================
// 6. EVENT TABLE RENDERING
// ==============================================================================
function renderEventsTable(events) {
  eventsTableBody.innerHTML = '';

  if (!events || events.length === 0) {
    tableEmptyState.style.display = 'flex';
    return;
  }

  tableEmptyState.style.display = 'none';

  events.forEach(evt => {
    const tr = document.createElement('tr');
    tr.id = `row-${evt.event_id}`;
    if (evt.event_id === selectedEventId) {
      tr.classList.add('selected');
    }

    const confPct = Math.round((evt.confidence || 0) * 100);
    const rLvl = (evt.risk_level || 'MEDIUM').toUpperCase();
    const prio = (evt.priority || 'MEDIUM').toUpperCase();
    const stat = (evt.status || 'NEW').toUpperCase();
    const vStat = (evt.verification_status || 'PENDING_REVIEW').toUpperCase();

    let riskBadgeClass = 'badge-risk-medium';
    if (rLvl === 'CRITICAL') riskBadgeClass = 'badge-risk-critical';
    else if (rLvl === 'HIGH') riskBadgeClass = 'badge-risk-high';
    else if (rLvl === 'LOW') riskBadgeClass = 'badge-risk-low';

    let statClass = 'status-new';
    if (stat === 'ASSIGNED') statClass = 'status-assigned';
    else if (stat === 'IN_PROGRESS') statClass = 'status-in_progress';
    else if (stat === 'RESOLVED') statClass = 'status-resolved';

    const isAccepted = evt.is_active !== false && (vStat === 'ACCEPTED' || vStat === 'VERIFIED' || stat === 'ACCEPTED');
    let vBadgeHtml = `<span class="badge-v-verified" style="background:#DCFCE7;color:#15803D;border:1.5px solid #16A34A;font-weight:700;padding:2px 6px;border-radius:4px;font-size:0.75rem;">ACCEPTED</span>`;
    if (!isAccepted && (vStat === 'REJECTED' || evt.is_active === false)) {
      vBadgeHtml = `<span class="badge-v-rejected" style="padding:2px 6px;border-radius:4px;font-size:0.75rem;">REJECTED</span>`;
    }

    const hasGps = evt.latitude !== null && evt.longitude !== null &&
      Number.isFinite(parseFloat(evt.latitude)) && Number.isFinite(parseFloat(evt.longitude)) &&
      (parseFloat(evt.latitude) !== 0 || parseFloat(evt.longitude) !== 0);

    const latLonText = hasGps
      ? `${parseFloat(evt.latitude).toFixed(5)}, ${parseFloat(evt.longitude).toFixed(5)}`
      : '<span style="color: var(--text-muted); font-style: italic;">GPS unavailable</span>';

    const timeText = evt.created_at
      ? new Date(evt.created_at).toISOString().slice(0, 19).replace('T', ' ')
      : '--';

    const repStatus = (evt.report_status || 'PENDING').toUpperCase();
    let reportBadgeHtml = `<span class="badge" style="background: var(--bg-muted); color: var(--text-muted); font-size: 0.72rem;">PENDING</span>`;
    if (repStatus === 'SENT') {
      reportBadgeHtml = `<span class="badge" style="background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-border); font-size: 0.72rem; font-weight: 700;">✓ SENT</span>`;
    } else if (repStatus === 'FAILED') {
      reportBadgeHtml = `<span class="badge" style="background: var(--color-offline-bg); color: var(--color-offline); font-size: 0.72rem;">FAILED</span>`;
    }

    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); font-size: 0.8rem;">${evt.event_id}</strong></td>
      <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${evt.category || 'Road'}</span></td>
      <td><strong>${evt.problem || evt.class_name || 'Pothole'}</strong></td>
      <td style="font-family: var(--font-mono); font-weight: 600; color: var(--color-primary);">${confPct}%</td>
      <td>${vBadgeHtml}</td>
      <td><span class="${riskBadgeClass}">${rLvl} (${evt.risk_score || 0})</span></td>
      <td><strong>${prio}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 0.78rem;">${latLonText}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${timeText}</td>
      <td><span class="badge">${evt.bus_id || 'BUS-101'}</span></td>
      <td><span class="badge-dept">${evt.department || 'ROAD MAINTENANCE'}</span></td>
      <td>${reportBadgeHtml}</td>
      <td><span class="badge-status ${statClass}">${stat}</span></td>
      <td><button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.74rem; font-weight: 700; border-color: var(--color-primary-border); color: var(--color-primary);">🔍 View</button></td>
    `;

    tr.addEventListener('click', () => {
      selectEventById(evt.event_id, true);
    });

    eventsTableBody.appendChild(tr);
  });
}

// ==============================================================================
// 7. EVENT SELECTION & REVERSE GEOCODING
// ==============================================================================
async function selectEventById(eventId, panMap = true) {
  selectedEventId = eventId;
  const evt = allEventsCache.find(e => e.event_id === eventId);
  if (!evt) return;

  // Highlight row in table
  document.querySelectorAll('#eventsTableBody tr').forEach(row => row.classList.remove('selected'));
  const activeRow = document.getElementById(`row-${eventId}`);
  if (activeRow) {
    activeRow.classList.add('selected');
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Pan Map & Open Popup
  const marker = mapMarkersMap.get(eventId);
  if (marker && leafletMap) {
    if (panMap) {
      leafletMap.setView(marker.getLatLng(), Math.max(leafletMap.getZoom(), 15), { animate: true });
    }
    marker.openPopup();
  }

  // Ensure Leaflet recomputes geometry if details panel expanded
  if (leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 200);
  }

  // Populate Details Panel
  detailPlaceholder.style.display = 'none';
  detailContent.style.display = 'flex';

  // Responsive: on tablet/mobile screens, scroll down to details panel
  if (window.innerWidth <= 1024 && adminDetailPanel) {
    setTimeout(() => {
      adminDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  // Verification & Status States
  const vStat = (evt.verification_status || 'ACCEPTED').toUpperCase();
  const isActive = evt.is_active !== false && vStat !== 'REJECTED';
  const stat = (evt.status || 'ACCEPTED').toUpperCase();

  // Header status & verification badges
  detailStatusBadge.textContent = 'ACCEPTED';
  detailStatusBadge.className = 'badge badge-v-verified';
  if (detailStatusSelect) detailStatusSelect.value = stat;

  if (detailVerificationBadge) {
    detailVerificationBadge.style.display = 'inline-block';
    detailVerificationBadge.textContent = 'ACCEPTED';
    detailVerificationBadge.className = 'badge-v-verified';
  }

  // Evidence Image
  if (evt.evidence_image_url) {
    detailEvidenceImg.src = evt.evidence_image_url;
    detailEvidenceImg.style.display = 'block';
    if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'none';
    detailEvidenceTag.textContent = `OBSERVED ${evt.observation_count || 1}X (BEST FRAME)`;
    detailEvidenceTag.style.display = 'block';

    detailEvidenceImg.onerror = () => {
      detailEvidenceImg.style.display = 'none';
      if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'flex';
      detailEvidenceTag.textContent = 'EVIDENCE UNAVAILABLE';
    };
  } else {
    detailEvidenceImg.style.display = 'none';
    if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'flex';
    detailEvidenceTag.textContent = 'EVIDENCE UNAVAILABLE';
  }

  // Category & Risk Badges
  detailCategoryBadge.textContent = evt.category || 'Road & Infrastructure';
  const rScore = evt.risk_score || 0;
  const rLvl = (evt.risk_level || 'MEDIUM').toUpperCase();
  detailRiskBadge.textContent = `RISK: ${rLvl} (${rScore}/100)`;
  detailRiskBadge.className = `badge badge-risk-${rLvl.toLowerCase()}`;

  const prio = (evt.priority || 'MEDIUM').toUpperCase();
  detailPriorityBadge.textContent = `PRIORITY: ${prio}`;
  detailPriorityBadge.className = `badge badge-risk-${prio === 'HIGH' ? 'high' : 'medium'}`;

  // Field Attributes (Preserves AI Confidence e.g. 91% and shows simple accepted status)
  detailEvtId.textContent = evt.event_id || '--';
  
  // Progress bar & clear confidence explanation
  const confVal = typeof evt.confidence === 'number' ? evt.confidence : parseFloat(evt.confidence || 0);
  const confPct = Math.round(confVal * 100);
  detailConf.innerHTML = `
    <div class="conf-indicator conf-high" title="AI Confidence: ${confPct}% (Automatic Acceptance Threshold ≥ 80%)">
      <div class="conf-bar"><div class="conf-fill high" style="width: ${confPct}%"></div></div>
      <span class="conf-text">🟢 ${confPct}% &bull; Accepted Detection</span>
    </div>
  `;

  const detailVerifStatus = document.getElementById('detailVerifStatus');
  const detailVerifMethod = document.getElementById('detailVerifMethod');
  if (detailVerifStatus) {
    detailVerifStatus.textContent = 'ACCEPTED';
    detailVerifStatus.style.color = '#15803D';
  }
  if (detailVerifMethod) {
    detailVerifMethod.textContent = 'AI_ACCEPTED';
    detailVerifMethod.style.color = '#15803D';
  }

  detailProblem.textContent = evt.problem || evt.class_name || 'Pothole';

  // Audit explanation note
  let auditNote = `${evt.observation_count || 1} frame(s) &bull; Automatically accepted via AI confidence threshold (${confPct}% ≥ 80%)`;
  detailObservations.innerHTML = auditNote;

  detailDepartment.textContent = evt.department || 'ROAD MAINTENANCE';
  detailLat.textContent = evt.latitude ? evt.latitude.toFixed(6) : 'N/A';
  detailLon.textContent = evt.longitude ? evt.longitude.toFixed(6) : 'N/A';
  detailBusId.textContent = evt.bus_id || 'BUS-101';
  detailCameraId.textContent = evt.camera_id || 'CAM-01';
  detailDetectedTime.textContent = evt.created_at ? new Date(evt.created_at).toUTCString() : '--';
  detailSessionId.textContent = evt.session_id || '--';
  detailWorkOrder.textContent = evt.work_order_id || 'Not Assigned';

  // Reverse Geocoding
  if (evt.latitude && evt.longitude) {
    detailAddress.textContent = 'Fetching address...';
    const addr = await resolveAddress(evt.latitude, evt.longitude);
    detailAddress.textContent = addr;
  } else {
    detailAddress.textContent = 'Address unavailable (No GPS)';
  }

  // Department Dispatch Action Card UI State & Reporting Availability
  const repStatus = (evt.report_status || 'PENDING').toUpperCase();
  if (detailReportStatusBadge) {
    detailReportStatusBadge.textContent = repStatus;
    if (repStatus === 'SENT') {
      detailReportStatusBadge.style.background = 'var(--color-primary-light)';
      detailReportStatusBadge.style.color = 'var(--color-primary)';
      detailReportStatusBadge.style.border = '1px solid var(--color-primary-border)';
    } else {
      detailReportStatusBadge.style.background = 'var(--bg-muted)';
      detailReportStatusBadge.style.color = 'var(--text-muted)';
      detailReportStatusBadge.style.border = '1px solid var(--bg-card-border)';
    }
  }

  if (detailDispatchDept) {
    detailDispatchDept.textContent = evt.department || 'ROAD MAINTENANCE';
  }

  if (reportNotesInput) {
    reportNotesInput.value = '';
  }

  if (reportFeedback) {
    reportFeedback.style.display = 'none';
  }

  // DEPARTMENT REPORTING:
  // Immediately eligible for reporting - no verification gate!
  if (repStatus === 'SENT') {
    if (reportLockNotice) reportLockNotice.style.display = 'none';
    if (sendReportBtn) {
      sendReportBtn.disabled = true;
      sendReportBtn.style.opacity = '0.75';
      sendReportBtn.style.cursor = 'not-allowed';
    }
    if (sendReportBtnText) sendReportBtnText.textContent = `✓ REPORT SENT (${evt.report_id || 'Submitted through prototype workflow'})`;
  } else {
    // Available for reporting immediately
    if (reportLockNotice) reportLockNotice.style.display = 'none';
    if (sendReportBtn) {
      sendReportBtn.disabled = false;
      sendReportBtn.style.opacity = '1';
      sendReportBtn.style.cursor = 'pointer';
    }
    if (sendReportBtnText) sendReportBtnText.textContent = `📄 VIEW REPORT`;
  }
}

// ==============================================================================
// 7.1 VERIFICATION WORKFLOW ACTION HANDLERS (REMOVED - AUTO ACCEPTED)
// ==============================================================================
function setupVerificationButtons() {
  // Verification buttons removed - pothole detections are automatically accepted via confidence threshold >= 0.80
}

async function handleVerifyCurrentEvent() {}
async function handleRejectCurrentEvent() {}

function updateSingleMapMarker(evt) {
  if (!leafletMap) return;
  if (evt.is_active === false) {
    const existing = mapMarkersMap.get(evt.event_id);
    if (existing) {
      leafletMap.removeLayer(existing);
      mapMarkersMap.delete(evt.event_id);
      if (mapEventCountBadge) {
        mapEventCountBadge.textContent = `${mapMarkersMap.size} pin${mapMarkersMap.size === 1 ? '' : 's'}`;
      }
    }
    return;
  }

  const existing = mapMarkersMap.get(evt.event_id);
  const icon = createCategoryIcon(evt.category, evt.problem, evt.risk_level, 'ACCEPTED');
  if (existing) {
    existing.setIcon(icon);
  } else if (Number.isFinite(evt.latitude) && Number.isFinite(evt.longitude) && !(evt.latitude === 0 && evt.longitude === 0)) {
    renderMapMarkers(allEventsCache);
  }
}

// Make selectEventById globally callable from Leaflet popup buttons
window.selectEventById = selectEventById;
window.directVerifyEvent = async function() {};
window.directRejectEvent = async function() {};

async function resolveAddress(lat, lon) {
  const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if (clientAddressCache.has(cacheKey)) {
    return clientAddressCache.get(cacheKey);
  }

  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`, { headers: getAuthHeaders() });
    if (!res.ok) return 'Address unavailable';
    const data = await res.json();
    const formatted = data.formatted || 'Address unavailable';
    clientAddressCache.set(cacheKey, formatted);
    return formatted;
  } catch (err) {
    return 'Address unavailable';
  }
}

// ==============================================================================
// 8. SIDEBAR NAVIGATION & CATEGORY SWITCHING
// ==============================================================================
function setupSidebarNavigation() {
  const navButtons = document.querySelectorAll('.sidebar-nav-btn');
  const sections = {
    overview: document.getElementById('view-overview'),
    departments: document.getElementById('view-departments'),
    workorders: document.getElementById('view-workorders'),
    analytics: document.getElementById('view-analytics')
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Category filter buttons
      if (view === 'road') {
        filterCategorySelect.value = 'Road & Infrastructure';
        showView('overview');
        fetchAndRenderEvents();
      } else if (view === 'traffic') {
        filterCategorySelect.value = 'Traffic';
        showView('overview');
        fetchAndRenderEvents();
      } else if (view === 'safety') {
        filterCategorySelect.value = 'Safety';
        showView('overview');
        fetchAndRenderEvents();
      } else if (view === 'gis') {
        showView('overview');
        filterCategorySelect.value = 'all';
        fetchAndRenderEvents();
        setTimeout(() => {
          document.getElementById('adminGisMap').scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else if (view === 'events') {
        showView('overview');
        filterCategorySelect.value = 'all';
        fetchAndRenderEvents();
        setTimeout(() => {
          document.getElementById('adminEventsTable').scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else if (sections[view]) {
        showView(view);
      } else {
        showView('overview');
      }
    });
  });

  function showView(activeKey) {
    Object.keys(sections).forEach(key => {
      if (sections[key]) {
        sections[key].style.display = key === activeKey ? 'block' : 'none';
      }
    });
    if (activeKey === 'overview' && leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 200);
    }
  }
}

function setupMobileSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!sidebar) return;

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 300);
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 300);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // Close sidebar on nav item click on small screens
  const navBtns = sidebar.querySelectorAll('.sidebar-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
    });
  });
}

// ==============================================================================
// 9. FILTER LISTENERS
// ==============================================================================
function setupFilterListeners() {
  // Top Horizontal Department Cards
  if (deptCardRoad) {
    deptCardRoad.addEventListener('click', () => selectDepartment('ROAD MAINTENANCE'));
  }
  if (deptCardTraffic) {
    deptCardTraffic.addEventListener('click', () => selectDepartment('TRAFFIC'));
  }
  if (deptCardAll) {
    deptCardAll.addEventListener('click', () => selectDepartment('ALL'));
  }

  // Department Sub-Filter Tabs
  if (deptStatusTabs) {
    deptStatusTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.dept-tab');
      if (!btn) return;
      selectSubFilter(btn.getAttribute('data-sub'));
    });
  }

  // Verification filter pills
  if (verificationFilterGroup) {
    verificationFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.vfilter-btn');
      if (!btn) return;
      verificationFilterGroup.querySelectorAll('.vfilter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVerificationFilter = btn.dataset.val;
      fetchAndRenderEvents();
    });
  }

  [filterCategorySelect, filterDepartmentSelect, filterRiskSelect, filterPrioritySelect, filterStatusSelect, filterReportStatusSelect].forEach(select => {
    if (select) select.addEventListener('change', () => fetchAndRenderEvents());
  });

  let debounceTimer;
  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAndRenderEvents(), 300);
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (filterSearchInput) filterSearchInput.value = '';
      if (filterCategorySelect) filterCategorySelect.value = 'all';
      if (filterDepartmentSelect) filterDepartmentSelect.value = 'all';
      if (filterRiskSelect) filterRiskSelect.value = 'all';
      if (filterPrioritySelect) filterPrioritySelect.value = 'all';
      if (filterStatusSelect) filterStatusSelect.value = 'all';
      if (filterReportStatusSelect) filterReportStatusSelect.value = 'all';
      currentVerificationFilter = 'all';
      if (verificationFilterGroup) {
        verificationFilterGroup.querySelectorAll('.vfilter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.val === 'all');
        });
      }
      fetchAndRenderEvents();
    });
  }

  if (refreshEventsBtn) {
    refreshEventsBtn.addEventListener('click', async () => {
      refreshEventsBtn.disabled = true;
      refreshEventsBtn.textContent = 'Refreshing...';
      await fetchStats();
      await fetchAndRenderEvents();
      refreshEventsBtn.disabled = false;
      refreshEventsBtn.textContent = '🔄 Refresh Data';
    });
  }

  // Status Changer
  if (detailStatusSelect) {
    detailStatusSelect.addEventListener('change', async () => {
      if (!selectedEventId) return;
      const newStatus = detailStatusSelect.value;
      try {
        const res = await fetch(`/api/admin/events/${selectedEventId}/status`, {
          method: 'PATCH',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          const evt = allEventsCache.find(e => e.event_id === selectedEventId);
          if (evt) evt.status = newStatus;
          selectEventById(selectedEventId, false);
          renderEventsTable(allEventsCache);
          await fetchStats();
        }
      } catch (err) {
        console.error('Status update failed:', err);
      }
    });
  }
}

// ==============================================================================
// 9.1 DEPARTMENT REPORT DISPATCHER (With Official Report Preview)
// ==============================================================================
function openReportPreviewModal(evt) {
  if (!evt) return;

  if (evt.is_active === false) {
    alert('Cannot dispatch report: Detection candidate is inactive.');
    return;
  }

  // Destination department automatically determined
  const destDept = isTrafficEvent(evt) ? 'TRAFFIC MANAGEMENT' : 'ROAD MAINTENANCE';
  const probName = evt.problem || evt.class_name || 'Road Damage';
  const prio = (evt.priority || 'HIGH').toUpperCase();
  const confPct = Math.round((evt.confidence || 0) * 100);
  const locStr = evt.address ? `${evt.address} (${Number(evt.latitude).toFixed(5)}, ${Number(evt.longitude).toFixed(5)})` : `${Number(evt.latitude).toFixed(5)}, ${Number(evt.longitude).toFixed(5)}`;
  const dtStr = evt.created_at ? new Date(evt.created_at).toLocaleString() : new Date().toLocaleString();

  if (confirmModalDept) confirmModalDept.textContent = destDept;
  if (reportPreviewSubject) reportPreviewSubject.textContent = `[${prio} PRIORITY] ${probName} Incident Report — ${evt.event_id}`;
  if (confirmModalEventId) confirmModalEventId.textContent = evt.event_id;
  if (confirmModalProblem) confirmModalProblem.textContent = `${probName} (${evt.category || 'Urban Infrastructure'})`;
  if (confirmModalConf) confirmModalConf.textContent = `${confPct}% (Automatic Acceptance Threshold ≥ 80%)`;
  if (reportPreviewPriority) reportPreviewPriority.textContent = prio;
  if (reportPreviewTimestamp) reportPreviewTimestamp.textContent = dtStr;
  if (reportPreviewLocation) reportPreviewLocation.textContent = locStr;

  if (evt.evidence_image_url && reportPreviewEvidenceImg) {
    reportPreviewEvidenceImg.src = evt.evidence_image_url;
    reportPreviewEvidenceImg.style.display = 'block';
    if (reportPreviewEvidencePlaceholder) reportPreviewEvidencePlaceholder.style.display = 'none';
  } else {
    if (reportPreviewEvidenceImg) reportPreviewEvidenceImg.style.display = 'none';
    if (reportPreviewEvidencePlaceholder) reportPreviewEvidencePlaceholder.style.display = 'block';
  }

  if (reportPreviewDesc) {
    if (destDept === 'TRAFFIC MANAGEMENT') {
      reportPreviewDesc.textContent = `A traffic hazard / congestion anomaly (${probName}) was detected by the mobile urban intelligence system at ${locStr}. Auto-accepted for prompt traffic authority response.`;
    } else {
      reportPreviewDesc.textContent = `A road surface defect (${probName}) was detected by the mobile urban intelligence system at ${locStr}. Automatically accepted via AI confidence threshold for municipal road maintenance inspection and repair.`;
    }
  }

  if (confirmReportModal) confirmReportModal.style.display = 'flex';
}

function setupReportSender() {
  if (!sendReportBtn) return;

  sendReportBtn.addEventListener('click', () => {
    if (!selectedEventId) return;
    const evt = allEventsCache.find(e => e.event_id === selectedEventId);
    if (!evt) return;

    if (evt.report_status === 'SENT') {
      alert(`Report was already dispatched to ${evt.department || 'department'} (ID: ${evt.report_id || 'SENT'})`);
      return;
    }

    openReportPreviewModal(evt);
  });

  if (cancelReportBtn) {
    cancelReportBtn.addEventListener('click', () => {
      if (confirmReportModal) confirmReportModal.style.display = 'none';
    });
  }

  if (confirmReportModal) {
    confirmReportModal.addEventListener('click', (e) => {
      if (e.target === confirmReportModal) {
        confirmReportModal.style.display = 'none';
      }
    });
  }

  if (confirmSendReportBtn) {
    confirmSendReportBtn.addEventListener('click', async () => {
      if (confirmReportModal) confirmReportModal.style.display = 'none';
      await dispatchReportForSelectedEvent();
    });
  }
}

async function dispatchReportForSelectedEvent() {
  if (!selectedEventId) return;
  const evt = allEventsCache.find(e => e.event_id === selectedEventId);
  if (!evt) return;

  sendReportBtn.disabled = true;
  if (sendReportSpinner) sendReportSpinner.style.display = 'inline-block';
  if (sendReportBtnText) sendReportBtnText.textContent = 'Dispatching to Department...';
  if (reportFeedback) reportFeedback.style.display = 'none';

  try {
    const notes = reportNotesInput ? reportNotesInput.value.trim() : '';
    const res = await fetch('/api/admin/reports/send', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        event_id: selectedEventId,
        notes: notes
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      evt.report_status = 'SENT';
      evt.report_id = data.report_id;

      // Update Drawer State
      if (detailReportStatusBadge) {
        detailReportStatusBadge.textContent = 'SENT';
        detailReportStatusBadge.style.background = 'var(--color-primary-light)';
        detailReportStatusBadge.style.color = 'var(--color-primary)';
        detailReportStatusBadge.style.border = '1px solid var(--color-primary-border)';
      }
      if (sendReportBtnText) sendReportBtnText.textContent = `✓ Report Dispatched to ${data.department || 'Dept'} (${data.report_id})`;
      sendReportBtn.disabled = true;
      sendReportBtn.style.opacity = '0.75';

      if (reportFeedback) {
        reportFeedback.style.display = 'block';
        reportFeedback.style.background = 'var(--color-primary-light)';
        reportFeedback.style.color = 'var(--color-primary)';
        reportFeedback.style.border = '1px solid var(--color-primary-border)';
        reportFeedback.textContent = `✓ Successfully dispatched GIS Report to ${data.department} (ID: ${data.report_id})`;
      }

      renderEventsTable(allEventsCache);
      await fetchStats();
    } else {
      if (reportFeedback) {
        reportFeedback.style.display = 'block';
        reportFeedback.style.background = 'var(--color-offline-bg)';
        reportFeedback.style.color = 'var(--color-offline)';
        reportFeedback.style.border = '1px solid var(--color-offline-border)';
        reportFeedback.textContent = data.error || 'Failed to dispatch report to department';
      }
      sendReportBtn.disabled = false;
      if (sendReportBtnText) sendReportBtnText.textContent = `📤 Send Report to ${evt.department || 'Department'}`;
    }
  } catch (err) {
    if (reportFeedback) {
      reportFeedback.style.display = 'block';
      reportFeedback.style.background = 'var(--color-offline-bg)';
      reportFeedback.style.color = 'var(--color-offline)';
      reportFeedback.style.border = '1px solid var(--color-offline-border)';
      reportFeedback.textContent = 'Network error while dispatching report';
    }
    sendReportBtn.disabled = false;
    if (sendReportBtnText) sendReportBtnText.textContent = `📤 Send Report to ${evt.department || 'Department'}`;
  } finally {
    if (sendReportSpinner) sendReportSpinner.style.display = 'none';
  }
}

// ==============================================================================
// 10. REAL-TIME SOCKET.IO LISTENERS
// ==============================================================================
function setupSocketListeners() {
  socket.on('connect', () => {
    if (adminServerDot) adminServerDot.className = 'status-dot active';
    if (adminServerText) adminServerText.textContent = 'SERVER: ONLINE';
  });

  socket.on('disconnect', () => {
    if (adminServerDot) adminServerDot.className = 'status-dot';
    if (adminServerText) adminServerText.textContent = 'SERVER: RECONNECTING...';
  });

  socket.on('db-status', ({ configured }) => {
    if (configured) {
      adminDbDot.className = 'status-dot active';
      adminDbText.textContent = 'DB: SYNCED';
    } else {
      adminDbDot.className = 'status-dot';
      adminDbText.textContent = 'DB: LOCAL';
    }
  });

  // Dynamic ingestion of newly finalized edge events!
  socket.on('edge-event-detected', async (newEvent) => {
    if (!hasAdminPortalRequirements(newEvent)) {
      console.log('[Admin Portal] Real-time edge event skipped (lacks GPS or frame image):', newEvent?.event_id);
      return;
    }
    console.log('[Admin Portal] Real-time edge event detected:', newEvent.event_id);
    await fetchStats();
    await fetchAndRenderEvents();
    if (newEvent.event_id && allEventsCache.some(e => e.event_id === newEvent.event_id)) {
      selectEventById(newEvent.event_id, true);
    }
  });

  socket.on('event-status-updated', ({ event_id, status }) => {
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.status = status;
      renderEventsTable(allEventsCache);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
  });

  // Verification real-time synchronization
  socket.on('event-verified', ({ event_id, verified_by, verified_at }) => {
    console.log('[Admin Portal] Real-time event verified:', event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.verification_status = 'VERIFIED';
      evt.is_active = true;
      evt.verified_by = verified_by;
      evt.verified_at = verified_at;
      renderEventsTable(allEventsCache);
      updateSingleMapMarker(evt);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
  });

  socket.on('event-rejected', ({ event_id, rejected_by, rejected_at, rejection_reason }) => {
    console.log('[Admin Portal] Real-time event rejected:', event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.verification_status = 'REJECTED';
      evt.is_active = false;
      evt.rejected_by = rejected_by;
      evt.rejected_at = rejected_at;
      evt.rejection_reason = rejection_reason;
      updateSingleMapMarker(evt);
      if (currentVerificationFilter !== 'all' && currentVerificationFilter !== 'REJECTED') {
        allEventsCache = allEventsCache.filter(e => e.event_id !== event_id);
      }
      renderEventsTable(allEventsCache);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
  });

  // Real-time listener for dispatched department reports
  socket.on('department-report-sent', ({ report_id, event_id, department, status }) => {
    console.log('[Admin Portal] Real-time department report dispatched:', report_id, event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.report_status = status || 'SENT';
      evt.report_id = report_id;
      renderEventsTable(allEventsCache);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
  });
}

// ==============================================================================
// 11. IMAGE MODAL PREVIEW
// ==============================================================================
function setupImageModal() {
  if (detailEvidenceImg && imageModal && modalImg && closeModalBtn) {
    detailEvidenceImg.addEventListener('click', () => {
      if (detailEvidenceImg.src) {
        modalImg.src = detailEvidenceImg.src;
        imageModal.style.display = 'flex';
      }
    });

    closeModalBtn.addEventListener('click', () => {
      imageModal.style.display = 'none';
    });

    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) {
        imageModal.style.display = 'none';
      }
    });
  }
}

// ==============================================================================
// 12. DEPARTMENT & ANALYTICS VIEWS HELPERS
// ==============================================================================
function renderDepartmentBreakdown(byDept) {
  const container = document.getElementById('deptCardsContainer');
  if (!container) return;

  const defaultDepts = [
    { name: 'ROAD MAINTENANCE', icon: '🚧', desc: 'Potholes, surface cracks, dividers' },
    { name: 'TRAFFIC', icon: '🚦', desc: 'Signboards, congestion, bottlenecks' },
    { name: 'POLICE', icon: '🚓', desc: 'Rash driving, hit-and-run, pedestrian safety' },
    { name: 'MUNICIPAL', icon: '🌊', desc: 'Waterlogging, drainage overflow' }
  ];

  container.innerHTML = defaultDepts.map(dept => {
    const count = byDept[dept.name] || 0;
    return `
      <div class="stat-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="stat-label">${dept.name}</span>
          <span style="font-size: 1.25rem;">${dept.icon}</span>
        </div>
        <span class="stat-value" style="color: var(--color-primary);">${count}</span>
        <span class="stat-desc">${dept.desc}</span>
      </div>
    `;
  }).join('');
}

function renderAnalyticsBreakdown(stats) {
  const container = document.getElementById('analyticsCardsContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">TOTAL RECORDED DEFECTS</span>
      <span class="stat-value">${stats.total_events || 0}</span>
      <span class="stat-desc">Aggregated across all sensing sessions</span>
    </div>
    <div class="stat-card critical">
      <span class="stat-label">CRITICAL REPAIR REQUIRED</span>
      <span class="stat-value" style="color: var(--color-offline);">${stats.critical_events || 0}</span>
      <span class="stat-desc">Priority repair candidate list</span>
    </div>
    <div class="stat-card road">
      <span class="stat-label">ACTIVE ROAD DEFECTS</span>
      <span class="stat-value" style="color: #16A34A;">${stats.road_problems || 0}</span>
      <span class="stat-desc">Road & Infrastructure category</span>
    </div>
    <div class="stat-card high">
      <span class="stat-label">TRIAGE QUEUE (NEW)</span>
      <span class="stat-value" style="color: #D97706;">${stats.new_events || 0}</span>
      <span class="stat-desc">Awaiting department dispatch</span>
    </div>
  `;
}
