// DRISHTIYANA - Edge Monitor Station (Viewer)
// Feature 1: WebRTC Receiver & Live Stream Display (Muted Autoplay Fix)
// Feature 2: Real-time GPS Telemetry & Synchronized UTC Timestamps
// Feature 3: Interactive Real-Time GIS Map (Leaflet.js + CartoDB Dark Matter)

const ROOM_ID = 'BUS-101';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

// DOM Elements
const remoteVideo = document.getElementById('remoteVideo');
const monitorPlaceholder = document.getElementById('monitorPlaceholder');
const placeholderStatusTitle = document.getElementById('placeholderStatusTitle');
const placeholderStatusDesc = document.getElementById('placeholderStatusDesc');
const monitorHud = document.getElementById('monitorHud');
const hudBusSession = document.getElementById('hudBusSession');
const resolutionHud = document.getElementById('resolutionHud');
const unmutePlayBtn = document.getElementById('unmutePlayBtn');

const sessionBadge = document.getElementById('sessionBadge');
const dbStatusBadge = document.getElementById('dbStatusBadge');
const dbDot = document.getElementById('dbDot');
const dbStatusText = document.getElementById('dbStatusText');
const signalingBadge = document.getElementById('signalingBadge');
const signalingDot = document.getElementById('signalingDot');
const signalingStatusText = document.getElementById('signalingStatusText');

const videoDot = document.getElementById('videoDot');
const videoText = document.getElementById('videoText');
const gpsDot = document.getElementById('gpsDot');
const gpsText = document.getElementById('gpsText');
const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');
const p2pStatusVal = document.getElementById('p2pStatusVal');

const videoTimeVal = document.getElementById('videoTimeVal');
const gpsTimeVal = document.getElementById('gpsTimeVal');
const latVal = document.getElementById('latVal');
const lonVal = document.getElementById('lonVal');
const accVal = document.getElementById('accVal');
const speedVal = document.getElementById('speedVal');
const headingVal = document.getElementById('headingVal');
const syncLagVal = document.getElementById('syncLagVal');

const mapStatusDot = document.getElementById('mapStatusDot');
const mapStatusText = document.getElementById('mapStatusText');
const recenterMapBtn = document.getElementById('recenterMapBtn');
const toggleFollowBtn = document.getElementById('toggleFollowBtn');

const viewerAlert = document.getElementById('viewerAlert');
const viewerAlertText = document.getElementById('viewerAlertText');

// State Variables
let socket = null;
let peerConnection = null;
let iceCandidateQueue = [];
let currentSessionId = null;
let videoStartedAt = null;
let videoClockInterval = null;
let latestGpsTimestampMs = null;

// GIS Map State Variables
let leafletMap = null;
let busMarker = null;
let busAccuracyCircle = null;
let routePolyline = null;
let isFollowBusEnabled = true;
let hasFirstGpsFix = false;
let currentBusCoords = null;

// Format Date object to "YYYY-MM-DD HH:MM:SS" (UTC)
function formatUtcFull(dateOrStr) {
  if (!dateOrStr) return '----:--:-- --:--:--';
  const d = new Date(dateOrStr);
  if (isNaN(d.getTime())) return '----:--:-- --:--:--';
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

// 1. Initialize Interactive Leaflet GIS Map
function initGisMap() {
  if (!window.L) {
    console.warn('[GIS Map] Leaflet library not loaded yet, retrying...');
    setTimeout(initGisMap, 300);
    return;
  }

  try {
    // Default center (India) until GPS lock is obtained
    const defaultCenter = [17.385044, 78.486671]; // Hyderabad default or central India

    leafletMap = L.map('busMap', {
      zoomControl: true,
      attributionControl: false
    }).setView(defaultCenter, 13);

    // CartoDB Dark Matter High-Tech Map Tiles (free, fast, beautiful dark theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(leafletMap);

    // Custom SVG Bus Icon with Neon Cyan Pulsing Pin
    const busIcon = L.divIcon({
      className: 'bus-gis-marker-container',
      html: `
        <div class="bus-pulse-ring"></div>
        <div class="bus-icon-badge">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ffffff" stroke-width="2">
            <rect x="3" y="4" width="18" height="13" rx="2"></rect>
            <path d="M16 2v2M8 2v2M4 11h16"></path>
            <circle cx="7.5" cy="14.5" r="1.5" fill="#fff"></circle>
            <circle cx="16.5" cy="14.5" r="1.5" fill="#fff"></circle>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });

    // Create marker and route polyline
    busMarker = L.marker(defaultCenter, { icon: busIcon }).addTo(leafletMap);
    busMarker.bindPopup('<div style="font-family: sans-serif; font-size: 13px;"><strong>DRISHTIYANA BUS-101</strong><br>Waiting for mobile GPS telemetry...</div>');

    // Route breadcrumb trail
    routePolyline = L.polyline([], {
      color: '#06b6d4',
      weight: 4,
      opacity: 0.9,
      dashArray: '2, 6'
    }).addTo(leafletMap);

    // Map UI Button Listeners
    recenterMapBtn.addEventListener('click', () => {
      if (currentBusCoords && leafletMap) {
        leafletMap.flyTo(currentBusCoords, 16, { animate: true, duration: 1 });
      }
    });

    toggleFollowBtn.addEventListener('click', () => {
      isFollowBusEnabled = !isFollowBusEnabled;
      if (isFollowBusEnabled) {
        toggleFollowBtn.className = 'map-ctrl-btn active';
        toggleFollowBtn.textContent = '🛰 Follow: ON';
        if (currentBusCoords && leafletMap) {
          leafletMap.panTo(currentBusCoords);
        }
      } else {
        toggleFollowBtn.className = 'map-ctrl-btn';
        toggleFollowBtn.textContent = '🛰 Follow: OFF';
      }
    });

    // Invalidate map size after DOM renders to ensure tiles fit cleanly
    setTimeout(() => {
      leafletMap.invalidateSize();
    }, 500);

    console.log('[GIS Map] Leaflet map initialized successfully.');
  } catch (err) {
    console.error('[GIS Map] Error initializing Leaflet map:', err);
  }
}

// 2. Synchronized Video Clock Engine
function startSynchronizedVideoClock(startIso) {
  if (videoClockInterval) clearInterval(videoClockInterval);
  const startMs = new Date(startIso).getTime();

  videoClockInterval = setInterval(() => {
    let currentVideoMs;
    if (remoteVideo && remoteVideo.srcObject && !remoteVideo.paused && remoteVideo.currentTime > 0) {
      currentVideoMs = startMs + Math.floor(remoteVideo.currentTime * 1000);
    } else {
      currentVideoMs = Date.now();
    }

    videoTimeVal.textContent = formatUtcFull(currentVideoMs);

    // Calculate correlation delta between video playback and latest GPS fix
    if (latestGpsTimestampMs) {
      const lagMs = Math.abs(currentVideoMs - latestGpsTimestampMs);
      syncLagVal.textContent = `${lagMs} ms`;
    }
  }, 250);
}

function stopSynchronizedVideoClock() {
  if (videoClockInterval) {
    clearInterval(videoClockInterval);
    videoClockInterval = null;
  }
  videoTimeVal.textContent = '----:--:-- --:--:--';
  gpsTimeVal.textContent = '----:--:-- --:--:--';
  syncLagVal.textContent = '-- ms';
}

// 3. Initialize Signaling & Real-time Telemetry via Socket.IO
function initSignaling() {
  socket = io({
    reconnectionAttempts: 20,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] Edge Monitor connected with ID:', socket.id);
    updateSignalingStatus(true, 'SERVER: CONNECTED');
    setConnectionStatus(true, 'CONNECTED');
    hideAlert();

    // Join room as viewer (Edge Monitor)
    socket.emit('join-room', { roomId: ROOM_ID, role: 'viewer' });
  });

  socket.on('disconnect', () => {
    console.warn('[Socket] Disconnected from signaling server');
    updateSignalingStatus(false, 'SERVER: DISCONNECTED');
    setConnectionStatus(false, 'DISCONNECTED');
    setVideoStatus(false, 'OFFLINE');
    setGpsStatus(false, 'OFFLINE');
    resetVideoToStandby('Signaling Server Disconnected', 'Please verify that the Node.js server is running on your laptop.');
    showAlert('Lost connection to signaling server. Auto-reconnecting...', 'danger');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err);
    updateSignalingStatus(false, 'SERVER: OFFLINE');
    setConnectionStatus(false, 'FAILED');
    showAlert('Unable to reach server. Make sure "npm start" is active in your terminal.', 'danger');
  });

  // DB Configuration status from server
  socket.on('db-status', ({ configured }) => {
    updateDbStatus(configured);
  });

  // When Phone joins room
  socket.on('peer-joined', ({ role }) => {
    console.log(`[Room] Peer joined: ${role}`);
    if (role === 'sender') {
      placeholderStatusTitle.textContent = 'Bus Sensor Connected - Ready';
      placeholderStatusDesc.textContent = 'Bus sensing unit detected! Waiting for user to tap "START BUS SENSOR" on mobile.';
      showAlert('Phone sensor connected to session. Waiting for sensor activation...', 'info');
    }
  });

  // Session Started from mobile
  socket.on('session-started', ({ session_id, bus_id, video_started_at, dbConfigured }) => {
    console.log(`[Session] Started session: ${session_id}`);
    currentSessionId = session_id;
    videoStartedAt = video_started_at;

    sessionBadge.textContent = session_id;
    sessionBadge.className = 'badge badge-primary';
    hudBusSession.textContent = `LIVE FEED \u2022 ${bus_id} (${session_id})`;

    if (dbConfigured !== undefined) updateDbStatus(dbConfigured);
    startSynchronizedVideoClock(videoStartedAt);
  });

  // Session Ended from mobile
  socket.on('session-ended', ({ session_id }) => {
    console.log(`[Session] Ended session: ${session_id}`);
    currentSessionId = null;
    sessionBadge.textContent = 'SESSION: IDLE';
    sessionBadge.className = 'badge';
    stopSynchronizedVideoClock();
    setGpsStatus(false, 'IDLE');
  });

  // Real-time GPS update broadcasted from backend
  socket.on('gps-update', (data) => {
    handleGpsUpdate(data);
  });

  // WebRTC Signaling: Receive Offer from Phone
  socket.on('offer', async ({ sdp }) => {
    console.log('[WebRTC] Received OFFER from phone');
    hideAlert();
    await handleOffer(sdp);
  });

  // WebRTC Signaling: Receive ICE Candidate
  socket.on('ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    try {
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueue.push(candidate);
      }
    } catch (err) {
      console.error('[WebRTC] Error adding received ICE candidate:', err);
    }
  });

  // Phone Camera Status changes
  socket.on('camera-status', ({ status }) => {
    console.log(`[Status] Remote camera status updated: ${status}`);
    if (status === 'LIVE') {
      setVideoStatus(true, 'LIVE');
    } else {
      setVideoStatus(false, 'OFFLINE');
      resetVideoToStandby('Camera Stopped on Mobile', 'The bus sensing unit stopped its camera stream.');
    }
  });

  // When Phone disconnects
  socket.on('peer-left', ({ role }) => {
    console.log(`[Room] Peer left: ${role}`);
    if (role === 'sender') {
      setVideoStatus(false, 'OFFLINE');
      setGpsStatus(false, 'OFFLINE');
      setP2PStatus('PEER DISCONNECTED');
      resetVideoToStandby('Mobile Device Disconnected', 'The phone closed the webpage or lost network connection.');
      showAlert('Mobile sensing unit disconnected from room.', 'warning');
    }
  });
}

// 4. Real-time GPS Telemetry & GIS Map Marker Updater
function handleGpsUpdate(data) {
  const { latitude, longitude, accuracy, speed, heading, gps_timestamp, dbConfigured } = data;

  latVal.textContent = latitude.toFixed(6);
  lonVal.textContent = longitude.toFixed(6);
  accVal.textContent = accuracy !== null ? `${accuracy.toFixed(1)} m` : 'N/A';
  speedVal.textContent = speed !== null ? `${(speed * 3.6).toFixed(1)} km/h` : '0.0 km/h';
  headingVal.textContent = heading !== null ? `${heading.toFixed(0)}\u00B0` : '--';

  latestGpsTimestampMs = new Date(gps_timestamp).getTime();
  gpsTimeVal.textContent = formatUtcFull(gps_timestamp);

  setGpsStatus(true, 'LIVE');
  if (dbConfigured !== undefined) updateDbStatus(dbConfigured);

  // Update GIS Map Position
  currentBusCoords = [latitude, longitude];

  if (leafletMap && busMarker) {
    busMarker.setLatLng(currentBusCoords);

    // Append position to the route breadcrumb polyline
    if (routePolyline) {
      routePolyline.addLatLng(currentBusCoords);
    }

    // Update Marker Popup with rich real-time metadata
    const popupContent = `
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5; color: #1e293b;">
        <strong style="color: #0891b2; font-size: 14px;">DRISHTIYANA &bull; BUS-101</strong><br>
        <strong>Session:</strong> ${currentSessionId || 'Active'}<br>
        <strong>Coords:</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>
        <strong>Speed:</strong> ${speed !== null ? (speed * 3.6).toFixed(1) : '0.0'} km/h<br>
        <strong>Accuracy:</strong> ${accuracy ? accuracy.toFixed(1) + ' m' : 'N/A'}<br>
        <strong>Time:</strong> ${new Date(gps_timestamp).toISOString().slice(11, 19)} UTC
      </div>
    `;
    busMarker.setPopupContent(popupContent);

    // If first GPS fix received, zoom in to bus location
    if (!hasFirstGpsFix) {
      leafletMap.setView(currentBusCoords, 16);
      hasFirstGpsFix = true;
    } else if (isFollowBusEnabled) {
      leafletMap.panTo(currentBusCoords);
    }

    // Update Map HUD badge
    mapStatusDot.className = 'status-dot active';
    mapStatusText.textContent = `BUS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }
}

// 5. Handle Incoming WebRTC Offer (With Muted Autoplay Resolution)
async function handleOffer(sdp) {
  try {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    iceCandidateQueue = [];

    // Robust Track Handler: Works across all browsers and engines
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Media track received:', event.track.kind);

      if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      } else {
        if (!remoteVideo.srcObject) {
          remoteVideo.srcObject = new MediaStream();
        }
        remoteVideo.srcObject.addTrack(event.track);
      }

      // CRITICAL FOR AUTOPLAY: Video must be muted to play without user gesture block!
      remoteVideo.muted = true;

      const playPromise = remoteVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[WebRTC Video] Video playback started successfully.');
            unmutePlayBtn.style.display = 'none';
          })
          .catch((err) => {
            console.warn('[WebRTC Video] Autoplay blocked, showing manual play button:', err);
            unmutePlayBtn.style.display = 'flex';
          });
      }

      monitorPlaceholder.style.display = 'none';
      monitorHud.style.display = 'flex';

      setConnectionStatus(true, 'CONNECTED');
      setVideoStatus(true, 'LIVE');
      setP2PStatus('STREAMING (P2P)');

      remoteVideo.onloadedmetadata = () => {
        if (remoteVideo.videoWidth && remoteVideo.videoHeight) {
          resolutionHud.textContent = `RES: ${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
        }
      };
    };

    // Forward ICE Candidates back to Phone
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        console.log('[WebRTC Viewer] Sending ICE candidate to phone');
        socket.emit('ice-candidate', {
          roomId: ROOM_ID,
          candidate: event.candidate
        });
      }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC Viewer Connection State]:', peerConnection.connectionState);
      const state = peerConnection.connectionState;
      if (state === 'connected') {
        setP2PStatus('CONNECTED');
        setConnectionStatus(true, 'CONNECTED');
      } else if (state === 'disconnected') {
        setP2PStatus('P2P DISCONNECTED');
      } else if (state === 'failed') {
        setP2PStatus('P2P FAILED');
        showAlert('Direct peer-to-peer connection failed. Ensure both devices are on the same Wi-Fi.', 'danger');
        resetVideoToStandby('P2P Connection Failed', 'Could not establish direct WebRTC link between devices.');
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC Viewer ICE State]:', peerConnection.iceConnectionState);
    };

    // Set Remote Description from Offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC] Remote description set from offer');

    // Drain any queued ICE candidates received before remote description was ready
    while (iceCandidateQueue.length > 0) {
      const cand = iceCandidateQueue.shift();
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.error('[WebRTC] Error adding queued ICE candidate:', e);
      }
    }

    // Create & Set Local Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log('[WebRTC] Sending ANSWER to phone');
    socket.emit('answer', { roomId: ROOM_ID, sdp: answer });

  } catch (err) {
    console.error('[WebRTC] Error handling offer:', err);
    showAlert(`Failed to negotiate WebRTC stream: ${err.message}`, 'danger');
  }
}

// Fallback Play Button Listener
if (unmutePlayBtn) {
  unmutePlayBtn.addEventListener('click', () => {
    remoteVideo.muted = true;
    remoteVideo.play()
      .then(() => {
        unmutePlayBtn.style.display = 'none';
      })
      .catch(e => console.error('Play click failed:', e));
  });
}

// Helper: Reset video monitor to standby view
function resetVideoToStandby(title, desc) {
  remoteVideo.srcObject = null;
  monitorPlaceholder.style.display = 'flex';
  monitorHud.style.display = 'none';
  if (title) placeholderStatusTitle.textContent = title;
  if (desc) placeholderStatusDesc.textContent = desc;
}

// UI State Management Helpers
function updateSignalingStatus(connected, text) {
  signalingBadge.className = `badge ${connected ? 'badge-live' : 'badge-offline'}`;
  signalingDot.className = `status-dot ${connected ? 'active' : ''}`;
  signalingStatusText.textContent = text;
}

function updateDbStatus(configured) {
  if (configured) {
    dbStatusBadge.className = 'badge badge-live';
    dbDot.className = 'status-dot active';
    dbStatusText.textContent = 'GPS DB: SYNCED';
  } else {
    dbStatusBadge.className = 'badge';
    dbDot.className = 'status-dot';
    dbStatusText.textContent = 'GPS DB: LOCAL';
  }
}

function setConnectionStatus(connected, text) {
  connDot.className = `status-dot ${connected ? 'active' : ''}`;
  connText.textContent = text;
}

function setVideoStatus(live, text) {
  videoDot.className = `status-dot ${live ? 'active' : ''}`;
  videoText.textContent = text;
}

function setGpsStatus(live, text) {
  gpsDot.className = `status-dot ${live ? 'active' : ''}`;
  gpsText.textContent = text;
}

function setP2PStatus(text) {
  p2pStatusVal.textContent = text;
}

function showAlert(msg, type = 'warning') {
  viewerAlert.className = `alert alert-${type}`;
  viewerAlertText.textContent = msg;
  viewerAlert.style.display = 'flex';
}

function hideAlert() {
  viewerAlert.style.display = 'none';
}

// Start GIS Map & Signaling on page load
window.addEventListener('DOMContentLoaded', () => {
  initGisMap();
  initSignaling();
});
