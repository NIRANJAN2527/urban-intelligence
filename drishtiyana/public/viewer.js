// DRISHTIYANA - Edge Monitor Station (Viewer)
// WebRTC receiver & real-time monitoring display

const ROOM_ID = 'BUS-101';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
const remoteVideo = document.getElementById('remoteVideo');
const monitorPlaceholder = document.getElementById('monitorPlaceholder');
const placeholderStatusTitle = document.getElementById('placeholderStatusTitle');
const placeholderStatusDesc = document.getElementById('placeholderStatusDesc');
const monitorHud = document.getElementById('monitorHud');
const resolutionHud = document.getElementById('resolutionHud');

const signalingBadge = document.getElementById('signalingBadge');
const signalingDot = document.getElementById('signalingDot');
const signalingStatusText = document.getElementById('signalingStatusText');

const connDot = document.getElementById('connDot');
const connText = document.getElementById('connText');
const camDot = document.getElementById('camDot');
const camText = document.getElementById('camText');
const p2pStatusVal = document.getElementById('p2pStatusVal');

const viewerAlert = document.getElementById('viewerAlert');
const viewerAlertText = document.getElementById('viewerAlertText');

// State Variables
let socket = null;
let peerConnection = null;
let iceCandidateQueue = [];

// 1. Initialize Signaling Connection
function initSignaling() {
  socket = io({
    reconnectionAttempts: 20,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[Socket] Edge Monitor connected with ID:', socket.id);
    updateSignalingStatus(true, 'SERVER CONNECTED');
    setConnectionStatus(true, 'CONNECTED');
    hideAlert();

    // Join room as viewer (Edge Monitor)
    socket.emit('join-room', { roomId: ROOM_ID, role: 'viewer' });
  });

  socket.on('disconnect', () => {
    console.warn('[Socket] Disconnected from signaling server');
    updateSignalingStatus(false, 'SERVER DISCONNECTED');
    setConnectionStatus(false, 'DISCONNECTED');
    setCameraStatus(false, 'OFFLINE');
    resetVideoToStandby('Signaling Server Disconnected', 'Please verify that the Node.js server is running on your laptop.');
    showAlert('Lost connection to signaling server. Auto-reconnecting...', 'danger');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err);
    updateSignalingStatus(false, 'CONNECTION FAILED');
    setConnectionStatus(false, 'FAILED');
    showAlert('Unable to reach server. Make sure "npm start" is active in your terminal.', 'danger');
  });

  // When Phone joins room
  socket.on('peer-joined', ({ role }) => {
    console.log(`[Room] Peer joined: ${role}`);
    if (role === 'sender') {
      placeholderStatusTitle.textContent = 'Phone Connected - Ready';
      placeholderStatusDesc.textContent = 'Bus sensing unit detected! Waiting for user to tap "START CAMERA" on mobile.';
      showAlert('Phone sensor connected to session. Waiting for camera activation...', 'info');
    }
  });

  // When Phone sends WebRTC Offer
  socket.on('offer', async ({ sdp }) => {
    console.log('[WebRTC] Received OFFER from phone');
    hideAlert();
    await handleOffer(sdp);
  });

  // When Phone sends ICE Candidate
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

  // When Phone camera status changes
  socket.on('camera-status', ({ status }) => {
    console.log(`[Status] Remote camera status updated: ${status}`);
    if (status === 'LIVE') {
      setCameraStatus(true, 'LIVE');
    } else {
      setCameraStatus(false, 'OFFLINE');
      resetVideoToStandby('Camera Stopped on Mobile', 'The bus sensing unit stopped its camera stream.');
    }
  });

  // When Phone disconnects
  socket.on('peer-left', ({ role }) => {
    console.log(`[Room] Peer left: ${role}`);
    if (role === 'sender') {
      setCameraStatus(false, 'OFFLINE');
      setP2PStatus('PEER DISCONNECTED');
      resetVideoToStandby('Mobile Device Disconnected', 'The phone closed the webpage or lost network connection.');
      showAlert('Mobile sensing unit disconnected from room.', 'warning');
    }
  });
}

// 2. Handle Incoming WebRTC Offer
async function handleOffer(sdp) {
  try {
    // Clean up any stale peer connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    iceCandidateQueue = [];

    // When remote media track arrives
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Media track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        monitorPlaceholder.style.display = 'none';
        monitorHud.style.display = 'flex';

        setConnectionStatus(true, 'CONNECTED');
        setCameraStatus(true, 'LIVE');
        setP2PStatus('STREAMING (P2P)');

        // Detect video track dimensions once metadata loads
        remoteVideo.onloadedmetadata = () => {
          if (remoteVideo.videoWidth && remoteVideo.videoHeight) {
            resolutionHud.textContent = `RES: ${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
          }
        };
      }
    };

    // Send local ICE candidates to phone via signaling server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('ice-candidate', {
          roomId: ROOM_ID,
          candidate: event.candidate
        });
      }
    };

    // Monitor WebRTC P2P Connection State
    peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] P2P State:', peerConnection.connectionState);
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

    // Set remote description from offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC] Remote description set from offer');

    // Drain queued ICE candidates
    while (iceCandidateQueue.length > 0) {
      const cand = iceCandidateQueue.shift();
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.error('[WebRTC] Error adding queued ICE candidate:', e);
      }
    }

    // Create and send WebRTC Answer back to Phone
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log('[WebRTC] Sending ANSWER to phone');
    socket.emit('answer', { roomId: ROOM_ID, sdp: answer });

  } catch (err) {
    console.error('[WebRTC] Error handling offer:', err);
    showAlert(`Failed to negotiate WebRTC stream: ${err.message}`, 'danger');
  }
}

// Helper: Reset video monitor to standby view
function resetVideoToStandby(title, desc) {
  remoteVideo.srcObject = null;
  monitorPlaceholder.style.display = 'flex';
  monitorHud.style.display = 'none';
  if (title) placeholderStatusTitle.textContent = title;
  if (desc) placeholderStatusDesc.textContent = desc;
}

// UI State Management
function updateSignalingStatus(connected, text) {
  signalingBadge.className = `badge ${connected ? 'badge-live' : 'badge-offline'}`;
  signalingDot.className = `status-dot ${connected ? 'active' : ''}`;
  signalingStatusText.textContent = text;
}

function setConnectionStatus(connected, text) {
  connDot.className = `status-dot ${connected ? 'active' : ''}`;
  connText.textContent = text;
}

function setCameraStatus(live, text) {
  camDot.className = `status-dot ${live ? 'active' : ''}`;
  camText.textContent = text;
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

// Start signaling on page load
initSignaling();
