// DRISHTIYANA - Edge Monitor Station (Viewer)
// Mode 1: Live WebRTC Streaming & GPS Telemetry (Muted Autoplay Fix)
// Mode 2: Prerecorded Video + GPS File Upload & Synchronized Playback
// Mode 3: Interactive Real-Time GIS Map (Leaflet.js + CartoDB Dark Matter)

const ROOM_ID = 'BUS-101';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

// ==============================================================================
// DOM ELEMENTS - MODE SWITCHER
// ==============================================================================
const modeBtnLive = document.getElementById('modeBtnLive');
const modeBtnUpload = document.getElementById('modeBtnUpload');
const liveModeContainer = document.getElementById('liveModeContainer');
const uploadModeContainer = document.getElementById('uploadModeContainer');

// ==============================================================================
// DOM ELEMENTS - MODE 1: LIVE BUS SENSOR
// ==============================================================================
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

// ==============================================================================
// DOM ELEMENTS - EDGE AI PROCESSING
// ==============================================================================
const startEdgeBtn = document.getElementById('startEdgeBtn');
const stopEdgeBtn = document.getElementById('stopEdgeBtn');
const aiStatusBadge = document.getElementById('aiStatusBadge');
const aiStatusDot = document.getElementById('aiStatusDot');
const aiStatusText = document.getElementById('aiStatusText');

const aiYoloBadge = document.getElementById('aiYoloBadge');
const aiRedisBadge = document.getElementById('aiRedisBadge');
const aiServerBadge = document.getElementById('aiServerBadge');

const aiFramesVal = document.getElementById('aiFramesVal');
const aiDetectionsVal = document.getElementById('aiDetectionsVal');
const aiActiveCandidatesVal = document.getElementById('aiActiveCandidatesVal');
const aiFinalizedEventsVal = document.getElementById('aiFinalizedEventsVal');
const aiLastConfVal = document.getElementById('aiLastConfVal');
const aiCandidateObsVal = document.getElementById('aiCandidateObsVal');

const aiEvidenceBox = document.getElementById('aiEvidenceBox');
const aiEvidenceImg = document.getElementById('aiEvidenceImg');
const aiEvidenceConfBadge = document.getElementById('aiEvidenceConfBadge');
const aiEvidenceServerBadge = document.getElementById('aiEvidenceServerBadge');
const aiEvidenceRiskBadge = document.getElementById('aiEvidenceRiskBadge');
const aiEvidencePriorityBadge = document.getElementById('aiEvidencePriorityBadge');
const aiEvtIdVal = document.getElementById('aiEvtIdVal');
const aiEvtCandidateVal = document.getElementById('aiEvtCandidateVal');
const aiEvtObsVal = document.getElementById('aiEvtObsVal');
const aiEvtRiskVal = document.getElementById('aiEvtRiskVal');
const aiEvtPriorityVal = document.getElementById('aiEvtPriorityVal');
const aiEvtFrameVal = document.getElementById('aiEvtFrameVal');
const aiEvtVideoTimeVal = document.getElementById('aiEvtVideoTimeVal');
const aiEvtGpsVal = document.getElementById('aiEvtGpsVal');
const aiEvtGpsDeltaVal = document.getElementById('aiEvtGpsDeltaVal');
const aiEvtMatchStatusVal = document.getElementById('aiEvtMatchStatusVal');

// ==============================================================================
// DOM ELEMENTS - MODE 2: FILE UPLOAD
// ==============================================================================
const uploadSetupCard = document.getElementById('uploadSetupCard');
const uploadPlaybackCard = document.getElementById('uploadPlaybackCard');
const videoDropzone = document.getElementById('videoDropzone');
const gpsDropzone = document.getElementById('gpsDropzone');
const videoFileInput = document.getElementById('videoFileInput');
const gpsFileInput = document.getElementById('gpsFileInput');
const videoFileBadge = document.getElementById('videoFileBadge');
const gpsFileBadge = document.getElementById('gpsFileBadge');
const uploadBusIdInput = document.getElementById('uploadBusIdInput');
const uploadPreviewSessionId = document.getElementById('uploadPreviewSessionId');

const summaryItemVideo = document.getElementById('summaryItemVideo');
const summaryVideoText = document.getElementById('summaryVideoText');
const summaryItemGps = document.getElementById('summaryItemGps');
const summaryGpsText = document.getElementById('summaryGpsText');
const summaryStatusText = document.getElementById('summaryStatusText');

const uploadProgressBox = document.getElementById('uploadProgressBox');
const uploadProgressStepText = document.getElementById('uploadProgressStepText');
const uploadProgressPercent = document.getElementById('uploadProgressPercent');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
const uploadSubmitBtnText = document.getElementById('uploadSubmitBtnText');

// Playback Elements (Mode 2)
const playbackBusId = document.getElementById('playbackBusId');
const playbackSessionId = document.getElementById('playbackSessionId');
const uploadedVideoPlayer = document.getElementById('uploadedVideoPlayer');
const resetUploadBtn = document.getElementById('resetUploadBtn');
const recenterUploadMapBtn = document.getElementById('recenterUploadMapBtn');
const uploadMapStatusText = document.getElementById('uploadMapStatusText');
const processAiBtn = document.getElementById('processAiBtn');

const uploadVideoTimeVal = document.getElementById('uploadVideoTimeVal');
const uploadGpsTimeVal = document.getElementById('uploadGpsTimeVal');
const uploadLatVal = document.getElementById('uploadLatVal');
const uploadLonVal = document.getElementById('uploadLonVal');
const uploadAccVal = document.getElementById('uploadAccVal');
const uploadSpeedVal = document.getElementById('uploadSpeedVal');
const uploadMatchStatusVal = document.getElementById('uploadMatchStatusVal');
const uploadDeltaVal = document.getElementById('uploadDeltaVal');

// Incremental AI Progress Card Elements
const uploadAiProgressCard = document.getElementById('uploadAiProgressCard');
const uploadAiStatusBadge = document.getElementById('uploadAiStatusBadge');
const uploadAiStatusDot = document.getElementById('uploadAiStatusDot');
const uploadAiStatusBadgeText = document.getElementById('uploadAiStatusBadgeText');
const uploadAiProgressLabel = document.getElementById('uploadAiProgressLabel');
const uploadAiProgressPercent = document.getElementById('uploadAiProgressPercent');
const uploadAiProgressFill = document.getElementById('uploadAiProgressFill');
const uploadAiFramesVal = document.getElementById('uploadAiFramesVal');
const uploadAiElapsedVal = document.getElementById('uploadAiElapsedVal');
const uploadAiGpsVal = document.getElementById('uploadAiGpsVal');
const uploadAiDetectionsVal = document.getElementById('uploadAiDetectionsVal');
const uploadAiCreatedVal = document.getElementById('uploadAiCreatedVal');
const uploadAiUpdatedVal = document.getElementById('uploadAiUpdatedVal');
let aiProgressPollingTimer = null;

// ==============================================================================
// STATE VARIABLES
// ==============================================================================
let currentInputMode = 'LIVE'; // 'LIVE' or 'UPLOAD'

// Mode 1 State
let socket = null;
let peerConnection = null;
let iceCandidateQueue = [];
let currentSessionId = null;
let videoStartedAt = null;
let videoClockInterval = null;
let latestGpsTimestampMs = null;
let leafletMap = null;
let busMarker = null;
let routePolyline = null;
let isFollowBusEnabled = true;
let hasFirstGpsFix = false;
let currentBusCoords = null;

// Edge AI State
let isEdgeAiActive = false;
let edgeAiInterval = null;
let edgeFrameCounter = 0;
const EDGE_PROCESSING_FPS = 5;
let edgeProcessingLock = false;
let recentGpsBuffer = [];
let edgeAcceptedCount = 0;
let edgeTotalDetections = 0;
let edgeBestConfidence = 0.0;

// Mode 2 State
let selectedVideoFile = null;
let selectedGpsFile = null;
let uploadedSessionData = null;
let uploadedGpsRecords = [];
let uploadVideoStartMs = null;
let uploadLeafletMap = null;
let uploadBusMarker = null;
let uploadRoutePolyline = null;

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================
function formatUtcFull(dateOrStr) {
  if (!dateOrStr) return '----:--:-- --:--:--';
  const d = new Date(dateOrStr);
  if (isNaN(d.getTime())) return '----:--:-- --:--:--';
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function formatElapsed(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Generate dynamic preview session ID for upload mode
function generateUploadSessionId() {
  const dateStr = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const randNum = Math.floor(100 + Math.random() * 900);
  return `SESSION-UPLOAD-${dateStr}-${randNum}`;
}

// ==============================================================================
// 1. INPUT MODE SWITCHING
// ==============================================================================
function switchInputMode(mode) {
  currentInputMode = mode;
  if (mode === 'LIVE') {
    modeBtnLive.classList.add('active');
    modeBtnUpload.classList.remove('active');
    liveModeContainer.style.display = 'block';
    uploadModeContainer.style.display = 'none';

    // Invalidate live map size
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 300);
    }
  } else {
    modeBtnUpload.classList.add('active');
    modeBtnLive.classList.remove('active');
    liveModeContainer.style.display = 'none';
    uploadModeContainer.style.display = 'block';

    // Refresh upload preview session ID
    if (!uploadedSessionData && uploadPreviewSessionId) {
      uploadPreviewSessionId.textContent = generateUploadSessionId();
    }

    // Invalidate upload map size if active
    if (uploadLeafletMap) {
      setTimeout(() => uploadLeafletMap.invalidateSize(), 300);
    }
  }
}

modeBtnLive.addEventListener('click', () => switchInputMode('LIVE'));
modeBtnUpload.addEventListener('click', () => switchInputMode('UPLOAD'));

// ==============================================================================
// 2. MODE 1: LIVE WEBRTC & LIVE GIS MAP (PRESERVED 100%)
// ==============================================================================
function initLiveGisMap() {
  if (!window.L) {
    setTimeout(initLiveGisMap, 300);
    return;
  }

  try {
    const defaultCenter = [17.385044, 78.486671];

    leafletMap = L.map('busMap', {
      zoomControl: true,
      attributionControl: false
    }).setView(defaultCenter, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);

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

    busMarker = L.marker(defaultCenter, { icon: busIcon }).addTo(leafletMap);
    busMarker.bindPopup('<div style="font-family: sans-serif; font-size: 13px;"><strong>DRISHTIYANA BUS-101</strong><br>Live Sensing Mode</div>');

    routePolyline = L.polyline([], {
      color: '#16A34A',
      weight: 4,
      opacity: 0.9,
      dashArray: '2, 6'
    }).addTo(leafletMap);

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
        if (currentBusCoords && leafletMap) leafletMap.panTo(currentBusCoords);
      } else {
        toggleFollowBtn.className = 'map-ctrl-btn';
        toggleFollowBtn.textContent = '🛰 Follow: OFF';
      }
    });

    setTimeout(() => leafletMap.invalidateSize(), 500);
  } catch (err) {
    console.error('[Live Map Error]', err);
  }
}

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

function initSignaling() {
  socket = io({
    reconnectionAttempts: 20,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] Edge Monitor connected:', socket.id);
    updateSignalingStatus(true, 'SERVER: CONNECTED');
    setConnectionStatus(true, 'CONNECTED');
    hideAlert();
    socket.emit('join-room', { roomId: ROOM_ID, role: 'viewer' });
  });

  socket.on('disconnect', () => {
    updateSignalingStatus(false, 'SERVER: DISCONNECTED');
    setConnectionStatus(false, 'DISCONNECTED');
    setVideoStatus(false, 'OFFLINE');
    setGpsStatus(false, 'OFFLINE');
    resetVideoToStandby('Signaling Server Disconnected', 'Please verify that the Node.js server is running.');
  });

  socket.on('connect_error', () => {
    updateSignalingStatus(false, 'SERVER: OFFLINE');
    setConnectionStatus(false, 'FAILED');
  });

  socket.on('db-status', ({ configured }) => updateDbStatus(configured));

  socket.on('peer-joined', ({ role }) => {
    if (role === 'sender') {
      placeholderStatusTitle.textContent = 'Bus Sensor Connected - Ready';
      placeholderStatusDesc.textContent = 'Bus sensing unit detected! Waiting for user to tap "START BUS SENSOR" on mobile.';
    }
  });

  socket.on('session-started', ({ session_id, bus_id, video_started_at, dbConfigured }) => {
    currentSessionId = session_id;
    videoStartedAt = video_started_at;
    sessionBadge.textContent = session_id;
    sessionBadge.className = 'badge badge-primary';
    hudBusSession.textContent = `LIVE FEED \u2022 ${bus_id} (${session_id})`;
    if (dbConfigured !== undefined) updateDbStatus(dbConfigured);
    startSynchronizedVideoClock(videoStartedAt);
  });

  socket.on('session-ended', () => {
    currentSessionId = null;
    sessionBadge.textContent = 'SESSION: IDLE';
    sessionBadge.className = 'badge';
    stopSynchronizedVideoClock();
    setGpsStatus(false, 'IDLE');
  });

  socket.on('gps-update', (data) => handleLiveGpsUpdate(data));
  socket.on('edge-event-detected', (eventData) => handleEdgeEventDetected(eventData));
  socket.on('edge-pothole-detected', (eventData) => handleEdgeEventDetected(eventData));
  socket.on('edge-pothole-updated', (eventData) => handleEdgeEventUpdated(eventData));
  socket.on('video-processing-progress', (progressData) => handleVideoProcessingProgress(progressData));

  socket.on('offer', async ({ sdp }) => {
    hideAlert();
    await handleOffer(sdp);
  });

  socket.on('ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    try {
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueue.push(candidate);
      }
    } catch (err) {
      console.error('[WebRTC Candidate Error]', err);
    }
  });

  socket.on('camera-status', ({ status }) => {
    if (status === 'LIVE') {
      setVideoStatus(true, 'LIVE');
    } else {
      setVideoStatus(false, 'OFFLINE');
      resetVideoToStandby('Camera Stopped on Mobile', 'The bus sensing unit stopped its camera stream.');
    }
  });

  socket.on('peer-left', ({ role }) => {
    if (role === 'sender') {
      setVideoStatus(false, 'OFFLINE');
      setGpsStatus(false, 'OFFLINE');
      setP2PStatus('PEER DISCONNECTED');
      resetVideoToStandby('Mobile Device Disconnected', 'The phone closed the webpage or lost connection.');
    }
  });
}

function handleLiveGpsUpdate(data) {
  const { latitude, longitude, accuracy, speed, heading, gps_timestamp, dbConfigured } = data;

  latVal.textContent = latitude.toFixed(6);
  lonVal.textContent = longitude.toFixed(6);
  accVal.textContent = accuracy !== null ? `${accuracy.toFixed(1)} m` : 'N/A';
  speedVal.textContent = speed !== null ? `${(speed * 3.6).toFixed(1)} km/h` : '0.0 km/h';
  headingVal.textContent = heading !== null ? `${heading.toFixed(0)}\u00B0` : '--';

  latestGpsTimestampMs = new Date(gps_timestamp).getTime();
  gpsTimeVal.textContent = formatUtcFull(gps_timestamp);

  // Store in circular buffer for Edge AI video-to-GPS correlation
  recentGpsBuffer.push(data);
  if (recentGpsBuffer.length > 60) {
    recentGpsBuffer.shift();
  }

  setGpsStatus(true, 'LIVE');
  if (dbConfigured !== undefined) updateDbStatus(dbConfigured);

  currentBusCoords = [latitude, longitude];

  if (leafletMap && busMarker) {
    busMarker.setLatLng(currentBusCoords);
    if (routePolyline) routePolyline.addLatLng(currentBusCoords);

    busMarker.setPopupContent(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5; color: #16301F;">
        <strong style="color: #15803D; font-size: 14px;">DRISHTIYANA &bull; BUS-101</strong><br>
        <strong>Session:</strong> ${currentSessionId || 'Active'}<br>
        <strong>Coords:</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>
        <strong>Speed:</strong> ${speed !== null ? (speed * 3.6).toFixed(1) : '0.0'} km/h<br>
        <strong>Accuracy:</strong> ${accuracy ? accuracy.toFixed(1) + ' m' : 'N/A'}<br>
        <strong>Time:</strong> ${new Date(gps_timestamp).toISOString().slice(11, 19)} UTC
      </div>
    `);

    if (!hasFirstGpsFix) {
      leafletMap.setView(currentBusCoords, 16);
      hasFirstGpsFix = true;
    } else if (isFollowBusEnabled) {
      leafletMap.panTo(currentBusCoords);
    }

    mapStatusDot.className = 'status-dot active';
    mapStatusText.textContent = `BUS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }
}

async function handleOffer(sdp) {
  try {
    if (peerConnection) peerConnection.close();
    peerConnection = new RTCPeerConnection(rtcConfig);
    iceCandidateQueue = [];

    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Media track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      } else {
        if (!remoteVideo.srcObject) remoteVideo.srcObject = new MediaStream();
        remoteVideo.srcObject.addTrack(event.track);
      }

      remoteVideo.muted = true; // Essential for autoplay
      const playPromise = remoteVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => { unmutePlayBtn.style.display = 'none'; })
          .catch(() => { unmutePlayBtn.style.display = 'flex'; });
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

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('ice-candidate', { roomId: ROOM_ID, candidate: event.candidate });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === 'connected') {
        setP2PStatus('CONNECTED');
        setConnectionStatus(true, 'CONNECTED');
      } else if (state === 'failed') {
        setP2PStatus('P2P FAILED');
        resetVideoToStandby('P2P Connection Failed', 'Could not establish direct WebRTC link.');
      }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    while (iceCandidateQueue.length > 0) {
      const cand = iceCandidateQueue.shift();
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.error('[WebRTC Queue Error]', e);
      }
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { roomId: ROOM_ID, sdp: answer });

  } catch (err) {
    console.error('[WebRTC Offer Error]', err);
  }
}

if (unmutePlayBtn) {
  unmutePlayBtn.addEventListener('click', () => {
    remoteVideo.muted = true;
    remoteVideo.play().then(() => unmutePlayBtn.style.display = 'none').catch(e => console.error(e));
  });
}

function resetVideoToStandby(title, desc) {
  remoteVideo.srcObject = null;
  monitorPlaceholder.style.display = 'flex';
  monitorHud.style.display = 'none';
  if (title) placeholderStatusTitle.textContent = title;
  if (desc) placeholderStatusDesc.textContent = desc;
}

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


// ==============================================================================
// 3. MODE 2: FILE UPLOAD HANDLING & VALIDATION
// ==============================================================================

// Video file selection
videoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const validExts = ['.mp4', '.avi', '.mov', '.webm'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showAlert(`Unsupported video format "${ext}". Supported: MP4, AVI, MOV, WEBM`, 'danger');
    videoFileInput.value = '';
    return;
  }

  selectedVideoFile = file;
  videoFileBadge.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  videoFileBadge.classList.add('active');
  videoDropzone.classList.add('selected');

  summaryItemVideo.classList.add('ready');
  summaryVideoText.textContent = `✓ ${file.name}`;
  checkUploadFormReady();
});

// GPS file selection
gpsFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const validExts = ['.json', '.csv'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showAlert(`Unsupported GPS format "${ext}". Supported: JSON, CSV`, 'danger');
    gpsFileInput.value = '';
    return;
  }

  selectedGpsFile = file;
  gpsFileBadge.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  gpsFileBadge.classList.add('active');
  gpsDropzone.classList.add('selected');

  summaryItemGps.classList.add('ready');
  summaryGpsText.textContent = `✓ ${file.name}`;
  checkUploadFormReady();
});

// Drag & Drop event helpers
function setupDropzone(dropzoneEl, inputEl) {
  ['dragenter', 'dragover'].forEach(name => {
    dropzoneEl.addEventListener(name, (e) => {
      e.preventDefault();
      dropzoneEl.style.borderColor = 'var(--color-primary)';
      dropzoneEl.style.background = 'rgba(6, 182, 212, 0.08)';
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzoneEl.addEventListener(name, (e) => {
      e.preventDefault();
      dropzoneEl.style.borderColor = '';
      dropzoneEl.style.background = '';
    });
  });

  dropzoneEl.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      inputEl.files = e.dataTransfer.files;
      const changeEvent = new Event('change');
      inputEl.dispatchEvent(changeEvent);
    }
  });
}

setupDropzone(videoDropzone, videoFileInput);
setupDropzone(gpsDropzone, gpsFileInput);

function checkUploadFormReady() {
  if (selectedVideoFile && selectedGpsFile) {
    uploadSubmitBtn.disabled = false;
    summaryStatusText.textContent = 'READY FOR PROCESSING';
    summaryStatusText.style.color = 'var(--color-live)';
  } else {
    uploadSubmitBtn.disabled = true;
    summaryStatusText.textContent = 'WAITING FOR FILES';
    summaryStatusText.style.color = 'var(--text-muted)';
  }
}

// Upload & Process Submit Handler
uploadSubmitBtn.addEventListener('click', async () => {
  if (!selectedVideoFile || !selectedGpsFile) return;

  hideAlert();
  uploadSubmitBtn.disabled = true;
  uploadSubmitBtnText.textContent = 'UPLOADING & PROCESSING...';
  uploadProgressBox.style.display = 'block';

  updateUploadProgress(15, 'Uploading video & GPS files...');

  const busId = (uploadBusIdInput.value || 'BUS-101').trim();
  const formData = new FormData();
  formData.append('video', selectedVideoFile);
  formData.append('gps', selectedGpsFile);
  formData.append('bus_id', busId);

  try {
    updateUploadProgress(40, 'Parsing & validating GPS dataset...');

    const response = await fetch('/api/upload-session', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to upload files');
    }

    updateUploadProgress(80, 'Persisting session & GPS records to Supabase...');

    setTimeout(() => {
      updateUploadProgress(100, 'READY FOR PROCESSING!');
      setTimeout(() => {
        setupUploadedPlayback(result);
      }, 400);
    }, 500);

  } catch (err) {
    console.error('[Upload Error]', err);
    uploadProgressBox.style.display = 'none';
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtnText.textContent = 'UPLOAD & START PROCESSING';
    showAlert(`Upload failed: ${err.message}`, 'danger');
  }
});

function updateUploadProgress(percent, text) {
  uploadProgressPercent.textContent = `${percent}%`;
  uploadProgressFill.style.width = `${percent}%`;
  uploadProgressStepText.textContent = text;
}

// Reset upload form to process new files
resetUploadBtn.addEventListener('click', () => {
  uploadSetupCard.style.display = 'block';
  uploadPlaybackCard.style.display = 'none';

  selectedVideoFile = null;
  selectedGpsFile = null;
  uploadedSessionData = null;
  uploadedGpsRecords = [];

  videoFileInput.value = '';
  gpsFileInput.value = '';
  videoFileBadge.textContent = 'No video chosen';
  videoFileBadge.classList.remove('active');
  videoDropzone.classList.remove('selected');

  gpsFileBadge.textContent = 'No GPS chosen';
  gpsFileBadge.classList.remove('active');
  gpsDropzone.classList.remove('selected');

  summaryItemVideo.classList.remove('ready');
  summaryVideoText.textContent = 'Not selected';
  summaryItemGps.classList.remove('ready');
  summaryGpsText.textContent = 'Not selected';
  summaryStatusText.textContent = 'WAITING FOR FILES';
  summaryStatusText.style.color = 'var(--text-muted)';

  uploadProgressBox.style.display = 'none';
  uploadSubmitBtn.disabled = true;
  uploadSubmitBtnText.textContent = 'UPLOAD & START PROCESSING';

  if (uploadAiProgressCard) uploadAiProgressCard.style.display = 'none';
  if (aiProgressPollingTimer) {
    clearInterval(aiProgressPollingTimer);
    aiProgressPollingTimer = null;
  }

  uploadedVideoPlayer.pause();
  uploadedVideoPlayer.src = '';
});

// Incremental AI Progress Handler
function handleVideoProcessingProgress(data) {
  if (!data) return;
  if (uploadedSessionData && data.session_id && data.session_id !== uploadedSessionData.session_id) {
    return;
  }

  if (uploadAiProgressCard) uploadAiProgressCard.style.display = 'block';

  const pct = Math.min(100, Math.max(0, Number(data.percent || 0)));
  if (uploadAiProgressPercent) uploadAiProgressPercent.textContent = `${pct.toFixed(1)}%`;
  if (uploadAiProgressFill) uploadAiProgressFill.style.width = `${pct}%`;

  if (uploadAiFramesVal) {
    uploadAiFramesVal.textContent = `${data.processed_frames || 0} / ${data.total_frames || 0}`;
  }

  if (uploadAiElapsedVal) {
    const elapsed = data.elapsed_seconds || data.elapsed_video_sec || 0;
    uploadAiElapsedVal.textContent = `${Number(elapsed).toFixed(1)}s`;
  }

  if (uploadAiGpsVal) {
    if (data.current_gps && data.current_gps.latitude !== null && data.current_gps.latitude !== undefined) {
      uploadAiGpsVal.textContent = `${Number(data.current_gps.latitude).toFixed(5)}, ${Number(data.current_gps.longitude).toFixed(5)}`;
    } else {
      uploadAiGpsVal.textContent = '--';
    }
  }

  if (uploadAiDetectionsVal) uploadAiDetectionsVal.textContent = data.potholes_found || 0;
  if (uploadAiCreatedVal) uploadAiCreatedVal.textContent = data.events_created || 0;
  if (uploadAiUpdatedVal) uploadAiUpdatedVal.textContent = data.events_updated || 0;

  if (data.status === 'COMPLETED') {
    if (uploadAiStatusBadge) {
      uploadAiStatusBadge.className = 'badge badge-live';
      if (uploadAiStatusBadgeText) uploadAiStatusBadgeText.textContent = 'COMPLETED';
      if (uploadAiStatusDot) uploadAiStatusDot.className = 'status-dot active';
    }
    if (uploadAiProgressLabel) uploadAiProgressLabel.textContent = '✓ AI Video Processing & Timestamp Sync Finished!';

    if (processAiBtn) {
      const created = data.events_created || 0;
      const updated = data.events_updated || 0;
      processAiBtn.textContent = `✓ Complete (${created} Created, ${updated} Merged)`;
      processAiBtn.style.background = '#16a34a';
      processAiBtn.style.borderColor = '#16a34a';
      processAiBtn.disabled = false;
    }

    if (aiProgressPollingTimer) {
      clearInterval(aiProgressPollingTimer);
      aiProgressPollingTimer = null;
    }

    showAlert(`✓ Video AI Processing Complete! Processed ${data.processed_frames} frames. Created ${data.events_created || 0} new events, merged/updated ${data.events_updated || 0} duplicate observations within 10m.`, 'success');
  } else if (data.status === 'ERROR') {
    if (uploadAiStatusBadge) {
      uploadAiStatusBadge.className = 'badge badge-offline';
      if (uploadAiStatusBadgeText) uploadAiStatusBadgeText.textContent = 'ERROR';
      if (uploadAiStatusDot) uploadAiStatusDot.className = 'status-dot';
    }
    if (uploadAiProgressLabel) uploadAiProgressLabel.textContent = 'Processing Error Encountered';

    if (processAiBtn) {
      processAiBtn.textContent = '⚡ Retry AI Processing';
      processAiBtn.disabled = false;
    }

    if (aiProgressPollingTimer) {
      clearInterval(aiProgressPollingTimer);
      aiProgressPollingTimer = null;
    }

    showAlert(`Video processing error: ${data.error || 'Unknown error'}`, 'danger');
  } else {
    // In progress
    if (uploadAiStatusBadge) {
      uploadAiStatusBadge.className = 'badge badge-live';
      if (uploadAiStatusBadgeText) uploadAiStatusBadgeText.textContent = 'PROCESSING';
      if (uploadAiStatusDot) uploadAiStatusDot.className = 'status-dot active';
    }
    if (uploadAiProgressLabel) uploadAiProgressLabel.textContent = `Analyzing Frame ${data.current_frame || data.processed_frames || 0}...`;
  }
}

function handleEdgeEventUpdated(eventRecord) {
  handleEdgeEventDetected(eventRecord);
  const confPct = Math.round((eventRecord.confidence || 0) * 100);
  showAlert(`🔄 Updated existing pothole event ${eventRecord.event_id} with higher confidence (${confPct}%)`, 'info');
}

// AI Processing for Uploaded Video (Timestamp Synchronization & YOLO Pipeline)
processAiBtn.addEventListener('click', async () => {
  if (!uploadedSessionData) {
    showAlert('Please upload a recorded video and GPS dataset first.', 'warning');
    return;
  }

  try {
    processAiBtn.disabled = true;
    processAiBtn.innerHTML = '<span class="status-indicator live" style="display:inline-block; margin-right: 6px;"></span> Background AI Processing Started...';

    if (uploadAiProgressCard) {
      uploadAiProgressCard.style.display = 'block';
      if (uploadAiProgressFill) uploadAiProgressFill.style.width = '0%';
      if (uploadAiProgressPercent) uploadAiProgressPercent.textContent = '0.0%';
      if (uploadAiStatusBadgeText) uploadAiStatusBadgeText.textContent = 'STARTED';
      if (uploadAiProgressLabel) uploadAiProgressLabel.textContent = 'Initiating background AI pipeline...';
    }

    const sessionId = uploadedSessionData.session_id;

    const res = await fetch(`/api/process-session/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_filename: uploadedSessionData.video_filename,
        gps_records: uploadedGpsRecords,
        bus_id: uploadedSessionData.bus_id || 'BUS-101',
        video_source: uploadedSessionData.video_filename
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'AI processing failed to start');
    }

    showAlert('⚡ Background AI video processing initiated. Real-time progress is streaming below.', 'info');

    // Start fallback polling every 1.5s in case WebSockets are delayed
    if (aiProgressPollingTimer) clearInterval(aiProgressPollingTimer);
    aiProgressPollingTimer = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/session-progress/${sessionId}`);
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          handleVideoProcessingProgress(pollData);
          if (pollData.status === 'COMPLETED' || pollData.status === 'ERROR') {
            clearInterval(aiProgressPollingTimer);
            aiProgressPollingTimer = null;
          }
        }
      } catch (_) {}
    }, 1500);

  } catch (err) {
    showAlert(`AI processing failed: ${err.message}`, 'danger');
    processAiBtn.disabled = false;
    processAiBtn.textContent = '⚡ Run AI Timestamp Sync & Pothole Detection';
  }
});


// ==============================================================================
// 4. NEAREST-NEIGHBOR TIMESTAMP CORRELATION & PLAYBACK ENGINE
// ==============================================================================

/**
 * Given target timestamp in milliseconds and sorted GPS records array,
 * find the closest GPS point using binary search.
 */
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

// Setup Uploaded Video Playback & GIS Map
function setupUploadedPlayback(data) {
  uploadedSessionData = data;
  uploadedGpsRecords = data.gps_records || [];
  uploadVideoStartMs = new Date(data.video_started_at).getTime();

  // Populate Header Badges
  playbackBusId.textContent = data.bus_id;
  playbackSessionId.textContent = data.session_id;

  // Switch View
  uploadSetupCard.style.display = 'none';
  uploadPlaybackCard.style.display = 'block';

  // Load Video
  uploadedVideoPlayer.src = data.video_url;
  uploadedVideoPlayer.load();

  // Initialize Upload GIS Map
  initUploadGisMap(uploadedGpsRecords);

  // Bind video player timeupdate to nearest GPS synchronization
  uploadedVideoPlayer.ontimeupdate = () => {
    handleUploadedVideoTimeUpdate();
  };

  uploadedVideoPlayer.onseeking = () => {
    handleUploadedVideoTimeUpdate();
  };

  uploadedVideoPlayer.onseeked = () => {
    handleUploadedVideoTimeUpdate();
  };

  // Trigger initial correlation at frame 0
  handleUploadedVideoTimeUpdate();
}

function handleUploadedVideoTimeUpdate() {
  if (!uploadedSessionData || !uploadVideoStartMs) return;

  const currentSeconds = uploadedVideoPlayer.currentTime;
  const currentAbsoluteMs = uploadVideoStartMs + Math.floor(currentSeconds * 1000);
  const currentAbsoluteIso = new Date(currentAbsoluteMs).toISOString();

  // Display Video Elapsed & Absolute Time
  uploadVideoTimeVal.textContent = `${formatElapsed(currentSeconds)} (${currentAbsoluteIso.slice(11, 23)} UTC)`;

  // Find Nearest GPS Record
  const match = getGpsForVideoTimestamp(currentAbsoluteMs, uploadedGpsRecords);

  if (match && match.record) {
    const rec = match.record;
    uploadGpsTimeVal.textContent = formatUtcFull(rec.gps_timestamp);
    uploadLatVal.textContent = rec.latitude.toFixed(6);
    uploadLonVal.textContent = rec.longitude.toFixed(6);
    uploadAccVal.textContent = rec.accuracy !== null ? `${rec.accuracy.toFixed(1)} m` : 'N/A';
    uploadSpeedVal.textContent = rec.speed !== null ? `${(rec.speed * 3.6).toFixed(1)} km/h` : '0.0 km/h';

    uploadMatchStatusVal.textContent = 'MATCHED';
    uploadDeltaVal.textContent = `\u00B1${match.deltaMs} ms`;

    // Update Upload GIS Map Bus Marker Position
    if (uploadLeafletMap && uploadBusMarker) {
      const latlng = [rec.latitude, rec.longitude];
      uploadBusMarker.setLatLng(latlng);
      uploadLeafletMap.panTo(latlng);

      uploadBusMarker.setPopupContent(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.5; color: #16301F;">
          <strong style="color: #15803D; font-size: 14px;">UPLOAD REPLAY &bull; ${uploadedSessionData.bus_id}</strong><br>
          <strong>Video Time:</strong> ${formatElapsed(currentSeconds)}<br>
          <strong>Coords:</strong> ${rec.latitude.toFixed(6)}, ${rec.longitude.toFixed(6)}<br>
          <strong>Speed:</strong> ${rec.speed !== null ? (rec.speed * 3.6).toFixed(1) : '0.0'} km/h<br>
          <strong>Time Delta:</strong> \u00B1${match.deltaMs} ms
        </div>
      `);
    }
  } else {
    uploadMatchStatusVal.textContent = 'SEARCHING';
    uploadDeltaVal.textContent = '-- ms';
  }
}

// Initialize Leaflet Map for Upload Playback
function initUploadGisMap(records) {
  if (!window.L) return;

  const mapContainer = document.getElementById('uploadBusMap');
  if (!mapContainer) return;

  // Clean up existing map instance if reloading
  if (uploadLeafletMap) {
    uploadLeafletMap.remove();
    uploadLeafletMap = null;
  }

  const initialCenter = records.length > 0
    ? [records[0].latitude, records[0].longitude]
    : [17.385044, 78.486671];

  uploadLeafletMap = L.map('uploadBusMap', {
    zoomControl: true,
    attributionControl: false
  }).setView(initialCenter, 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(uploadLeafletMap);

  // Draw Full Uploaded Route Breadcrumb Trail
  const latlngs = records.map(r => [r.latitude, r.longitude]);
  uploadRoutePolyline = L.polyline(latlngs, {
    color: '#16A34A',
    weight: 4,
    opacity: 0.85
  }).addTo(uploadLeafletMap);

  if (latlngs.length > 1) {
    uploadLeafletMap.fitBounds(uploadRoutePolyline.getBounds(), { padding: [30, 30] });
  }

  // Upload Marker Icon
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

  uploadBusMarker = L.marker(initialCenter, { icon: busIcon }).addTo(uploadLeafletMap);
  uploadBusMarker.bindPopup('<div style="font-family: sans-serif; font-size: 12px;"><strong>UPLOAD REPLAY</strong><br>Move video timeline to synchronize.</div>');

  recenterUploadMapBtn.addEventListener('click', () => {
    if (uploadBusMarker && uploadLeafletMap) {
      uploadLeafletMap.flyTo(uploadBusMarker.getLatLng(), 16, { animate: true, duration: 1 });
    }
  });

  setTimeout(() => {
    uploadLeafletMap.invalidateSize();
  }, 400);

  uploadMapStatusText.textContent = `ROUTE: ${records.length} POINTS`;
}

// ==============================================================================
// 6. EDGE AI PROCESSING (OPENCV + YOLO + REDIS + GPS CORRELATION)
// ==============================================================================

async function checkEdgeServiceHealth() {
  try {
    const res = await fetch('/api/edge/health', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
  } catch (err) {
    // Service offline
  }
  return { ok: false };
}

async function startEdgeProcessing() {
  // Check if live video is streaming
  if (!remoteVideo || remoteVideo.readyState < 2 || remoteVideo.paused) {
    showAlert('Please connect and start the mobile bus camera stream first before activating Edge AI processing.', 'warning');
    return;
  }

  // Probe Edge AI Python service on port 5001
  const health = await checkEdgeServiceHealth();
  if (!health.ok) {
    showAlert('Python Edge AI Service is not responding on port 5001. Please run: "python drishtiyana/edge_ai/edge_service.py"', 'danger');
    if (aiStatusBadge) {
      aiStatusBadge.className = 'badge badge-offline';
      aiStatusDot.className = 'status-dot';
      aiStatusText.textContent = 'EDGE AI: SERVICE OFFLINE';
    }
    return;
  }

  isEdgeAiActive = true;
  edgeFrameCounter = 0;
  edgeAcceptedCount = 0;
  edgeTotalDetections = 0;
  edgeBestConfidence = 0.0;

  if (startEdgeBtn) startEdgeBtn.style.display = 'none';
  if (stopEdgeBtn) stopEdgeBtn.style.display = 'inline-flex';

  if (aiStatusBadge) {
    aiStatusBadge.className = 'badge badge-live';
    aiStatusDot.className = 'status-dot active';
    aiStatusText.textContent = 'EDGE AI: ACTIVE';
  }

  if (aiFramesVal) aiFramesVal.textContent = '0';
  if (aiDetectionsVal) aiDetectionsVal.textContent = '0';
  if (aiActiveCandidatesVal) aiActiveCandidatesVal.textContent = '0';
  if (aiFinalizedEventsVal) aiFinalizedEventsVal.textContent = '0';
  if (aiLastConfVal) aiLastConfVal.textContent = '0.0%';
  if (aiCandidateObsVal) aiCandidateObsVal.textContent = '0';

  const intervalMs = Math.round(1000 / EDGE_PROCESSING_FPS); // ~200 ms for 5 FPS
  edgeAiInterval = setInterval(captureAndProcessEdgeFrame, intervalMs);
  showAlert('Edge AI Processing is now ACTIVE at 5 FPS! Incoming live video frames are processed in parallel with zero stream disruption.', 'info');
}

function stopEdgeProcessing() {
  isEdgeAiActive = false;
  if (edgeAiInterval) {
    clearInterval(edgeAiInterval);
    edgeAiInterval = null;
  }

  if (startEdgeBtn) startEdgeBtn.style.display = 'inline-flex';
  if (stopEdgeBtn) stopEdgeBtn.style.display = 'none';

  if (aiStatusBadge) {
    aiStatusBadge.className = 'badge';
    aiStatusDot.className = 'status-dot';
    aiStatusText.textContent = 'EDGE AI: STANDBY';
  }

  showAlert('Edge AI processing stopped. Live camera video and GPS tracking remain active.', 'info');
}

async function captureAndProcessEdgeFrame() {
  if (!isEdgeAiActive || edgeProcessingLock) return;
  if (!remoteVideo || remoteVideo.readyState < 2 || remoteVideo.paused) return;

  edgeProcessingLock = true;

  try {
    edgeFrameCounter++;
    const frameId = edgeFrameCounter;

    // Use offscreen canvas for zero impact on remoteVideo playback
    const offscreen = document.createElement('canvas');
    offscreen.width = remoteVideo.videoWidth || 1280;
    offscreen.height = remoteVideo.videoHeight || 720;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(remoteVideo, 0, 0, offscreen.width, offscreen.height);

    // Live frame timestamp (UTC ISO string)
    const frameTimeIso = new Date().toISOString();

    offscreen.toBlob(async (blob) => {
      if (!blob) {
        edgeProcessingLock = false;
        return;
      }

      try {
        const formData = new FormData();
        formData.append('frame', blob, `frame-${frameId}.jpg`);
        formData.append('session_id', currentSessionId || 'SESSION-LIVE');
        formData.append('bus_id', ROOM_ID);
        formData.append('camera_id', 'CAM-01');
        formData.append('frame_id', frameId.toString());
        formData.append('video_timestamp', frameTimeIso);
        formData.append('gps_records', JSON.stringify(recentGpsBuffer));

        const res = await fetch('/api/edge/process-frame', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          handleEdgeFrameResult(data);
        }
      } catch (err) {
        console.warn('[Edge Processing Fetch Warning]:', err.message);
      } finally {
        edgeProcessingLock = false;
      }
    }, 'image/jpeg', 0.85);

  } catch (err) {
    console.error('[Capture Frame Error]', err);
    edgeProcessingLock = false;
  }
}

function handleEdgeFrameResult(data) {
  if (aiFramesVal) aiFramesVal.textContent = data.frame_id;
  if (aiDetectionsVal) aiDetectionsVal.textContent = data.detections_count || 0;
  if (aiActiveCandidatesVal) aiActiveCandidatesVal.textContent = data.active_candidates_count || 0;
  if (aiFinalizedEventsVal) aiFinalizedEventsVal.textContent = data.finalized_events_count || 0;

  if (data.latest_event) {
    if (aiLastConfVal) aiLastConfVal.textContent = `${(data.latest_event.confidence * 100).toFixed(1)}%`;
    if (aiCandidateObsVal) aiCandidateObsVal.textContent = data.latest_event.observation_count || 1;
  } else if (data.best_confidence > 0) {
    if (aiLastConfVal) aiLastConfVal.textContent = `${(data.best_confidence * 100).toFixed(1)}%`;
  }

  // Update Status Badges
  if (aiYoloBadge) {
    aiYoloBadge.textContent = 'YOLO: ACTIVE';
    aiYoloBadge.className = 'badge badge-primary';
  }
  if (aiRedisBadge) {
    const rMode = data.redis_status || 'CONNECTED';
    const isOffline = rMode.toUpperCase().includes('DISCONNECTED');
    aiRedisBadge.textContent = `REDIS: ${isOffline ? 'DISCONNECTED' : 'CONNECTED'}`;
    aiRedisBadge.className = `badge ${isOffline ? 'badge-offline' : 'badge-live'}`;
  }
  if (aiServerBadge) {
    const sStat = data.server_status || 'CONNECTED';
    aiServerBadge.textContent = `SERVER: ${sStat}`;
    aiServerBadge.className = `badge ${sStat === 'CONNECTED' ? 'badge-live' : (sStat === 'PENDING' ? 'badge-warning' : 'badge-offline')}`;
  }

  // Update latest event evidence panel
  if (data.latest_event && data.annotated_frame_base64) {
    handleEdgeEventDetected(data.latest_event, data.annotated_frame_base64);
  }
}

function handleEdgeEventDetected(eventRecord, base64Image = null) {
  if (!aiEvidenceBox) return;
  aiEvidenceBox.style.display = 'grid';

  if (base64Image) {
    aiEvidenceImg.src = `data:image/jpeg;base64,${base64Image}`;
  } else if (eventRecord.evidence_image_url) {
    aiEvidenceImg.src = eventRecord.evidence_image_url;
  }

  const confPct = Math.round((eventRecord.confidence || 0) * 100);
  if (aiEvidenceConfBadge) aiEvidenceConfBadge.textContent = `${eventRecord.class_name || 'POTHOLE'} ${confPct}%`;
  if (aiEvidenceServerBadge) aiEvidenceServerBadge.textContent = eventRecord.server_status || 'SENT TO SERVER';

  if (aiEvtIdVal) aiEvtIdVal.textContent = eventRecord.event_id || '--';
  if (aiEvtCandidateVal) aiEvtCandidateVal.textContent = eventRecord.candidate_id || '--';
  if (aiEvtObsVal) aiEvtObsVal.textContent = eventRecord.observation_count ? `${eventRecord.observation_count} frame(s)` : '--';

  // Risk Score & Badge
  if (eventRecord.risk_level && eventRecord.risk_score !== undefined && eventRecord.risk_score !== null) {
    const rScore = eventRecord.risk_score;
    const rLevel = String(eventRecord.risk_level).toUpperCase();
    if (aiEvtRiskVal) {
      aiEvtRiskVal.textContent = `${rLevel} (${rScore}/100)`;
      aiEvtRiskVal.style.color = rLevel === 'CRITICAL' ? '#ef4444' : (rLevel === 'HIGH' ? '#f97316' : (rLevel === 'MEDIUM' ? '#eab308' : '#10b981'));
    }
    if (aiEvidenceRiskBadge) {
      aiEvidenceRiskBadge.style.display = 'inline-flex';
      aiEvidenceRiskBadge.textContent = `RISK: ${rLevel} (${rScore})`;
      if (rLevel === 'CRITICAL') {
        aiEvidenceRiskBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        aiEvidenceRiskBadge.style.border = '1px solid #ef4444';
        aiEvidenceRiskBadge.style.color = '#ef4444';
      } else if (rLevel === 'HIGH') {
        aiEvidenceRiskBadge.style.background = 'rgba(249, 115, 22, 0.2)';
        aiEvidenceRiskBadge.style.border = '1px solid #f97316';
        aiEvidenceRiskBadge.style.color = '#f97316';
      } else if (rLevel === 'MEDIUM') {
        aiEvidenceRiskBadge.style.background = 'rgba(234, 179, 8, 0.2)';
        aiEvidenceRiskBadge.style.border = '1px solid #eab308';
        aiEvidenceRiskBadge.style.color = '#eab308';
      } else {
        aiEvidenceRiskBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        aiEvidenceRiskBadge.style.border = '1px solid #10b981';
        aiEvidenceRiskBadge.style.color = '#10b981';
      }
    }
  } else {
    if (aiEvtRiskVal) aiEvtRiskVal.textContent = '--';
    if (aiEvidenceRiskBadge) aiEvidenceRiskBadge.style.display = 'none';
  }

  // Priority Badge & Text
  if (eventRecord.priority) {
    const prio = String(eventRecord.priority).toUpperCase();
    if (aiEvtPriorityVal) {
      aiEvtPriorityVal.textContent = prio;
      aiEvtPriorityVal.style.color = prio === 'HIGH' ? '#ef4444' : (prio === 'MEDIUM' ? '#f59e0b' : '#10b981');
    }
    if (aiEvidencePriorityBadge) {
      aiEvidencePriorityBadge.style.display = 'inline-flex';
      aiEvidencePriorityBadge.textContent = `PRIORITY: ${prio}`;
      if (prio === 'HIGH') {
        aiEvidencePriorityBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        aiEvidencePriorityBadge.style.border = '1px solid #ef4444';
        aiEvidencePriorityBadge.style.color = '#ef4444';
      } else if (prio === 'MEDIUM') {
        aiEvidencePriorityBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        aiEvidencePriorityBadge.style.border = '1px solid #f59e0b';
        aiEvidencePriorityBadge.style.color = '#f59e0b';
      } else {
        aiEvidencePriorityBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        aiEvidencePriorityBadge.style.border = '1px solid #10b981';
        aiEvidencePriorityBadge.style.color = '#10b981';
      }
    }
  } else {
    if (aiEvtPriorityVal) aiEvtPriorityVal.textContent = '--';
    if (aiEvidencePriorityBadge) aiEvidencePriorityBadge.style.display = 'none';
  }

  if (aiEvtFrameVal) aiEvtFrameVal.textContent = eventRecord.frame_id || '--';
  if (aiEvtVideoTimeVal) aiEvtVideoTimeVal.textContent = eventRecord.video_timestamp ? eventRecord.video_timestamp.slice(11, 23) + ' UTC' : '--';

  if (eventRecord.gps && eventRecord.gps.latitude) {
    if (aiEvtGpsVal) aiEvtGpsVal.textContent = `${eventRecord.gps.latitude.toFixed(6)}, ${eventRecord.gps.longitude.toFixed(6)}`;
    if (aiEvtGpsDeltaVal) aiEvtGpsDeltaVal.textContent = `\u00B1${eventRecord.gps.timestamp_difference_ms} ms`;
    if (aiEvtMatchStatusVal) {
      aiEvtMatchStatusVal.textContent = eventRecord.gps.gps_match_status || 'GPS MATCHED';
      aiEvtMatchStatusVal.style.color = eventRecord.gps.gps_match_status === 'GPS MATCHED' ? 'var(--color-live)' : 'var(--color-warning)';
    }
  } else if (eventRecord.latitude) {
    if (aiEvtGpsVal) aiEvtGpsVal.textContent = `${Number(eventRecord.latitude).toFixed(6)}, ${Number(eventRecord.longitude).toFixed(6)}`;
    if (aiEvtGpsDeltaVal) aiEvtGpsDeltaVal.textContent = eventRecord.timestamp_difference_ms ? `\u00B1${eventRecord.timestamp_difference_ms} ms` : '--';
    if (aiEvtMatchStatusVal) {
      aiEvtMatchStatusVal.textContent = eventRecord.gps_match_status || 'GPS MATCHED';
      aiEvtMatchStatusVal.style.color = eventRecord.gps_match_status === 'GPS MATCHED' ? 'var(--color-live)' : 'var(--color-warning)';
    }
  } else {
    if (aiEvtGpsVal) aiEvtGpsVal.textContent = 'NO GPS DATA';
    if (aiEvtGpsDeltaVal) aiEvtGpsDeltaVal.textContent = '--';
    if (aiEvtMatchStatusVal) {
      aiEvtMatchStatusVal.textContent = 'NO_CLOSE_MATCH';
      aiEvtMatchStatusVal.style.color = 'var(--color-offline)';
    }
  }
}

// Bind Edge AI Buttons
if (startEdgeBtn) {
  startEdgeBtn.addEventListener('click', startEdgeProcessing);
}
if (stopEdgeBtn) {
  stopEdgeBtn.addEventListener('click', stopEdgeProcessing);
}

// ==============================================================================
// 7. INITIALIZATION ON DOM READY
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initLiveGisMap();
  initSignaling();
  if (uploadPreviewSessionId) {
    uploadPreviewSessionId.textContent = generateUploadSessionId();
  }
});
