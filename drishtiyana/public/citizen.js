/**
 * DRISHTIYANA - CITIZEN BUS TRACKING PORTAL
 * Light Theme, OpenStreetMap GIS, and Strict Active Telemetry Validation
 */

(function () {
  'use strict';

  // State
  let citizenLat = null;
  let citizenLon = null;
  let isSimulated = false;
  let watchId = null;
  let pollingTimer = null;
  let socket = null;
  let map = null;
  let citizenMarker = null;
  let radiusCircle = null;
  const busMarkers = new Map();
  let currentBuses = [];

  // Default coordinate (CBIT Gandipet, Hyderabad)
  const DEFAULT_LAT = 17.391640;
  const DEFAULT_LON = 78.319720;

  // DOM Elements
  const elLocBadge = document.getElementById('locAccessBadge');
  const elLatDisplay = document.getElementById('locLatDisplay');
  const elLonDisplay = document.getElementById('locLonDisplay');
  const elNearbyContainer = document.getElementById('nearbyBusesContainer');
  const elNoBusesState = document.getElementById('noBusesState');
  const elNearbyCount = document.getElementById('nearbyCountBadge');
  const elBtnRecenter = document.getElementById('btnRecenter');
  const elBtnRefresh = document.getElementById('btnRefreshBuses');
  const elBtnLogout = document.getElementById('btnLogout');

  // 1. Authenticate Citizen
  async function checkAuth() {
    try {
      const resp = await fetch('/api/citizen/check', { credentials: 'include' });
      const data = await resp.json();
      if (!resp.ok || !data.authenticated) {
        window.location.href = '/citizen-login';
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Citizen Auth] Session check error:', err);
      window.location.href = '/citizen-login';
      return false;
    }
  }

  // 2. Initialize Leaflet Map with OpenStreetMap Standard Tiles
  function initMap() {
    const initialLat = citizenLat || DEFAULT_LAT;
    const initialLon = citizenLon || DEFAULT_LON;

    map = L.map('citizenMap', {
      zoomControl: true,
      attributionControl: true
    }).setView([initialLat, initialLon], 14);

    // Standard OpenStreetMap Tiles (Light theme, completely free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Citizen Location Marker
    const citizenIcon = L.divIcon({
      className: 'leaflet-div-icon',
      html: `
        <div class="citizen-pulse-marker">
          <div class="citizen-pulse-wave"></div>
          <div class="citizen-pulse-core"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    citizenMarker = L.marker([initialLat, initialLon], {
      icon: citizenIcon,
      zIndexOffset: 1000
    }).addTo(map);

    citizenMarker.bindPopup(`
      <div style="font-weight: 700; font-size: 0.88rem; color: #0F172A; margin-bottom: 2px;">📍 Your Location</div>
      <div style="font-size: 0.76rem; color: #64748B;">Tracking buses within 2.0 KM geofence</div>
    `);

    // 2 KM Radius Circle (2000 meters)
    radiusCircle = L.circle([initialLat, initialLon], {
      radius: 2000,
      color: '#15803D',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#22C55E',
      fillOpacity: 0.08
    }).addTo(map);

    // On-Map Legend
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'citizen-map-legend');
      div.innerHTML = `
        <div class="legend-row">
          <div class="legend-icon-user"></div>
          <span>Your Location</span>
        </div>
        <div class="legend-row">
          <div class="legend-icon-radius"></div>
          <span>2 KM Coverage Radius</span>
        </div>
        <div class="legend-row">
          <span class="legend-icon-bus">🚌</span>
          <span>Active Commuter Bus</span>
        </div>
      `;
      return div;
    };
    legend.addTo(map);
  }

  // Update Citizen Coordinates
  function updateCitizenPosition(lat, lon, isPermitted = true) {
    citizenLat = lat;
    citizenLon = lon;

    elLatDisplay.textContent = lat.toFixed(6);
    elLonDisplay.textContent = lon.toFixed(6);

    if (isPermitted) {
      elLocBadge.className = 'status-pill active';
      elLocBadge.textContent = 'Active';
    }

    if (citizenMarker) {
      citizenMarker.setLatLng([lat, lon]);
    }
    if (radiusCircle) {
      radiusCircle.setLatLng([lat, lon]);
    }

    // Refresh buses with new coordinates
    fetchNearbyBuses();
  }

  // 3. Geolocation Access
  function initGeolocation() {
    if (!('geolocation' in navigator)) {
      setFallbackLocation('Unsupported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCitizenPosition(pos.coords.latitude, pos.coords.longitude, true);
        if (map) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        }
      },
      (err) => {
        console.warn('[Citizen GPS] Initial position error:', err.message);
        setFallbackLocation('Denied / Unavailable');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isSimulated) {
          updateCitizenPosition(pos.coords.latitude, pos.coords.longitude, true);
        }
      },
      (err) => {
        console.warn('[Citizen GPS] Watch error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  function setFallbackLocation(statusText) {
    elLocBadge.className = 'status-pill pending';
    elLocBadge.textContent = statusText || 'Default Fix';
    updateCitizenPosition(DEFAULT_LAT, DEFAULT_LON, false);
  }

  // 4. Fetch Nearby Active Buses (Strict 2 KM & Active Source Rule)
  async function fetchNearbyBuses() {
    if (citizenLat === null || citizenLon === null) {
      renderBuses([]);
      return;
    }

    try {
      const resp = await fetch(`/api/citizen/nearby-buses?lat=${citizenLat}&lon=${citizenLon}`, {
        credentials: 'include'
      });

      if (!resp.ok) {
        if (resp.status === 401) window.location.href = '/citizen-login';
        return;
      }

      const data = await resp.json();
      if (data.success && Array.isArray(data.buses)) {
        currentBuses = data.buses;
        renderBuses(currentBuses);
        updateMapBusMarkers(currentBuses);
      } else {
        renderBuses([]);
        updateMapBusMarkers([]);
      }
    } catch (err) {
      console.warn('[Citizen Portal] Error fetching buses:', err);
    }
  }

  // 5. Render Buses in Sidebar
  function renderBuses(buses) {
    elNearbyCount.textContent = `${buses.length} ${buses.length === 1 ? 'Bus' : 'Buses'}`;

    // CRITICAL: If no active buses exist, show "No buses available" card
    if (!buses || buses.length === 0) {
      elNearbyContainer.innerHTML = '';
      elNoBusesState.style.display = 'flex';
      return;
    }

    elNoBusesState.style.display = 'none';

    elNearbyContainer.innerHTML = buses.map(bus => {
      const busId = bus.bus_id || bus.busId || 'BUS-001';
      const source = bus.source || 'CBIT';
      const destination = bus.destination || 'Secunderabad';
      const dist = bus.distance_km !== undefined ? bus.distance_km : bus.distanceKm;
      const distStr = dist < 1.0
        ? `${Math.round(dist * 1000)} M away`
        : `${dist.toFixed(1)} KM away`;

      const secondsAgo = bus.seconds_ago !== undefined ? bus.seconds_ago : 0;

      return `
        <div class="bus-card" data-bus-id="${busId}">
          <div class="bus-card-top">
            <div class="bus-id-title">🚌 ${busId}</div>
            <span class="bus-live-pill"><span class="dot"></span> LIVE</span>
          </div>
          <div class="bus-route-text">
            <span>${source}</span>
            <span class="arrow">&rarr;</span>
            <span>${destination}</span>
          </div>
          <div class="bus-card-footer">
            <span class="bus-dist-tag">${distStr}</span>
            <span>Updated ${secondsAgo}s ago</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    document.querySelectorAll('.bus-card').forEach(card => {
      card.addEventListener('click', () => {
        const busId = card.getAttribute('data-bus-id');
        focusBusOnMap(busId);
      });
    });
  }

  // 6. Update Map Markers
  function updateMapBusMarkers(buses) {
    if (!map) return;

    const activeBusIds = new Set(buses.map(b => b.bus_id || b.busId));

    // Remove inactive/stale buses that are no longer in active list
    for (const [id, marker] of busMarkers.entries()) {
      if (!activeBusIds.has(id)) {
        map.removeLayer(marker);
        busMarkers.delete(id);
      }
    }

    // Add or update markers for active buses
    buses.forEach(bus => {
      const busId = bus.bus_id || bus.busId;
      const dist = bus.distance_km !== undefined ? bus.distance_km : bus.distanceKm;
      const distStr = dist < 1.0 ? `${Math.round(dist * 1000)} M away` : `${dist.toFixed(1)} KM away`;
      const source = bus.source || 'CBIT';
      const destination = bus.destination || 'Secunderabad';
      const secondsAgo = bus.seconds_ago !== undefined ? bus.seconds_ago : 0;

      const popupContent = `
        <div class="popup-bus-title">🚌 ${busId}</div>
        <div class="popup-bus-route">${source} &rarr; ${destination}</div>
        <div class="popup-bus-info">
          <div><strong>Distance:</strong> ${distStr}</div>
          <div><strong>Status:</strong> ● LIVE</div>
          <div><strong>Updated:</strong> ${secondsAgo}s ago</div>
        </div>
      `;

      if (busMarkers.has(busId)) {
        const marker = busMarkers.get(busId);
        marker.setLatLng([bus.latitude, bus.longitude]);
        marker.setPopupContent(popupContent);
      } else {
        const busIcon = L.divIcon({
          className: 'leaflet-div-icon',
          html: `<div class="bus-pin-label">🚌 ${busId}</div>`,
          iconSize: [80, 26],
          iconAnchor: [40, 13]
        });

        const marker = L.marker([bus.latitude, bus.longitude], { icon: busIcon })
          .bindPopup(popupContent)
          .addTo(map);

        busMarkers.set(busId, marker);
      }
    });
  }

  // Center on specific bus
  function focusBusOnMap(busId) {
    const marker = busMarkers.get(busId);
    if (marker && map) {
      map.flyTo(marker.getLatLng(), 15, { animate: true, duration: 0.8 });
      marker.openPopup();

      document.querySelectorAll('.bus-card').forEach(c => c.classList.remove('active-selected'));
      const activeCard = document.querySelector(`.bus-card[data-bus-id="${busId}"]`);
      if (activeCard) {
        activeCard.classList.add('active-selected');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // 7. Real-Time Socket.IO
  function initSocket() {
    if (typeof io === 'undefined') return;

    socket = io();

    // When new bus telemetry is received, re-query nearby buses
    socket.on('citizen-bus-location', () => {
      fetchNearbyBuses();
    });

    // When a bus session stops
    socket.on('citizen-bus-stale', () => {
      fetchNearbyBuses();
    });
  }

  // 8. Event Handlers
  function bindEvents() {
    // Recenter map on citizen
    elBtnRecenter.addEventListener('click', () => {
      if (citizenLat !== null && citizenLon !== null && map) {
        map.flyTo([citizenLat, citizenLon], 14, { animate: true, duration: 0.8 });
        if (citizenMarker) citizenMarker.openPopup();
      }
    });

    // Refresh buses button
    elBtnRefresh.addEventListener('click', () => {
      fetchNearbyBuses();
    });

    // Prototype preset coordinate buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.getAttribute('data-lat'));
        const lon = parseFloat(btn.getAttribute('data-lon'));
        isSimulated = true;
        updateCitizenPosition(lat, lon, true);
        if (map) {
          map.flyTo([lat, lon], 14);
        }
      });
    });

    // Logout button
    elBtnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/citizen/logout', { method: 'POST', credentials: 'include' });
      } catch (e) {
        // ignore
      }
      window.location.href = '/citizen-login';
    });
  }

  // 9. Startup Lifecycle
  async function init() {
    const isAuthed = await checkAuth();
    if (!isAuthed) return;

    initMap();
    initGeolocation();
    initSocket();
    bindEvents();

    // 3-second lightweight polling
    pollingTimer = setInterval(fetchNearbyBuses, 3000);
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (pollingTimer !== null) clearInterval(pollingTimer);
    if (socket) socket.disconnect();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
