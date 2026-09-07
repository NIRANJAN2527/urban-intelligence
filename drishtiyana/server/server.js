const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');
const selfsigned = require('selfsigned');
const supabase = require('./supabase');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

// Body parser for JSON payloads
app.use(express.json({ limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded videos as static streaming media
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend files from public/
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

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${cleanBase}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB limit
});

// Helper: Parse and validate CSV formatted GPS data
function parseGpsCsv(csvContent) {
  const lines = csvContent.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV file is empty or missing data rows');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const tsIdx = headers.findIndex(h => h === 'timestamp' || h === 'gps_timestamp' || h === 'time');
  const latIdx = headers.findIndex(h => h === 'latitude' || h === 'lat');
  const lonIdx = headers.findIndex(h => h === 'longitude' || h === 'lon' || h === 'lng');
  const accIdx = headers.findIndex(h => h === 'accuracy' || h === 'acc');
  const speedIdx = headers.findIndex(h => h === 'speed');
  const headIdx = headers.findIndex(h => h === 'heading' || h === 'bearing');

  if (tsIdx === -1 || latIdx === -1 || lonIdx === -1) {
    throw new Error('CSV missing required columns: timestamp, latitude, longitude');
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
    if (row.length < 3) continue;

    const rawTs = row[tsIdx];
    const rawLat = parseFloat(row[latIdx]);
    const rawLon = parseFloat(row[lonIdx]);

    if (!rawTs || isNaN(Date.parse(rawTs))) {
      throw new Error(`Invalid timestamp at CSV row ${i + 1}: "${rawTs}"`);
    }

    if (isNaN(rawLat) || rawLat < -90 || rawLat > 90) {
      throw new Error(`Invalid latitude at CSV row ${i + 1}: "${row[latIdx]}"`);
    }

    if (isNaN(rawLon) || rawLon < -180 || rawLon > 180) {
      throw new Error(`Invalid longitude at CSV row ${i + 1}: "${row[lonIdx]}"`);
    }

    records.push({
      timestamp: new Date(rawTs).toISOString(),
      latitude: rawLat,
      longitude: rawLon,
      accuracy: accIdx !== -1 && !isNaN(parseFloat(row[accIdx])) ? parseFloat(row[accIdx]) : null,
      speed: speedIdx !== -1 && !isNaN(parseFloat(row[speedIdx])) ? parseFloat(row[speedIdx]) : null,
      heading: headIdx !== -1 && !isNaN(parseFloat(row[headIdx])) ? parseFloat(row[headIdx]) : null
    });
  }

  return records;
}

// System Status API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    supabaseConfigured: supabase.isSupabaseConfigured()
  });
});

// ==============================================================================
// MODE 2: FILE UPLOAD ENDPOINTS
// ==============================================================================

// POST /api/upload-session: Handles Video + GPS File Upload
app.post('/api/upload-session', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'gps', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files || {};
    const videoFile = files['video'] ? files['video'][0] : null;
    const gpsFile = files['gps'] ? files['gps'][0] : null;
    const busId = req.body.bus_id ? req.body.bus_id.trim() : 'BUS-101';

    // 1. Validate File Existence
    if (!videoFile) {
      return res.status(400).json({ error: 'Video file is required' });
    }
    if (!gpsFile) {
      return res.status(400).json({ error: 'GPS file is required' });
    }

    // 2. Validate Video Extension
    const allowedVideoExts = ['.mp4', '.avi', '.mov', '.webm'];
    const videoExt = path.extname(videoFile.originalname).toLowerCase();
    if (!allowedVideoExts.includes(videoExt)) {
      if (fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
      if (fs.existsSync(gpsFile.path)) fs.unlinkSync(gpsFile.path);
      return res.status(400).json({ error: `Unsupported video format: "${videoExt}". Allowed: ${allowedVideoExts.join(', ')}` });
    }

    // 3. Validate GPS Extension
    const allowedGpsExts = ['.json', '.csv'];
    const gpsExt = path.extname(gpsFile.originalname).toLowerCase();
    if (!allowedGpsExts.includes(gpsExt)) {
      if (fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
      if (fs.existsSync(gpsFile.path)) fs.unlinkSync(gpsFile.path);
      return res.status(400).json({ error: `Unsupported GPS file format: "${gpsExt}". Allowed: .json, .csv` });
    }

    // 4. Read and Parse GPS Content
    const gpsRawContent = fs.readFileSync(gpsFile.path, 'utf8');
    let parsedRecords = [];

    if (gpsExt === '.json') {
      try {
        const rawJson = JSON.parse(gpsRawContent);
        if (!Array.isArray(rawJson)) {
          throw new Error('JSON GPS file must contain an array of location objects');
        }
        if (rawJson.length === 0) {
          throw new Error('JSON GPS array is empty');
        }

        // Validate each item
        for (let i = 0; i < rawJson.length; i++) {
          const item = rawJson[i];
          const rawTs = item.timestamp || item.gps_timestamp || item.time;
          const lat = parseFloat(item.latitude || item.lat);
          const lon = parseFloat(item.longitude || item.lon || item.lng);

          if (!rawTs || isNaN(Date.parse(rawTs))) {
            throw new Error(`Item ${i + 1} has invalid or missing timestamp`);
          }
          if (isNaN(lat) || lat < -90 || lat > 90) {
            throw new Error(`Item ${i + 1} has invalid latitude (must be between -90 and 90)`);
          }
          if (isNaN(lon) || lon < -180 || lon > 180) {
            throw new Error(`Item ${i + 1} has invalid longitude (must be between -180 and 180)`);
          }

          parsedRecords.push({
            timestamp: new Date(rawTs).toISOString(),
            latitude: lat,
            longitude: lon,
            accuracy: item.accuracy !== undefined ? parseFloat(item.accuracy) : null,
            speed: item.speed !== undefined ? parseFloat(item.speed) : null,
            heading: item.heading !== undefined ? parseFloat(item.heading) : null
          });
        }
      } catch (jsonErr) {
        if (fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
        if (fs.existsSync(gpsFile.path)) fs.unlinkSync(gpsFile.path);
        return res.status(400).json({ error: `Invalid GPS JSON file: ${jsonErr.message}` });
      }
    } else if (gpsExt === '.csv') {
      try {
        parsedRecords = parseGpsCsv(gpsRawContent);
      } catch (csvErr) {
        if (fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
        if (fs.existsSync(gpsFile.path)) fs.unlinkSync(gpsFile.path);
        return res.status(400).json({ error: `Invalid GPS CSV file: ${csvErr.message}` });
      }
    }

    // 5. Clean up temporary uploaded GPS text file
    if (fs.existsSync(gpsFile.path)) {
      fs.unlinkSync(gpsFile.path);
    }

    // 6. Chronologically Sort GPS records by timestamp
    parsedRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 7. Generate Session ID
    const dateStr = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const randNum = Math.floor(100 + Math.random() * 900);
    const sessionId = `SESSION-UPLOAD-${dateStr}-${randNum}`;

    const videoStartedAt = parsedRecords[0].timestamp;
    const serverReceivedAt = new Date().toISOString();

    // 8. Format records for DB Insertion & In-Memory client use
    const formattedGpsRecords = parsedRecords.map(r => ({
      bus_id: busId,
      session_id: sessionId,
      source_type: 'UPLOAD',
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      speed: r.speed,
      heading: r.heading,
      gps_timestamp: r.timestamp,
      server_received_at: serverReceivedAt
    }));

    // 9. Persist Session & GPS records to Supabase (non-blocking)
    supabase.createSession({
      session_id: sessionId,
      bus_id: busId,
      source_type: 'UPLOAD',
      video_filename: videoFile.filename,
      video_started_at: videoStartedAt
    }).then(sessionRes => {
      console.log(`[Upload Mode] Session ${sessionId} registered in Supabase:`, sessionRes.success);
      return supabase.insertGpsLocationsBulk(formattedGpsRecords);
    }).then(gpsRes => {
      console.log(`[Upload Mode] Inserted ${gpsRes.count || 0} GPS records to Supabase.`);
    }).catch(dbErr => {
      console.warn('[Upload Mode Database Warning]:', dbErr.message);
    });

    console.log(`\n[Upload Mode] Session Created: ${sessionId}`);
    console.log(`  Video: ${videoFile.filename} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  GPS Records: ${formattedGpsRecords.length} points`);
    console.log(`  Video Start: ${videoStartedAt}\n`);

    // 10. Respond to Frontend
    return res.status(200).json({
      success: true,
      session_id: sessionId,
      bus_id: busId,
      source_type: 'UPLOAD',
      video_filename: videoFile.originalname,
      video_url: `/uploads/${videoFile.filename}`,
      video_started_at: videoStartedAt,
      gps_records_count: formattedGpsRecords.length,
      gps_records: formattedGpsRecords,
      status: 'READY_FOR_PROCESSING'
    });

  } catch (err) {
    console.error('[Upload API Exception]', err);
    return res.status(500).json({ error: `Server error processing upload: ${err.message}` });
  }
});

// POST /api/process-session/:sessionId: Standby hook for future AI processing pipeline
app.post('/api/process-session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  console.log(`[AI Processing Standby] Session ${sessionId} verified and ready for future YOLO model execution.`);

  res.json({
    session_id: sessionId,
    status: 'PROCESSING_READY',
    video: 'READY',
    gps: 'READY',
    message: 'Session prepared for AI detection.'
  });
});

// GET /api/session-gps/:sessionId: Retrieve GPS points for session
app.get('/api/session-gps/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const result = await supabase.getSessionGpsLocations(sessionId);
  res.json(result);
});

// ==============================================================================
// MODE 1: LIVE BUS SENSOR APIS (EXISTING & UNTOUCHED)
// ==============================================================================

// Session Lifecycle APIs (Live)
app.post('/api/session/start', async (req, res) => {
  const { session_id, bus_id, video_started_at } = req.body;

  if (!session_id || !bus_id) {
    return res.status(400).json({ error: 'Missing session_id or bus_id' });
  }

  console.log(`[Session] Starting session ${session_id} for bus ${bus_id}`);
  
  const dbResult = await supabase.createSession({
    session_id,
    bus_id,
    source_type: 'LIVE',
    video_started_at: video_started_at || new Date().toISOString()
  });

  const targetRoom = bus_id || 'BUS-101';
  io.to(targetRoom).emit('session-started', {
    session_id,
    bus_id,
    source_type: 'LIVE',
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

// GPS Telemetry Ingestion Endpoint (Live)
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
    source_type: 'LIVE',
    latitude: latNum,
    longitude: lonNum,
    accuracy: accuracy !== undefined && accuracy !== null ? Number(accuracy) : null,
    speed: speed !== undefined && speed !== null ? Number(speed) : null,
    heading: heading !== undefined && heading !== null ? Number(heading) : null,
    gps_timestamp: new Date(gps_timestamp).toISOString(),
    server_received_at
  };

  supabase.insertGpsLocation(locationRecord).catch((err) => {
    console.warn('[Supabase Background] Location insert error:', err.message);
  });

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
  socket.on('join-room', ({ roomId, role }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;

    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      role: role
    });

    socket.emit('db-status', {
      configured: supabase.isSupabaseConfigured()
    });
  });

  socket.on('offer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('offer', { sdp, from: socket.id });
  });

  socket.on('answer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('answer', { sdp, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('camera-status', ({ roomId, status }) => {
    socket.to(roomId).emit('camera-status', { status, from: socket.id });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('peer-left', {
        peerId: socket.id,
        role: socket.role
      });
    }
  });
});

// Detect local IPv4 addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
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
    console.log('       Mode 1: Live WebRTC Streaming & GPS Telemetry');
    console.log('       Mode 2: File Upload (Video + GPS) & Synchronized GIS');
    console.log('============================================================');
    console.log(`\n[Database Status]: ${supabase.isSupabaseConfigured() ? '🟢 Supabase Connected' : '⚪ Local Relay (Supabase unconfigured)'}`);
    console.log('\n[1] LAPTOP EDGE MONITOR (Open on this laptop):');
    console.log(`    👉 http://localhost:${HTTP_PORT}/viewer`);
    console.log(`    👉 https://localhost:${HTTPS_PORT}/viewer`);
    console.log('\n[2] PHONE BUS SENSOR (Open on mobile for Live Mode):');
    console.log(`    👉 https://${primaryIp}:${HTTPS_PORT}/mobile`);
    console.log('============================================================\n');
  });
});
