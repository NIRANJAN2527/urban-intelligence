const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const selfsigned = require('selfsigned');
const supabase = require('./supabase');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

// Body parser for JSON payloads
app.use(express.json());

// Serve static files from the public directory
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Clean user-facing routes
app.get('/', (req, res) => {
  res.redirect('/viewer');
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(publicDir, 'mobile.html'));
});

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(publicDir, 'viewer.html'));
});

// System Status API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    supabaseConfigured: supabase.isSupabaseConfigured()
  });
});

// Session Lifecycle APIs
app.post('/api/session/start', async (req, res) => {
  const { session_id, bus_id, video_started_at } = req.body;

  if (!session_id || !bus_id) {
    return res.status(400).json({ error: 'Missing session_id or bus_id' });
  }

  console.log(`[Session] Starting session ${session_id} for bus ${bus_id}`);
  
  // Persist session to Supabase
  const dbResult = await supabase.createSession({
    session_id,
    bus_id,
    video_started_at: video_started_at || new Date().toISOString()
  });

  // Broadcast session metadata to connected viewers in room
  const targetRoom = bus_id || 'BUS-101';
  io.to(targetRoom).emit('session-started', {
    session_id,
    bus_id,
    video_started_at: video_started_at || new Date().toISOString(),
    dbConfigured: supabase.isSupabaseConfigured()
  });

  res.json({
    success: true,
    session_id,
    dbSaved: dbResult.success,
    dbConfigured: supabase.isSupabaseConfigured()
  });
});

app.post('/api/session/end', async (req, res) => {
  const { session_id, bus_id } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  console.log(`[Session] Ending session ${session_id}`);
  const dbResult = await supabase.endSession({ session_id });

  const targetRoom = bus_id || 'BUS-101';
  io.to(targetRoom).emit('session-ended', {
    session_id,
    ended_at: new Date().toISOString()
  });

  res.json({
    success: true,
    session_id,
    dbUpdated: dbResult.success
  });
});

// GPS Telemetry Ingestion Endpoint
app.post('/api/location', async (req, res) => {
  const {
    bus_id,
    session_id,
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    gps_timestamp
  } = req.body;

  // Validation
  if (!bus_id || typeof bus_id !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing bus_id' });
  }

  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing session_id' });
  }

  const latNum = Number(latitude);
  const lonNum = Number(longitude);

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: 'Invalid latitude. Must be a number between -90 and 90' });
  }

  if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: 'Invalid longitude. Must be a number between -180 and 180' });
  }

  if (!gps_timestamp || isNaN(Date.parse(gps_timestamp))) {
    return res.status(400).json({ error: 'Invalid or missing gps_timestamp. Must be a valid ISO-8601 date string' });
  }

  const server_received_at = new Date().toISOString();

  const locationRecord = {
    bus_id,
    session_id,
    latitude: latNum,
    longitude: lonNum,
    accuracy: accuracy !== undefined && accuracy !== null ? Number(accuracy) : null,
    speed: speed !== undefined && speed !== null ? Number(speed) : null,
    heading: heading !== undefined && heading !== null ? Number(heading) : null,
    gps_timestamp: new Date(gps_timestamp).toISOString(),
    server_received_at
  };

  // 1. Asynchronously persist to Supabase PostgreSQL (non-blocking)
  supabase.insertGpsLocation(locationRecord).catch((err) => {
    console.warn('[Supabase Background] Location insert error:', err.message);
  });

  // 2. Broadcast real-time GPS update to connected laptop edge monitor via Socket.IO
  const targetRoom = bus_id || 'BUS-101';
  io.to(targetRoom).emit('gps-update', {
    ...locationRecord,
    dbConfigured: supabase.isSupabaseConfigured()
  });

  res.status(200).json({
    success: true,
    server_received_at,
    dbConfigured: supabase.isSupabaseConfigured()
  });
});

// Generate self-signed certificate for HTTPS
// (Required by mobile browsers for camera & geolocation access over local Wi-Fi)
const attrs = [{ name: 'commonName', value: 'drishtiyana.local' }];
const pems = selfsigned.generate(attrs, { days: 30, keySize: 2048 });
const sslOptions = {
  key: pems.private,
  cert: pems.cert
};

// Create both HTTP and HTTPS servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(sslOptions, app);

// Attach Socket.IO to both servers
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
io.attach(httpServer);
io.attach(httpsServer);

// WebRTC Signaling & Real-time Room Logic
io.on('connection', (socket) => {
  console.log(`[Signaling] Peer connected: ${socket.id}`);

  // Client joins a specific room (e.g., BUS-101) as either 'sender' (Phone) or 'viewer' (Laptop)
  socket.on('join-room', ({ roomId, role }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;
    console.log(`[Room] ${role.toUpperCase()} (${socket.id}) joined room: ${roomId}`);

    // Notify other peers in the room
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      role: role
    });

    // Send initial DB configuration status to viewer
    socket.emit('db-status', {
      configured: supabase.isSupabaseConfigured()
    });
  });

  // Forward WebRTC Offer to other peers in room
  socket.on('offer', ({ roomId, sdp }) => {
    console.log(`[WebRTC] Forwarding OFFER in room ${roomId}`);
    socket.to(roomId).emit('offer', { sdp, from: socket.id });
  });

  // Forward WebRTC Answer to other peers in room
  socket.on('answer', ({ roomId, sdp }) => {
    console.log(`[WebRTC] Forwarding ANSWER in room ${roomId}`);
    socket.to(roomId).emit('answer', { sdp, from: socket.id });
  });

  // Forward ICE Candidate to peers in room
  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Relay Camera Status (e.g., 'LIVE' or 'OFFLINE')
  socket.on('camera-status', ({ roomId, status }) => {
    console.log(`[Status] Camera status in room ${roomId}: ${status}`);
    socket.to(roomId).emit('camera-status', { status, from: socket.id });
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    if (socket.roomId) {
      console.log(`[Room] ${socket.role || 'Peer'} (${socket.id}) disconnected from room ${socket.roomId}`);
      socket.to(socket.roomId).emit('peer-left', {
        peerId: socket.id,
        role: socket.role
      });
    }
  });
});

// Helper function to detect local Wi-Fi / Ethernet IPv4 addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// Start Servers
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    const primaryIp = localIps[0] || '192.168.1.X';

    console.log('\n============================================================');
    console.log('       DRISHTIYANA - Bus Sensing & Edge Monitoring');
    console.log('       Feature 1: Peer-to-Peer Live Camera Streaming');
    console.log('       Feature 2: Real-time GPS & Timestamp Synchronization');
    console.log('============================================================');
    console.log(`\n[Database Status]: ${supabase.isSupabaseConfigured() ? '🟢 Supabase Connected' : '⚪ Local Relay (Supabase unconfigured)'}`);
    console.log('\n[1] LAPTOP EDGE MONITOR (Open on this laptop):');
    console.log(`    👉 http://localhost:${HTTP_PORT}/viewer`);
    console.log(`    👉 https://localhost:${HTTPS_PORT}/viewer`);
    console.log('\n[2] PHONE BUS SENSOR (Open on your mobile phone on the same Wi-Fi):');
    console.log(`    👉 https://${primaryIp}:${HTTPS_PORT}/mobile  [RECOMMENDED - Camera + GPS]`);
    console.log(`    👉 http://${primaryIp}:${HTTP_PORT}/mobile`);
    if (localIps.length > 1) {
      console.log('\n    (Alternative network IPs detected):');
      localIps.slice(1).forEach(ip => {
        console.log(`      - https://${ip}:${HTTPS_PORT}/mobile`);
      });
    }
    console.log('\n[!] NOTE FOR PHONE CAMERA & LOCATION:');
    console.log('    Mobile browsers require HTTPS for camera and GPS permissions.');
    console.log('    When opening the https link on your phone, tap:');
    console.log('    "Advanced" -> "Proceed to site (unsafe)" once.');
    console.log('============================================================\n');
  });
});
