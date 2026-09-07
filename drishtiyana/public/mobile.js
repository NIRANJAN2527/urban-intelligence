// DRISHTIYANA - Mobile Sensing Unit (Sender)
// Peer-to-peer WebRTC streaming logic

const ROOM_ID = 'BUS-101';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
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
const alertBox = document.getElementById('alertBox');
const alertMessage = document.getElementById('alertMessage');

// State Variables
let socket = null;
let localStream = null;
let peerConnection = null;
let isCameraActive = false;

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
    socket.emit('join-room', { roomId: ROOM_ID, role: 'sender' });
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

  // When a viewer (Laptop) joins the room, if camera is already live, start streaming to them!
  socket.on('peer-joined', ({ role }) => {
    console.log(`[Room] Peer joined with role: ${role}`);
    if (role === 'viewer' && isCameraActive && localStream) {
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
      }
    } catch (err) {
      console.error('[WebRTC] Error setting remote description:', err);
    }
  });

  // When Laptop sends ICE Candidates
  socket.on('ice-candidate', async ({ candidate }) => {
    try {
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
  hideAlert();

  // Check if browser is in a secure context (HTTPS or localhost)
  // Mobile browsers strictly block getUserMedia on plain HTTP across network IPs!
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showAlert(
      '⚠️ Mobile camera requires HTTPS! Please access this page with https:// (e.g., https://' + location.hostname + ':3001/mobile) and tap "Advanced -> Proceed".',
      'warning'
    );
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showAlert('Camera API (getUserMedia) is not supported or is blocked in this browser context.', 'danger');
    return;
  }

  try {
    startBtn.disabled = true;
    startBtnText.textContent = 'REQUESTING CAMERA...';

    // Request environment (back) camera first; if not available, fallback to default
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

    // Attach stream to local preview
    cameraPreview.srcObject = localStream;
    cameraPlaceholder.style.display = 'none';
    previewHud.style.display = 'flex';

    isCameraActive = true;
    updateCameraStatus(true, 'CAMERA: LIVE');

    startBtn.disabled = false;
    startBtn.className = 'btn btn-danger';
    startBtnText.textContent = 'STOP CAMERA';

    // Inform signaling server
    if (socket && socket.connected) {
      socket.emit('camera-status', { roomId: ROOM_ID, status: 'LIVE' });
      // Initiate WebRTC call
      createPeerConnectionAndOffer();
    }
  } catch (err) {
    console.error('[Camera Error]', err);
    startBtn.disabled = false;
    startBtnText.textContent = 'START CAMERA';
    updateCameraStatus(false, 'CAMERA: ERROR');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showAlert('Camera permission denied. Please allow camera permissions in your browser address bar settings.', 'danger');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      showAlert('No camera device found on this phone.', 'danger');
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      showAlert('Camera is currently in use by another app or browser tab.', 'danger');
    } else {
      showAlert(`Camera error: ${err.message || err.name}`, 'danger');
    }
  }
}

// Stop Camera
function stopCamera() {
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

  isCameraActive = false;
  updateCameraStatus(false, 'CAMERA: OFFLINE');

  startBtn.className = 'btn btn-primary';
  startBtnText.textContent = 'START CAMERA';

  if (socket && socket.connected) {
    socket.emit('camera-status', { roomId: ROOM_ID, status: 'OFFLINE' });
  }
}

// 3. WebRTC PeerConnection Setup (Phone = Sender)
async function createPeerConnectionAndOffer() {
  if (!localStream) return;

  // Close any existing connection cleanly
  if (peerConnection) {
    peerConnection.close();
  }

  console.log('[WebRTC] Creating RTCPeerConnection...');
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add local video tracks to peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket && socket.connected) {
      console.log('[WebRTC] Sending ICE Candidate');
      socket.emit('ice-candidate', {
        roomId: ROOM_ID,
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', peerConnection.connectionState);
  };

  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false
    });
    await peerConnection.setLocalDescription(offer);
    console.log('[WebRTC] Sending OFFER to viewer');
    socket.emit('offer', { roomId: ROOM_ID, sdp: offer });
  } catch (err) {
    console.error('[WebRTC] Failed to create offer:', err);
    showAlert(`WebRTC connection failed: ${err.message}`, 'danger');
  }
}

// UI State Helpers
function updateServerStatus(connected, text) {
  serverStatusDot.className = `status-dot ${connected ? 'active' : ''}`;
  serverStatusText.textContent = text;
}

function updateCameraStatus(live, text) {
  cameraStatusBadge.className = `badge ${live ? 'badge-live' : 'badge-offline'}`;
  cameraStatusDot.className = `status-dot ${live ? 'active' : ''}`;
  cameraStatusText.textContent = text;
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
  if (isCameraActive) {
    stopCamera();
  } else {
    startCamera();
  }
});

// Start Socket connection on load
initSocket();
