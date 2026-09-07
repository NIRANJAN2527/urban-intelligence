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

// DOM Elements - Navigation & Stats
const adminTotalEventsBadge = document.getElementById('adminTotalEventsBadge');
const adminDbBadge = document.getElementById('adminDbBadge');
const adminDbDot = document.getElementById('adminDbDot');
const adminDbText = document.getElementById('adminDbText');
const adminServerBadge = document.getElementById('adminServerBadge');
const adminServerDot = document.getElementById('adminServerDot');
const adminServerText = document.getElementById('adminServerText');

const statTotalEvents = document.getElementById('statTotalEvents');
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
const detailEvidenceImg = document.getElementById('detailEvidenceImg');
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

// DOM Elements - Filter Bar
const filterSearchInput = document.getElementById('filterSearchInput');
const filterCategorySelect = document.getElementById('filterCategorySelect');
const filterRiskSelect = document.getElementById('filterRiskSelect');
const filterPrioritySelect = document.getElementById('filterPrioritySelect');
const filterStatusSelect = document.getElementById('filterStatusSelect');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const refreshEventsBtn = document.getElementById('refreshEventsBtn');
const recenterAdminMapBtn = document.getElementById('recenterAdminMapBtn');

// DOM Elements - Table
const eventsTableBody = document.getElementById('eventsTableBody');
const tableEmptyState = document.getElementById('tableEmptyState');

// Modal Elements
const imageModal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImg');
const closeModalBtn = document.getElementById('closeModalBtn');

// ==============================================================================
// 2. INITIALIZATION ON LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  initGisMap();
  setupSidebarNavigation();
  setupFilterListeners();
  setupSocketListeners();
  setupImageModal();

  await fetchStats();
  await fetchAndRenderEvents();
});

// ==============================================================================
// 3. LEAFLET GIS MAP INITIALIZATION
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
    attributionControl: false
  }).setView(defaultCenter, 12);

  // Modern clean Positron light map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(leafletMap);

  if (recenterAdminMapBtn) {
    recenterAdminMapBtn.addEventListener('click', () => {
      fitMapToMarkers();
    });
  }

  setTimeout(() => leafletMap.invalidateSize(), 400);
}

function createCategoryIcon(category, problem, riskLevel) {
  let catClass = 'road';
  let iconEmoji = '🚧';

  const catNorm = (category || '').toLowerCase();
  if (catNorm.includes('traffic')) {
    catClass = 'traffic';
    iconEmoji = '🚦';
  } else if (catNorm.includes('safety')) {
    catClass = 'safety';
    iconEmoji = '🛡️';
  }

  const isCritical = (riskLevel || '').toUpperCase() === 'CRITICAL';
  const criticalClass = isCritical ? 'critical' : '';

  return L.divIcon({
    className: 'gis-marker-container',
    html: `
      <div class="gis-marker-pin ${catClass} ${criticalClass}" title="${problem || 'Defect'} (${riskLevel || 'Risk'})">
        ${iconEmoji}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

function fitMapToMarkers() {
  if (!leafletMap || mapMarkersMap.size === 0) {
    if (leafletMap) leafletMap.setView([17.385044, 78.486671], 12);
    return;
  }

  const group = L.featureGroup(Array.from(mapMarkersMap.values()));
  leafletMap.fitBounds(group.getBounds().pad(0.2));
}

// ==============================================================================
// 4. DATA FETCHING & RENDERING
// ==============================================================================
async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.stats) return;

    const s = data.stats;
    if (statTotalEvents) statTotalEvents.textContent = s.total_events || 0;
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

async function fetchAndRenderEvents() {
  try {
    const params = new URLSearchParams();
    const cat = filterCategorySelect.value;
    const risk = filterRiskSelect.value;
    const prio = filterPrioritySelect.value;
    const stat = filterStatusSelect.value;
    const q = filterSearchInput.value.trim();

    if (cat !== 'all') params.append('category', cat);
    if (risk !== 'all') params.append('risk_level', risk);
    if (prio !== 'all') params.append('priority', prio);
    if (stat !== 'all') params.append('status', stat);
    if (q) params.append('search', q);

    const url = `/api/admin/events?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    allEventsCache = data.events || [];

    renderEventsTable(allEventsCache);
    renderMapMarkers(allEventsCache);

    if (mapEventCountBadge) {
      mapEventCountBadge.textContent = `${allEventsCache.length} pin${allEventsCache.length === 1 ? '' : 's'}`;
    }
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
    if (evt.latitude === null || evt.longitude === null) return;
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    validCoordsCount++;
    const icon = createCategoryIcon(evt.category, evt.problem, evt.risk_level);
    const marker = L.marker([lat, lon], { icon }).addTo(leafletMap);

    // Popup content with thumbnail
    const confPct = Math.round((evt.confidence || 0) * 100);
    const imgHtml = evt.evidence_image_url
      ? `<img src="${evt.evidence_image_url}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;">`
      : '';

    marker.bindPopup(`
      <div style="font-family: var(--font-sans, sans-serif); font-size: 12px; min-width: 190px; line-height: 1.4;">
        ${imgHtml}
        <strong style="color: var(--color-primary, #15803D); font-size: 13px;">${evt.problem || 'Defect'}</strong>
        <div style="color: #64748B; font-size: 11px;">${evt.category || 'Road'} &bull; ${confPct}%</div>
        <div style="margin-top: 4px;">
          <strong>Risk:</strong> ${evt.risk_level || 'MED'} (${evt.risk_score || 50}/100)<br>
          <strong>Priority:</strong> ${evt.priority || 'MEDIUM'}<br>
          <strong>Bus:</strong> ${evt.bus_id || 'BUS-101'}
        </div>
        <button onclick="selectEventById('${evt.event_id}')" style="margin-top: 8px; width: 100%; padding: 4px 8px; background: #15803D; color: #fff; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
          Inspect Full Details
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

    let riskBadgeClass = 'badge-risk-medium';
    if (rLvl === 'CRITICAL') riskBadgeClass = 'badge-risk-critical';
    else if (rLvl === 'HIGH') riskBadgeClass = 'badge-risk-high';
    else if (rLvl === 'LOW') riskBadgeClass = 'badge-risk-low';

    let statClass = 'status-new';
    if (stat === 'ASSIGNED') statClass = 'status-assigned';
    else if (stat === 'IN_PROGRESS') statClass = 'status-in_progress';
    else if (stat === 'RESOLVED') statClass = 'status-resolved';

    const latLonText = (evt.latitude && evt.longitude)
      ? `${evt.latitude.toFixed(4)}, ${evt.longitude.toFixed(4)}`
      : 'No GPS';

    const timeText = evt.created_at
      ? new Date(evt.created_at).toISOString().slice(0, 19).replace('T', ' ')
      : '--';

    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); font-size: 0.8rem;">${evt.event_id}</strong></td>
      <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${evt.category || 'Road'}</span></td>
      <td><strong>${evt.problem || evt.class_name || 'Pothole'}</strong></td>
      <td style="font-family: var(--font-mono); font-weight: 600; color: var(--color-primary);">${confPct}%</td>
      <td><span class="${riskBadgeClass}">${rLvl} (${evt.risk_score || 0})</span></td>
      <td><strong>${prio}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 0.78rem;">${latLonText}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${timeText}</td>
      <td><span class="badge">${evt.bus_id || 'BUS-101'}</span></td>
      <td><span class="badge-dept">${evt.department || 'ROAD MAINTENANCE'}</span></td>
      <td><span class="badge-status ${statClass}">${stat}</span></td>
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

  // Populate Details Panel
  detailPlaceholder.style.display = 'none';
  detailContent.style.display = 'flex';

  // Status Badge
  const stat = (evt.status || 'NEW').toUpperCase();
  detailStatusBadge.textContent = stat;
  detailStatusBadge.className = `badge badge-status status-${stat.toLowerCase()}`;
  if (detailStatusSelect) detailStatusSelect.value = stat;

  // Evidence Image
  if (evt.evidence_image_url) {
    detailEvidenceImg.src = evt.evidence_image_url;
    detailEvidenceImg.style.display = 'block';
    detailEvidenceTag.textContent = `OBSERVED ${evt.observation_count || 1}X (BEST FRAME)`;
  } else {
    detailEvidenceImg.style.display = 'none';
    detailEvidenceTag.textContent = 'NO EVIDENCE FRAME';
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

  // Field Attributes
  detailEvtId.textContent = evt.event_id || '--';
  detailConf.textContent = `${Math.round((evt.confidence || 0) * 100)}%`;
  detailProblem.textContent = evt.problem || 'Pothole';
  detailObservations.textContent = `${evt.observation_count || 1} frame(s)`;
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
}

// Make selectEventById globally callable from Leaflet popup buttons
window.selectEventById = selectEventById;

async function resolveAddress(lat, lon) {
  const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if (clientAddressCache.has(cacheKey)) {
    return clientAddressCache.get(cacheKey);
  }

  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
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

// ==============================================================================
// 9. FILTER LISTENERS
// ==============================================================================
function setupFilterListeners() {
  [filterCategorySelect, filterRiskSelect, filterPrioritySelect, filterStatusSelect].forEach(select => {
    select.addEventListener('change', () => fetchAndRenderEvents());
  });

  let debounceTimer;
  filterSearchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchAndRenderEvents(), 300);
  });

  clearFiltersBtn.addEventListener('click', () => {
    filterSearchInput.value = '';
    filterCategorySelect.value = 'all';
    filterRiskSelect.value = 'all';
    filterPrioritySelect.value = 'all';
    filterStatusSelect.value = 'all';
    fetchAndRenderEvents();
  });

  refreshEventsBtn.addEventListener('click', async () => {
    refreshEventsBtn.disabled = true;
    refreshEventsBtn.textContent = 'Refreshing...';
    await fetchStats();
    await fetchAndRenderEvents();
    refreshEventsBtn.disabled = false;
    refreshEventsBtn.textContent = '🔄 Refresh Data';
  });

  // Status Changer
  if (detailStatusSelect) {
    detailStatusSelect.addEventListener('change', async () => {
      if (!selectedEventId) return;
      const newStatus = detailStatusSelect.value;
      try {
        const res = await fetch(`/api/admin/events/${selectedEventId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
    console.log('[Admin Portal] Real-time edge event detected:', newEvent.event_id);
    await fetchStats();
    await fetchAndRenderEvents();
    if (newEvent.event_id) {
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
