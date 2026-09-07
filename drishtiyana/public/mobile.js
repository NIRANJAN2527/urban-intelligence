// DRISHTIYANA - Mobile Sensing Unit (Sender)
// Feature 1: WebRTC Live Camera Streaming
// Feature 2: High-Precision GPS Telemetry & Synchronized UTC Timestamps

const BUS_ID = 'BUS-101';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
const sessionBadge = document.getElementById('sessionBadge');
const cameraPreview = document.getElementById('cameraPreview');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const previewHud = document.getElementById('previewHud');
const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');

const serverStatusDot = document.getElementById('serverStatusDot');
const serverStatusText = document.getElementById('serverStatusText');
const cameraStatusBadge = document.getElementById('cameraStatusBadge');
const cameraStatusDot = document.getElementById('cameraStatusDot');
const cameraStatusText = document.getElementById('cameraStatusText');
const gpsStatusBadge = document.getElementById('gpsStatusBadge');
const gpsStatusDot = document.getElementById('gpsStatusDot');
const gpsStatusText = document.getElementById('gpsStatusText');

const latVal = document.getElementById('latVal');
const lonVal = document.getElementById('lonVal');
const accVal = document.getElementById('accVal');
const speedVal = document.getElementById('speedVal');
const gpsTimeVal = document.getElementById('gpsTimeVal');
const videoTimeVal = document.getElementById('videoTimeVal');

const alertBox = document.getElementById('alertBox');
const alertMessage = document.getElementById('alertMessage');

// State Variables
let socket = null;
let localStream = null;
let peerConnection = null;
let isSensingActive = false;
let currentSessionId = null;
let videoStartedAt = null;
let geolocationWatchId = null;
let videoTimerInterval = null;

// Generate unique session ID (e.g. SESSION-20260908-153012-101)
function generateSessionId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const rand = Math.floor(100 + Math.random() * 900);
  return `SESSION-${dateStr}-${rand}`;
}

let iceCandidateQueue = [];

// 1. Initialize Signaling via Socket.IO
function initSocket() {
  socket = io({
    reconnectionAttempts: 10,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to server ID:', socket.id);
    updateServerStatus(true, 'CONNECTED');
    hideAlert();

    // Join room as sender (Bus Sensing Unit)
    socket.emit('join-room', { roomId: BUS_ID, role: 'sender' });
  });

  socket.on('disconnect', () => {
    console.warn('[Socket] Disconnected from server');
    updateServerStatus(false, 'DISCONNECTED');
    showAlert('Disconnected from laptop server. Retrying connection...', 'warning');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err);
    updateServerStatus(false, 'FAILED');
    showAlert('Cannot connect to server. Ensure your laptop server is running and both devices are on the same Wi-Fi.', 'danger');
  });

  // When a viewer (Laptop) joins the room, if camera is already live, renegotiate WebRTC
  socket.on('peer-joined', ({ role }) => {
    console.log(`[Room] Peer joined with role: ${role}`);
    if (role === 'viewer' && isSensingActive && localStream) {
      console.log('[WebRTC] Viewer joined, initiating WebRTC offer...');
      createPeerConnectionAndOffer();
    }
  });

  // When Laptop sends back WebRTC Answer
  socket.on('answer', async ({ sdp }) => {
    console.log('[WebRTC] Received ANSWER from viewer');
    try {
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('[WebRTC] Remote description set successfully');

        // Drain any ICE candidates received before answer was processed
        while (iceCandidateQueue.length > 0) {
          const cand = iceCandidateQueue.shift();
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('[WebRTC] Error adding queued ICE candidate:', e);
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error setting remote description:', err);
    }
  });

  // When Laptop sends ICE Candidates
  socket.on('ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    try {
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueue.push(candidate);
      }
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  });

  // When viewer leaves
  socket.on('peer-left', ({ role }) => {
    console.log(`[Room] Peer (${role}) disconnected.`);
  });
}

// 2. Camera Access using getUserMedia()
async function startCamera() {
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showAlert(
      '⚠️ Mobile camera & GPS require HTTPS! Please access this page with https:// (e.g., https://' + location.hostname + ':3001/mobile) and tap "Advanced -> Proceed".',
      'warning'
    );
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showAlert('Camera API (getUserMedia) is not supported or is blocked in this browser context.', 'danger');
    return false;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (firstErr) {
      console.warn('[Camera] Fallback to simple video constraints:', firstErr);
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    cameraPreview.srcObject = localStream;
    cameraPlaceholder.style.display = 'none';
    previewHud.style.display = 'flex';

    updateCameraStatus(true, 'LIVE');

    if (socket && socket.connected) {
      socket.emit('camera-status', { roomId: BUS_ID, status: 'LIVE' });
      createPeerConnectionAndOffer();
    }
    return true;
  } catch (err) {
    console.error('[Camera Error]', err);
    updateCameraStatus(false, 'ERROR');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showAlert('Camera permission denied. Please allow camera access in your browser settings.', 'danger');
    } else {
      showAlert(`Camera error: ${err.message || err.name}`, 'danger');
    }
    return false;
  }
}

// 3. WebRTC PeerConnection Setup (Phone = Sender)
async function createPeerConnectionAndOffer() {
  if (!localStream) return;

  if (peerConnection) {
    peerConnection.close();
  }

  console.log('[WebRTC] Creating RTCPeerConnection...');
  iceCandidateQueue = [];
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onconnectionstatechange = () => {
    console.log('[WebRTC Mobile State]:', peerConnection.connectionState);
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('[WebRTC Mobile ICE State]:', peerConnection.iceConnectionState);
  };

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket && socket.connected) {
      console.log('[WebRTC Mobile] Sending ICE candidate to viewer');
      socket.emit('ice-candidate', {
        roomId: BUS_ID,
        candidate: event.candidate
      });
    }
  };

  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false
    });
    await peerConnection.setLocalDescription(offer);
    console.log('[WebRTC] Sending OFFER to viewer');
    socket.emit('offer', { roomId: BUS_ID, sdp: offer });
  } catch (err) {
    console.error('[WebRTC] Failed to create offer:', err);
    showAlert(`WebRTC connection failed: ${err.message}`, 'danger');
  }
}

// 4. Feature 2: High-Precision GPS Telemetry
function startGpsTracking() {
  if (!navigator.geolocation) {
    updateGpsStatus('unavailable', 'NOT SUPPORTED');
    showAlert('Geolocation API is not supported on this browser/device.', 'danger');
    return;
  }

  updateGpsStatus('searching', 'SEARCHING SATELLITES...');

  const options = {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  };

  geolocationWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const coords = position.coords;
      const readingTimestamp = new Date(position.timestamp || Date.now()).toISOString();

      const gpsData = {
        bus_id: BUS_ID,
        session_id: currentSessionId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy !== null ? coords.accuracy : null,
        speed: coords.speed !== null ? coords.speed : null,
        heading: coords.heading !== null ? coords.heading : null,
        gps_timestamp: readingTimestamp
      };

      // Update UI with real-time values
      latVal.textContent = coords.latitude.toFixed(6);
      lonVal.textContent = coords.longitude.toFixed(6);
      accVal.textContent = coords.accuracy ? `${coords.accuracy.toFixed(1)}m` : 'N/A';
      speedVal.textContent = coords.speed !== null ? `${(coords.speed * 3.6).toFixed(1)} km/h` : '0.0 km/h';

      // Format GPS time (HH:MM:SS UTC)
      const gpsDate = new Date(readingTimestamp);
      gpsTimeVal.textContent = gpsDate.toISOString().slice(11, 19);

      updateGpsStatus('active', 'ACTIVE');

      // Send to Backend via POST /api/location
      try {
        const response = await fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gpsData)
        });

        if (!response.ok) {
          const errData = await response.json();
          console.warn('[GPS API] Location rejected by server:', errData.error);
        }
      } catch (fetchErr) {
        console.warn('[GPS API] Failed to send location to server:', fetchErr.message);
      }
    },
    (error) => {
      console.warn('[GPS Error]', error);
      if (error.code === 1) { // PERMISSION_DENIED
        updateGpsStatus('denied', 'PERMISSION DENIED');
        showAlert('Location permission denied. Please allow location permissions in your browser.', 'danger');
      } else if (error.code === 2) { // POSITION_UNAVAILABLE
        updateGpsStatus('unavailable', 'SIGNAL UNAVAILABLE');
      } else if (error.code === 3) { // TIMEOUT
        updateGpsStatus('unavailable', 'SIGNAL TIMEOUT');
      }
    },
    options
  );
}

// Stop GPS tracking
function stopGpsTracking() {
  if (geolocationWatchId !== null) {
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
  }
  updateGpsStatus('idle', 'IDLE');
}

// 5. Video Clock Synchronization
function startVideoClock(startTime) {
  if (videoTimerInterval) clearInterval(videoTimerInterval);

  videoTimerInterval = setInterval(() => {
    if (!startTime) return;
    const elapsedMs = Date.now() - startTime.getTime();
    const currentSimulatedTime = new Date(startTime.getTime() + elapsedMs);
    videoTimeVal.textContent = currentSimulatedTime.toISOString().slice(11, 19);
  }, 500);
}

function stopVideoClock() {
  if (videoTimerInterval) {
    clearInterval(videoTimerInterval);
    videoTimerInterval = null;
  }
  videoTimeVal.textContent = '--:--:--';
  gpsTimeVal.textContent = '--:--:--';
}

// 6. Start Full Bus Sensor Session (Camera + GPS + Video Stream)
async function startBusSensor() {
  hideAlert();
  startBtn.disabled = true;
  startBtnText.textContent = 'INITIALIZING SENSORS...';

  // 1. Start Camera
  const cameraOk = await startCamera();
  if (!cameraOk) {
    startBtn.disabled = false;
    startBtnText.textContent = 'START BUS SENSOR';
    return;
  }

  // 2. Initialize Session
  currentSessionId = generateSessionId();
  videoStartedAt = new Date().toISOString();
  sessionBadge.textContent = currentSessionId;
  sessionBadge.className = 'badge badge-primary';

  startVideoClock(new Date(videoStartedAt));

  // Register session with backend
  try {
    fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSessionId,
        bus_id: BUS_ID,
        video_started_at: videoStartedAt
      })
    }).catch(e => console.warn('[Session Start API]', e));
  } catch (e) {
    console.warn('[Session Start Error]', e);
  }

  // 3. Start Continuous GPS Tracking
  startGpsTracking();

  isSensingActive = true;
  startBtn.disabled = false;
  startBtn.className = 'btn btn-danger';
  startBtnText.textContent = 'STOP BUS SENSOR';
}

// Stop Full Bus Sensor Session
async function stopBusSensor() {
  // 1. Stop GPS
  stopGpsTracking();

  // 2. Stop Video Clock
  stopVideoClock();

  // 3. Stop Camera & WebRTC
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  cameraPreview.srcObject = null;
  cameraPlaceholder.style.display = 'flex';
  previewHud.style.display = 'none';

  updateCameraStatus(false, 'OFFLINE');

  // 4. End Session on Backend
  if (currentSessionId) {
    try {
      fetch('/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          bus_id: BUS_ID
        })
      }).catch(e => console.warn('[Session End API]', e));
    } catch (e) {
      console.warn('[Session End Error]', e);
    }
  }

  if (socket && socket.connected) {
    socket.emit('camera-status', { roomId: BUS_ID, status: 'OFFLINE' });
  }

  isSensingActive = false;
  currentSessionId = null;
  sessionBadge.textContent = 'IDLE';
  sessionBadge.className = 'badge';

  latVal.textContent = '--';
  lonVal.textContent = '--';
  accVal.textContent = '--';
  speedVal.textContent = '--';

  startBtn.className = 'btn btn-primary';
  startBtnText.textContent = 'START BUS SENSOR';
}

// UI Helpers
function updateServerStatus(connected, text) {
  serverStatusDot.className = `status-dot ${connected ? 'active' : ''}`;
  serverStatusText.textContent = text;
}

function updateCameraStatus(live, text) {
  cameraStatusBadge.className = `badge ${live ? 'badge-live' : 'badge-offline'}`;
  cameraStatusDot.className = `status-dot ${live ? 'active' : ''}`;
  cameraStatusText.textContent = text;
}

function updateGpsStatus(state, text) {
  if (state === 'active') {
    gpsStatusBadge.className = 'badge badge-live';
    gpsStatusDot.className = 'status-dot active';
  } else if (state === 'denied') {
    gpsStatusBadge.className = 'badge badge-offline';
    gpsStatusDot.className = 'status-dot';
  } else if (state === 'unavailable' || state === 'searching') {
    gpsStatusBadge.className = 'badge badge-warning';
    gpsStatusDot.className = 'status-dot connecting';
  } else {
    gpsStatusBadge.className = 'badge badge-offline';
    gpsStatusDot.className = 'status-dot';
  }
  gpsStatusText.textContent = text;
}

function showAlert(msg, type = 'danger') {
  alertBox.className = `alert alert-${type}`;
  alertMessage.textContent = msg;
  alertBox.style.display = 'flex';
}

function hideAlert() {
  alertBox.style.display = 'none';
}

// Button Click Listener
startBtn.addEventListener('click', () => {
  if (isSensingActive) {
    stopBusSensor();
  } else {
    startBusSensor();
  }
});

// Start Socket connection on load
initSocket();
