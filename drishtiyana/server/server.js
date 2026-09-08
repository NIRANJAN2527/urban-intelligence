const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const multer = require('multer');
const { Server } = require('socket.io');
const selfsigned = require('selfsigned');
const supabase = require('./supabase');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

// Configurable Admin Credentials (from .env)
const ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'DrishtiAdmin@2026';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'drishtiyana_secure_admin_jwt_secret_2026';

// Configurable Citizen Credentials (from .env)
const CITIZEN_LOGIN_ID = process.env.CITIZEN_USERNAME || 'citizen';
const CITIZEN_PASSWORD = process.env.CITIZEN_PASSWORD || 'CitizenAccess@2026';
const CITIZEN_SESSION_SECRET = process.env.CITIZEN_SESSION_SECRET || 'drishtiyana_secure_citizen_jwt_secret_2026';
const SEARCH_RADIUS_KM = parseFloat(process.env.CITIZEN_SEARCH_RADIUS_KM || '2.0');

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
const evidenceDir = path.join(uploadsDir, 'evidence');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// Serve uploaded evidence frames
app.use('/uploads', express.static(uploadsDir));

// HTTP -> HTTPS redirect middleware for browser pages (preserves /ca.crt, /ca.pem, static assets, and /mobile)
app.use((req, res, next) => {
  if (!req.secure && req.socket && req.socket.localPort === HTTP_PORT) {
    const isExempt = req.path === '/ca.crt' ||
                     req.path === '/ca.pem' ||
                     req.path.startsWith('/api/') ||
                     req.path === '/mobile' ||
                     req.path === '/mobile.html' ||
                     req.path.endsWith('.js') ||
                     req.path.endsWith('.css') ||
                     req.path.endsWith('.png') ||
                     req.path.endsWith('.jpg') ||
                     req.path.endsWith('.svg') ||
                     req.path.endsWith('.ico') ||
                     req.path.startsWith('/socket.io/');
    if (!isExempt) {
      const hostHeader = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
      return res.redirect(302, `https://${hostHeader}:${HTTPS_PORT}${req.originalUrl}`);
    }
  }
  next();
});

// Serve static frontend files from public/
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ==============================================================================
// CONFIDENCE-BASED POTHOLE ACCEPTANCE GATEWAY (NO MANUAL VERIFICATION)
// Confidence >= 0.80 -> ACCEPTED automatically (no admin approval required)
// Confidence < 0.80 -> IGNORED / Discarded completely
// ==============================================================================
const CONFIDENCE_ACCEPTANCE_THRESHOLD = 0.80;
const AUTO_VERIFY_THRESHOLD = 0.80; // Maintained for backward compatibility
const REVIEW_THRESHOLD = 0.80;      // Deprecated: review workflow removed

/**
 * Pothole acceptance evaluation:
 * - confidence >= 0.80 -> ACCEPTED (is_active: true)
 * - confidence < 0.80 -> IGNORED / Discarded (is_active: false)
 */
function evaluateVerificationGate(confidence, explicitStatus = null, explicitMethod = null) {
  const conf = typeof confidence === 'number' ? confidence : parseFloat(confidence || 0);

  // If explicit status was specified in the payload (e.g. from tests or prior system step)
  if (explicitStatus) {
    const status = String(explicitStatus).toUpperCase();
    const method = explicitMethod || (status === 'ACCEPTED' || status === 'VERIFIED' ? 'AUTO_ACCEPTED' : (status === 'REJECTED' ? 'AUTO_REJECTED' : 'AUTO_ACCEPTED'));
    return {
      verification_status: status,
      verification_method: method,
      is_active: status !== 'REJECTED'
    };
  }

  // Automated Gate Evaluation: strictly >= 0.80 is ACCEPTED, < 0.80 is REJECTED/IGNORED
  if (conf >= CONFIDENCE_ACCEPTANCE_THRESHOLD) {
    return {
      verification_status: 'ACCEPTED',
      verification_method: 'AUTO_ACCEPTED',
      is_active: true
    };
  } else {
    return {
      verification_status: 'REJECTED',
      verification_method: 'AUTO_REJECTED',
      is_active: false
    };
  }
}

// ==============================================================================
// ROOT CA CERTIFICATE DOWNLOAD FOR MOBILE DEVICES / LAN CLIENTS
// ==============================================================================
app.get('/ca.crt', (req, res) => {
  const rootCaPath = path.join(__dirname, 'certs', 'rootCA.crt');
  const rootCaPemPath = path.join(__dirname, 'certs', 'rootCA.pem');
  const targetPath = fs.existsSync(rootCaPath) ? rootCaPath : (fs.existsSync(rootCaPemPath) ? rootCaPemPath : null);
  if (!targetPath) {
    return res.status(404).send('Root CA certificate not found. Please run: npm run generate-cert');
  }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="drishtiyana-rootCA.crt"');
  res.sendFile(targetPath);
});

app.get('/ca.pem', (req, res) => {
  const rootCaPemPath = path.join(__dirname, 'certs', 'rootCA.pem');
  if (!fs.existsSync(rootCaPemPath)) {
    return res.status(404).send('Root CA certificate not found. Please run: npm run generate-cert');
  }
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.setHeader('Content-Disposition', 'attachment; filename="rootCA.pem"');
  res.sendFile(rootCaPemPath);
});

app.get('/api/ca/info', (req, res) => {
  const certDir = path.join(__dirname, 'certs');
  const keyExists = fs.existsSync(path.join(certDir, 'key.pem'));
  const certExists = fs.existsSync(path.join(certDir, 'cert.pem'));
  const caExists = fs.existsSync(path.join(certDir, 'rootCA.crt'));
  const localIps = getLocalIpAddresses();

  res.json({
    success: true,
    certificate_ready: keyExists && certExists && caExists,
    ca_download_url_http: `http://${localIps[0] || 'localhost'}:${HTTP_PORT}/ca.crt`,
    ca_download_url_https: `https://${localIps[0] || 'localhost'}:${HTTPS_PORT}/ca.crt`,
    primary_ip: localIps[0] || 'localhost',
    http_port: HTTP_PORT,
    https_port: HTTPS_PORT,
    covered_domains: ['localhost', '127.0.0.1', ...localIps, '::1']
  });
});


// ==============================================================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==============================================================================

function generateSessionToken(username, role = 'admin') {
  const payload = JSON.stringify({
    username,
    role,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours validity
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const secret = role === 'citizen' ? CITIZEN_SESSION_SECRET : ADMIN_SESSION_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

function verifySessionToken(token, expectedRole = null) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;

  try {
    const payloadStr = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr);
    if (!payload.exp || Date.now() > payload.exp) return null;

    const role = payload.role || 'admin';
    if (expectedRole && role !== expectedRole && role !== 'admin') {
      return null;
    }
    const secret = role === 'citizen' ? CITIZEN_SESSION_SECRET : ADMIN_SESSION_SECRET;
    const expectedSig = crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
    if (signature !== expectedSig) return null;

    return payload;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req);
    token = cookies.drishtiyana_admin_token || cookies.drishtiyana_citizen_token;
  }

  const session = verifySessionToken(token);
  if (!session) {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required' });
  }

  // Citizens are strictly forbidden from accessing Admin routes/APIs
  if (session.role !== 'admin') {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/login');
    }
    return res.status(403).json({ success: false, error: 'Forbidden: Admin access privilege required' });
  }

  req.adminUser = session;
  next();
}

function requireCitizenAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req);
    token = cookies.drishtiyana_citizen_token || cookies.drishtiyana_admin_token;
  }

  const session = verifySessionToken(token);
  if (!session) {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/citizen-login');
    }
    return res.status(401).json({ success: false, error: 'Unauthorized: Citizen authentication required' });
  }

  req.citizenUser = session;
  next();
}

// ==============================================================================
// BUS ROUTES & CITIZEN PROXIMITY REGISTRY (STRICT ACTIVE SOURCE VALIDATION)
// ==============================================================================
// Prototype Constants: Fixed Route for Mobile and Uploaded Buses
const PROTOTYPE_MOBILE_BUS = {
  bus_id: 'BUS-001',
  source: 'CBIT',
  destination: 'Secunderabad',
  route_name: 'CBIT - Secunderabad Express'
};

const PROTOTYPE_UPLOAD_BUS = {
  bus_id: 'BUS-UPLOAD-001',
  source: 'CBIT',
  destination: 'Secunderabad',
  route_name: 'CBIT - Secunderabad Upload'
};

// Stale timeout: If no GPS update received within 30 seconds, bus is INACTIVE and disappears
const MOBILE_GPS_STALE_TIMEOUT_MS = 30000;

const busRoutes = new Map([
  ['BUS-001', { id: 'route-001', bus_id: 'BUS-001', source: 'CBIT', destination: 'Secunderabad', active: true }],
  ['BUS-101', { id: 'route-101', bus_id: 'BUS-101', source: 'CBIT', destination: 'Secunderabad', active: true }],
  ['BUS-002', { id: 'route-002', bus_id: 'BUS-002', source: 'Miyapur', destination: 'Kukatpally', active: true }],
  ['BUS-003', { id: 'route-003', bus_id: 'BUS-003', source: 'Ameerpet', destination: 'LB Nagar', active: true }],
  ['BUS-UPLOAD-001', { id: 'route-upload-001', bus_id: 'BUS-UPLOAD-001', source: 'CBIT', destination: 'Secunderabad', active: true }]
]);

// Map<bus_id, { bus_id, session_id, latitude, longitude, accuracy, speed, heading, timestamp, updated_at, source_type }>
// CRITICAL RULE: Configured buses are NOT active buses. ONLY populated when active GPS is transmitted!
const latestBusLocations = new Map();

function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

// ==============================================================================
// USER-FACING ROUTES
// ==============================================================================
app.get('/', (req, res) => {
  res.redirect('/viewer');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(publicDir, 'mobile.html'));
});

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(publicDir, 'viewer.html'));
});

// Protected Admin Portal routes
app.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/command', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Standalone Citizen Portal routes
app.get('/citizen-login', (req, res) => {
  res.sendFile(path.join(publicDir, 'citizen-login.html'));
});

app.get('/citizen', requireCitizenAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'citizen.html'));
});

// ==============================================================================
// AUTHENTICATION APIS
// ==============================================================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_LOGIN_ID && password === ADMIN_PASSWORD) {
    const token = generateSessionToken(username);
    res.setHeader('Set-Cookie', `drishtiyana_admin_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
    return res.json({
      success: true,
      token,
      user: { username }
    });
  }
  return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `drishtiyana_admin_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/check', (req, res) => {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : cookies.drishtiyana_admin_token;

  const session = verifySessionToken(token);
  if (session && session.role === 'admin') {
    return res.json({ authenticated: true, user: { username: session.username, role: 'admin' } });
  }
  return res.json({ authenticated: false });
});

// ==============================================================================
// CITIZEN AUTHENTICATION & PROXIMITY APIS (COMPLETELY SEPARATE)
// ==============================================================================
app.post('/api/citizen/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === CITIZEN_LOGIN_ID && password === CITIZEN_PASSWORD) {
    const token = generateSessionToken(username, 'citizen');
    res.setHeader('Set-Cookie', `drishtiyana_citizen_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
    return res.json({
      success: true,
      token,
      user: { username, role: 'citizen' }
    });
  }
  return res.status(401).json({ success: false, error: 'Invalid citizen username or password' });
});

app.post('/api/citizen/logout', (req, res) => {
  res.setHeader('Set-Cookie', `drishtiyana_citizen_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/citizen/check', (req, res) => {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : cookies.drishtiyana_citizen_token;

  const session = verifySessionToken(token);
  if (session && (session.role === 'citizen' || session.role === 'admin')) {
    return res.json({ authenticated: true, user: { username: session.username, role: session.role } });
  }
  return res.json({ authenticated: false });
});

// GET /api/citizen/nearby-buses: Find buses strictly within 2 KM of citizen coordinates
// CRITICAL RULE: Shows buses ONLY if mobile live GPS is actively transmitting OR uploaded session is actively processing
app.get('/api/citizen/nearby-buses', requireCitizenAuth, (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) {
    return res.status(400).json({ success: false, error: 'Invalid citizen coordinates. Must provide valid latitude and longitude' });
  }

  const nearbyBuses = [];
  const now = Date.now();

  // Iterate strictly over active telemetry sources in latestBusLocations
  for (const [key, loc] of latestBusLocations.entries()) {
    if (!loc || loc.latitude === null || loc.longitude === null || isNaN(loc.latitude) || isNaN(loc.longitude) || (loc.latitude === 0 && loc.longitude === 0)) {
      continue;
    }

    const updatedTime = loc.updated_at || loc.updatedAt || 0;
    const elapsedMs = now - updatedTime;

    // SOURCE A: Mobile Live GPS
    if (loc.source_type === 'LIVE') {
      // Discard if stale (GPS stopped > 30 seconds ago) -> Inactive bus disappears!
      if (elapsedMs > MOBILE_GPS_STALE_TIMEOUT_MS) {
        continue;
      }
    } else if (loc.source_type === 'UPLOAD_PROCESSING') {
      // SOURCE B: Uploaded Processing
      const job = videoJobProgress.get(loc.session_id);
      // Only active if job exists and status is PROCESSING or PROCESSING_STARTED
      if (!job || (job.status !== 'PROCESSING' && job.status !== 'PROCESSING_STARTED' && job.status !== 'STARTING')) {
        continue;
      }
      if (elapsedMs > 60000) {
        continue;
      }
    } else {
      // Unknown or non-active source -> Discard!
      continue;
    }

    // Backend strictly enforces the 2 KM radius restriction
    const distanceKm = calculateHaversineDistanceKm(lat, lon, loc.latitude, loc.longitude);
    if (distanceKm <= SEARCH_RADIUS_KM) {
      const secondsAgo = Math.max(0, Math.floor(elapsedMs / 1000));
      const busId = loc.bus_id || PROTOTYPE_MOBILE_BUS.bus_id;
      const source = loc.source || PROTOTYPE_MOBILE_BUS.source;
      const destination = loc.destination || PROTOTYPE_MOBILE_BUS.destination;
      const routeName = loc.route_name || PROTOTYPE_MOBILE_BUS.route_name;

      nearbyBuses.push({
        bus_id: busId,
        busId: busId,
        source: source,
        destination: destination,
        route_name: routeName,
        latitude: loc.latitude,
        longitude: loc.longitude,
        speed: loc.speed !== undefined && loc.speed !== null ? Number(loc.speed) : null,
        heading: loc.heading !== undefined && loc.heading !== null ? Number(loc.heading) : null,
        distance_km: distanceKm,
        distanceKm: distanceKm,
        distance_m: Math.round(distanceKm * 1000),
        status: 'LIVE',
        source_type: loc.source_type,
        seconds_ago: secondsAgo,
        gps_timestamp: loc.gps_timestamp || new Date(updatedTime).toISOString(),
        lastUpdated: new Date(updatedTime).toISOString()
      });
    }
  }

  // Sort by distance ascending (closest bus first)
  nearbyBuses.sort((a, b) => a.distanceKm - b.distanceKm);

  return res.json({
    success: true,
    radiusKm: SEARCH_RADIUS_KM,
    radius_km: SEARCH_RADIUS_KM,
    citizenLocation: { latitude: lat, longitude: lon, lat, lon },
    citizen_location: { latitude: lat, longitude: lon, lat, lon },
    count: nearbyBuses.length,
    buses: nearbyBuses
  });
});

// GET /api/citizen/bus/:busId/location: Get live/uploaded location for a specific bus
app.get('/api/citizen/bus/:busId/location', requireCitizenAuth, (req, res) => {
  const { busId } = req.params;
  const loc = latestBusLocations.get(busId) || latestBusLocations.get(`UPLOAD_${busId}`);
  const now = Date.now();

  const isLocActive = loc && (
    (loc.source_type === 'LIVE' && (now - (loc.updated_at || 0)) <= MOBILE_GPS_STALE_TIMEOUT_MS) ||
    (loc.source_type === 'UPLOAD_PROCESSING' && videoJobProgress.get(loc.session_id)?.status === 'PROCESSING')
  );

  if (!loc || !isLocActive || loc.latitude === null || loc.longitude === null || isNaN(loc.latitude) || isNaN(loc.longitude) || (loc.latitude === 0 && loc.longitude === 0)) {
    const emptyBus = {
      bus_id: busId,
      busId: busId,
      source: 'CBIT',
      destination: 'Secunderabad',
      route_name: 'CBIT - Secunderabad',
      latitude: null,
      longitude: null,
      distance_km: null,
      distanceKm: null,
      timestamp: null,
      status: 'GPS_UNAVAILABLE'
    };
    return res.json({
      success: true,
      bus: emptyBus,
      ...emptyBus
    });
  }

  const updatedTime = loc.updated_at || loc.updatedAt || Date.now();
  const secondsAgo = Math.max(0, Math.floor((now - updatedTime) / 1000));
  let distanceKm = null;

  if (req.query.lat && req.query.lon) {
    const userLat = parseFloat(req.query.lat);
    const userLon = parseFloat(req.query.lon);
    if (!isNaN(userLat) && !isNaN(userLon)) {
      distanceKm = calculateHaversineDistanceKm(userLat, userLon, loc.latitude, loc.longitude);
    }
  }

  const busPayload = {
    bus_id: loc.bus_id || busId,
    busId: loc.bus_id || busId,
    source: loc.source || 'CBIT',
    destination: loc.destination || 'Secunderabad',
    route_name: loc.route_name || 'CBIT - Secunderabad',
    latitude: loc.latitude,
    longitude: loc.longitude,
    speed: loc.speed !== undefined && loc.speed !== null ? Number(loc.speed) : null,
    heading: loc.heading !== undefined && loc.heading !== null ? Number(loc.heading) : null,
    distance_km: distanceKm,
    distanceKm: distanceKm,
    distance_m: distanceKm !== null ? Math.round(distanceKm * 1000) : null,
    status: 'LIVE',
    source_type: loc.source_type,
    seconds_ago: secondsAgo,
    gps_timestamp: loc.gps_timestamp || new Date(updatedTime).toISOString(),
    lastUpdated: new Date(updatedTime).toISOString(),
    timestamp: loc.gps_timestamp || new Date(updatedTime).toISOString()
  };

  return res.json({
    success: true,
    bus: busPayload,
    ...busPayload
  });
});

// Admin Configuration: List & Configure bus routes
app.get('/api/admin/routes', requireAdminAuth, (req, res) => {
  const routes = Array.from(busRoutes.values());
  return res.json({ success: true, count: routes.length, routes });
});

app.post('/api/admin/routes', requireAdminAuth, (req, res) => {
  const { bus_id, source, destination, active } = req.body || {};
  if (!bus_id || !source || !destination) {
    return res.status(400).json({ success: false, error: 'Missing required fields: bus_id, source, destination' });
  }
  const cleanId = String(bus_id).trim().toUpperCase();
  const route = {
    id: `route-${cleanId.toLowerCase()}`,
    bus_id: cleanId,
    source: String(source).trim(),
    destination: String(destination).trim(),
    active: active !== undefined ? Boolean(active) : true,
    updated_at: new Date().toISOString()
  };
  busRoutes.set(cleanId, route);
  return res.json({ success: true, route });
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

// Configure Multer for Edge AI Evidence Images
const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, evidenceDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `evidence-${Date.now()}-${Math.floor(100 + Math.random() * 900)}${ext}`);
  }
});

const uploadEvidence = multer({
  storage: evidenceStorage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB limit
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

// In-memory registry of uploaded video sessions
const uploadedSessions = new Map();

// In-memory registry of active background video processing jobs and progress
const videoJobProgress = new Map();

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

    // 10. Store in uploaded sessions registry
    uploadedSessions.set(sessionId, {
      session_id: sessionId,
      bus_id: busId,
      source_type: 'UPLOAD',
      video_filename: videoFile.filename,
      video_original_name: videoFile.originalname,
      video_path: videoFile.path,
      video_url: `/uploads/${videoFile.filename}`,
      video_started_at: videoStartedAt,
      gps_records: formattedGpsRecords
    });

    // 11. Respond to Frontend
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

// POST /api/process-session/:sessionId: Triggers Timestamp-Synchronized Edge AI processing for uploaded video
app.post('/api/process-session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = uploadedSessions.get(sessionId);

  let videoPath = session ? session.video_path : null;
  let gpsRecords = session ? session.gps_records : (req.body.gps_records || []);
  let busId = session ? session.bus_id : (req.body.bus_id || 'BUS-101');
  let videoSource = session ? session.video_original_name : (req.body.video_source || 'uploaded_recording');

  if (!videoPath && req.body.video_filename) {
    videoPath = path.join(uploadsDir, req.body.video_filename);
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(404).json({ error: `Video file not found on disk for session ${sessionId}` });
  }

  if (!gpsRecords || gpsRecords.length === 0) {
    try {
      const dbGps = await supabase.getSessionGpsLocations(sessionId);
      if (dbGps && dbGps.locations && dbGps.locations.length > 0) {
        gpsRecords = dbGps.locations;
      }
    } catch (_) {}
  }

  if (!gpsRecords || gpsRecords.length === 0) {
    return res.status(400).json({ error: `No GPS telemetry records available for session ${sessionId}` });
  }

  const frameStep = req.body.frame_step ? String(req.body.frame_step) : (process.env.PROCESS_EVERY_N_FRAMES || '2');

  console.log(`\n[Upload Mode AI Pipeline] Starting background timestamp-synchronized Edge AI execution for session: ${sessionId}`);
  console.log(`  Video File: ${videoPath}`);
  console.log(`  GPS Records: ${gpsRecords.length}`);
  console.log(`  Frame Step: ${frameStep}`);

  // 1. Initialize or reset job progress for incremental streaming
  const initialProgress = {
    session_id: sessionId,
    status: 'PROCESSING',
    percent: 0,
    processed_frames: 0,
    total_frames: 0,
    elapsed_video_sec: 0,
    current_timestamp: session ? session.video_started_at : null,
    current_gps: gpsRecords[0] || null,
    potholes_found: 0,
    events_created: 0,
    events_updated: 0,
    fps: 0,
    message: 'Starting background processing...',
    started_at: Date.now()
  };
  videoJobProgress.set(sessionId, initialProgress);
  io.emit('video-processing-progress', initialProgress);

  // Register actively processing uploaded session bus for Citizen Portal (SOURCE B)
  if (gpsRecords && gpsRecords.length > 0) {
    const firstGps = gpsRecords[0];
    const uploadBusPayload = {
      bus_id: PROTOTYPE_UPLOAD_BUS.bus_id,
      session_id: sessionId,
      source_type: 'UPLOAD_PROCESSING',
      latitude: Number(firstGps.latitude),
      longitude: Number(firstGps.longitude),
      speed: firstGps.speed !== undefined && firstGps.speed !== null ? Number(firstGps.speed) : null,
      heading: firstGps.heading !== undefined && firstGps.heading !== null ? Number(firstGps.heading) : null,
      gps_timestamp: firstGps.gps_timestamp || new Date().toISOString(),
      updated_at: Date.now(),
      source: PROTOTYPE_UPLOAD_BUS.source,
      destination: PROTOTYPE_UPLOAD_BUS.destination,
      route_name: PROTOTYPE_UPLOAD_BUS.route_name
    };
    latestBusLocations.set(`UPLOAD_${sessionId}`, uploadBusPayload);
    if (io) io.emit('citizen-bus-location', uploadBusPayload);
  }

  // 2. Respond immediately to the frontend without waiting for video processing to finish
  res.status(200).json({
    success: true,
    status: 'PROCESSING_STARTED',
    session_id: sessionId,
    message: 'Background video processing initiated successfully',
    initial_progress: initialProgress
  });

  // 3. Asynchronously trigger Edge AI microservice in background
  (async () => {
    try {
      const edgeFormData = new URLSearchParams();
      edgeFormData.append('video_path', videoPath);
      edgeFormData.append('gps_source', JSON.stringify(gpsRecords));
      edgeFormData.append('session_id', sessionId);
      edgeFormData.append('bus_id', busId);
      edgeFormData.append('video_source', videoSource);
      edgeFormData.append('frame_step', frameStep);

      const edgeResp = await fetch('http://127.0.0.1:5001/api/edge/process-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: edgeFormData.toString()
      });

      if (!edgeResp.ok) {
        const errorText = await edgeResp.text();
        console.error(`[Upload Mode AI Error] Edge microservice returned HTTP ${edgeResp.status}:`, errorText);
        const errProgress = {
          session_id: sessionId,
          status: 'ERROR',
          error: errorText,
          message: 'Video processing encountered an error'
        };
        videoJobProgress.set(sessionId, errProgress);
        io.emit('video-processing-progress', errProgress);
        // Remove from active citizen buses
        latestBusLocations.delete(`UPLOAD_${sessionId}`);
        return;
      }

      const edgeResult = await edgeResp.json();
      console.log(`[Upload Mode AI Complete] Session: ${sessionId} | Detections: ${edgeResult.detections_found} | Finalized: ${edgeResult.finalized_events_count}`);

      const completedProgress = {
        session_id: sessionId,
        status: 'COMPLETED',
        percent: 100,
        processed_frames: edgeResult.processed_frames || 0,
        total_frames: edgeResult.total_frames || 0,
        elapsed_video_sec: edgeResult.processing_time_seconds || 0,
        potholes_found: edgeResult.detections_found || 0,
        events_created: (videoJobProgress.get(sessionId)?.events_created) || edgeResult.finalized_events_count || 0,
        events_updated: (videoJobProgress.get(sessionId)?.events_updated) || 0,
        average_fps: edgeResult.average_fps || 0,
        message: 'Video processing completed successfully',
        completed_at: Date.now()
      };
      videoJobProgress.set(sessionId, completedProgress);
      io.emit('video-processing-progress', completedProgress);
      // Remove from active citizen buses once processing finishes
      latestBusLocations.delete(`UPLOAD_${sessionId}`);
    } catch (bgErr) {
      console.error(`[Upload Mode AI Exception] Background job failed for ${sessionId}:`, bgErr.message);
      const failProgress = {
        session_id: sessionId,
        status: 'ERROR',
        error: bgErr.message,
        message: 'Background video processing failed'
      };
      videoJobProgress.set(sessionId, failProgress);
      io.emit('video-processing-progress', failProgress);
      // Remove from active citizen buses
      latestBusLocations.delete(`UPLOAD_${sessionId}`);
    }
  })();
});

// POST /api/edge/video-progress: Endpoint for Python Edge AI to report periodic progress
app.post('/api/edge/video-progress', (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  const existing = videoJobProgress.get(session_id) || {};
  const merged = {
    ...existing,
    ...req.body,
    events_created: existing.events_created || 0,
    events_updated: existing.events_updated || 0,
    updated_at: Date.now()
  };

  videoJobProgress.set(session_id, merged);
  io.emit('video-processing-progress', merged);

  // If Edge sends current_gps during video processing, update latestBusLocations for Citizen Portal
  if (req.body && req.body.current_gps && req.body.current_gps.latitude && req.body.current_gps.longitude) {
    const edgeGps = req.body.current_gps;
    const uploadBusPayload = {
      bus_id: PROTOTYPE_UPLOAD_BUS.bus_id,
      session_id: session_id,
      source_type: 'UPLOAD_PROCESSING',
      latitude: Number(edgeGps.latitude),
      longitude: Number(edgeGps.longitude),
      speed: edgeGps.speed !== undefined && edgeGps.speed !== null ? Number(edgeGps.speed) : null,
      heading: edgeGps.heading !== undefined && edgeGps.heading !== null ? Number(edgeGps.heading) : null,
      gps_timestamp: edgeGps.gps_timestamp || new Date().toISOString(),
      updated_at: Date.now(),
      source: PROTOTYPE_UPLOAD_BUS.source,
      destination: PROTOTYPE_UPLOAD_BUS.destination,
      route_name: PROTOTYPE_UPLOAD_BUS.route_name
    };
    latestBusLocations.set(`UPLOAD_${session_id}`, uploadBusPayload);
    if (io) {
      io.emit('citizen-bus-location', uploadBusPayload);
    }
  }

  return res.json({ success: true });
});

// GET /api/session-progress/:sessionId: Lightweight polling endpoint for frontend
app.get('/api/session-progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const progress = videoJobProgress.get(sessionId);
  if (!progress) {
    return res.status(404).json({ status: 'UNKNOWN', error: `No active progress for session ${sessionId}` });
  }
  return res.json({ success: true, ...progress });
});

// GET /api/session-gps/:sessionId: Retrieve GPS points for session
app.get('/api/session-gps/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const result = await supabase.getSessionGpsLocations(sessionId);
  res.json(result);
});

// Reverse Proxy: GET /api/edge/health -> Python Edge Service (5001)
app.get('/api/edge/health', async (req, res) => {
  try {
    const edgeResp = await fetch('http://127.0.0.1:5001/api/edge/health', { method: 'GET' });
    if (!edgeResp.ok) {
      return res.status(edgeResp.status).json({ ok: false, error: 'Edge AI microservice returned error status' });
    }
    const data = await edgeResp.json();
    return res.json(data);
  } catch (err) {
    return res.status(503).json({ ok: false, error: 'Edge AI service unreachable on port 5001', details: err.message });
  }
});

// Reverse Proxy: POST /api/edge/process-frame -> Python Edge Service (5001)
const frameProxyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post('/api/edge/process-frame', frameProxyUpload.single('frame'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No frame buffer provided' });
    }

    const form = new FormData();
    const frameBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
    form.append('frame', frameBlob, req.file.originalname || 'frame.jpg');

    if (req.body) {
      for (const [key, val] of Object.entries(req.body)) {
        form.append(key, val);
      }
    }

    const edgeResp = await fetch('http://127.0.0.1:5001/api/edge/process-frame', {
      method: 'POST',
      body: form
    });

    if (!edgeResp.ok) {
      const errTxt = await edgeResp.text();
      return res.status(edgeResp.status).send(errTxt);
    }

    const data = await edgeResp.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Edge processing proxy error', details: err.message });
  }
});

// ==============================================================================
// ADMIN & COMMAND PORTAL TAXONOMY, REVERSE GEOCODING & STORAGE
// ==============================================================================

const EVENT_TAXONOMY = {
  CATEGORIES: {
    ROAD_INFRASTRUCTURE: {
      id: 'road_infrastructure',
      label: 'Road & Infrastructure',
      icon: '🚧',
      color: '#16A34A',
      problems: [
        { type: 'Pothole', department: 'ROAD MAINTENANCE' },
        { type: 'Road Crack', department: 'ROAD MAINTENANCE' },
        { type: 'Damaged Road', department: 'ROAD MAINTENANCE' },
        { type: 'Damaged Divider', department: 'ROAD MAINTENANCE' },
        { type: 'Missing Zebra Crossing', department: 'ROAD MAINTENANCE' },
        { type: 'Damaged Signboard', department: 'TRAFFIC' },
        { type: 'Waterlogging', department: 'MUNICIPAL' }
      ]
    },
    TRAFFIC: {
      id: 'traffic',
      label: 'Traffic',
      icon: '🚦',
      color: '#F59E0B',
      problems: [
        { type: 'Traffic Congestion', department: 'TRAFFIC' },
        { type: 'Traffic Bottleneck', department: 'TRAFFIC' },
        { type: 'Vehicle Density', department: 'TRAFFIC' },
        { type: 'Route Delay', department: 'TRAFFIC' }
      ]
    },
    SAFETY: {
      id: 'safety',
      label: 'Safety',
      icon: '🛡️',
      color: '#EF4444',
      problems: [
        { type: 'Pedestrian Risk', department: 'POLICE' },
        { type: 'Rash Driving', department: 'POLICE' },
        { type: 'Hit-and-Run', department: 'POLICE' },
        { type: 'Accident', department: 'POLICE / EMERGENCY' }
      ]
    }
  }
};

function resolveEventTaxonomy(className) {
  const norm = String(className || 'Pothole').toLowerCase();
  for (const cat of Object.values(EVENT_TAXONOMY.CATEGORIES)) {
    for (const prob of cat.problems) {
      if (norm.includes(prob.type.toLowerCase()) || prob.type.toLowerCase().includes(norm)) {
        return {
          category: cat.label,
          categoryId: cat.id,
          categoryIcon: cat.icon,
          department: prob.department,
          problem: prob.type
        };
      }
    }
  }
  return {
    category: 'Road & Infrastructure',
    categoryId: 'road_infrastructure',
    categoryIcon: '🚧',
    department: 'ROAD MAINTENANCE',
    problem: className || 'Pothole'
  };
}

// In-memory store for session & local fallback
const inMemoryEvents = new Map();

// In-memory store for dispatched department reports
const persistedReports = new Map();

// Reverse Geocoding Cache (key: "lat,lon" rounded to 4 decimals)
const reverseGeocodeCache = new Map();

async function reverseGeocode(lat, lon) {
  if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
    return { formatted: 'Address unavailable', address: null };
  }
  const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'DrishtiYana-Urban-Intelligence/1.0 (contact: admin@drishtiyana.local)'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const fallback = { formatted: 'Address unavailable', address: null };
      reverseGeocodeCache.set(cacheKey, fallback);
      return fallback;
    }

    const data = await resp.json();
    const a = data.address || {};
    const parts = [
      a.road || a.street || a.suburb || a.neighbourhood,
      a.city || a.town || a.village || a.county,
      a.state,
      a.country
    ].filter(Boolean);

    const formatted = parts.length > 0 ? parts.join(', ') : (data.display_name || 'Address unavailable');
    const result = { formatted, address: data.address || null };
    reverseGeocodeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const fallback = { formatted: 'Address unavailable', address: null };
    reverseGeocodeCache.set(cacheKey, fallback);
    return fallback;
  }
}

// In-memory set for candidate event deduplication and idempotency
const processedCandidateEvents = new Set();

// 10-meter GPS proximity threshold for duplicate pothole clustering
const DUPLICATE_DISTANCE_METERS = 10.0;

/**
 * Calculate Great-Circle distance (in meters) between two GPS points using the Haversine formula
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null ||
      isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    return Infinity;
  }
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// POST /api/edge/events: Receives finalized pothole detection event with correlated GPS & evidence image
app.post('/api/edge/events', uploadEvidence.single('evidence_image'), async (req, res) => {
  try {
    const {
      event_id,
      event_type,
      candidate_id,
      observation_count,
      risk_score,
      risk_level,
      priority,
      session_id,
      bus_id,
      camera_id,
      frame_id,
      video_timestamp,
      processing_timestamp,
      confidence,
      class_name,
      bbox_x1,
      bbox_y1,
      bbox_x2,
      bbox_y2,
      latitude,
      longitude,
      gps_timestamp,
      gps_accuracy,
      timestamp_difference_ms,
      gps_match_status,
      video_source,
      source_type
    } = req.body;

    const dedupeKey = `${session_id || 'UNKNOWN'}:${candidate_id || event_id}`;
    const newLat = latitude && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null;
    const newLon = longitude && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null;
    const newConf = confidence && !isNaN(parseFloat(confidence)) ? parseFloat(confidence) : 0.0;

    // STRICT CONFIDENCE RULE:
    // confidence >= 0.80 -> ACCEPTED automatically (no admin approval)
    // confidence < 0.80 -> IGNORE completely (no DB event, no evidence, no GIS marker, no report)
    if (newConf < CONFIDENCE_ACCEPTANCE_THRESHOLD) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      console.log(`[Pothole Acceptance Gate] Discarded detection: confidence ${(newConf * 100).toFixed(1)}% is below 80% threshold`);
      return res.status(200).json({
        success: true,
        action: 'IGNORED',
        confidence: newConf,
        message: `Detection ignored: AI confidence ${(newConf * 100).toFixed(1)}% < 80% acceptance threshold.`
      });
    }

    // Determine deterministic risk score, level, and priority
    let parsedRiskScore = risk_score !== undefined && !isNaN(parseInt(risk_score, 10)) ? parseInt(risk_score, 10) : null;
    let parsedRiskLevel = risk_level || null;
    let parsedPriority = priority || null;

    if (parsedRiskScore === null) {
      const confVal = newConf || 0.85;
      const obsVal = observation_count ? parseInt(observation_count, 10) : 1;
      const w = (bbox_x2 && bbox_x1) ? parseInt(bbox_x2, 10) - parseInt(bbox_x1, 10) : 120;
      const h = (bbox_y2 && bbox_y1) ? parseInt(bbox_y2, 10) - parseInt(bbox_y1, 10) : 90;
      const areaRatio = (w * h) / (1280 * 720);

      const confPts = Math.round(confVal * 35);
      const sevPts = areaRatio < 0.01 ? 12 : (areaRatio < 0.035 ? 20 : 30);
      const recPts = obsVal <= 1 ? 6 : (obsVal <= 3 ? 12 : (obsVal <= 6 ? 16 : 20));
      const spdPts = 5;

      parsedRiskScore = Math.min(100, Math.max(0, confPts + sevPts + recPts + spdPts));
      parsedRiskLevel = parsedRiskScore <= 25 ? 'LOW' : (parsedRiskScore <= 50 ? 'MEDIUM' : (parsedRiskScore <= 75 ? 'HIGH' : 'CRITICAL'));
      parsedPriority = parsedRiskScore <= 25 ? 'LOW' : (parsedRiskScore <= 50 ? 'MEDIUM' : 'HIGH');
    }

    // Resolve Evidence Image URL (Multipart file upload, direct URL, Base64 frame, or local candidate path)
    let evidenceImageUrl = req.file ? `/uploads/evidence/${req.file.filename}` : null;

    if (!evidenceImageUrl && req.body.evidence_image_url) {
      evidenceImageUrl = req.body.evidence_image_url.trim();
    }

    if (!evidenceImageUrl && (req.body.annotated_frame_base64 || req.body.evidence_base64 || req.body.image_base64)) {
      try {
        const rawB64 = (req.body.annotated_frame_base64 || req.body.evidence_base64 || req.body.image_base64).trim();
        const base64Data = rawB64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const filename = `evidence-${Date.now()}-${Math.floor(100 + Math.random() * 900)}.jpg`;
        const destPath = path.join(evidenceDir, filename);
        fs.writeFileSync(destPath, imgBuffer);
        evidenceImageUrl = `/uploads/evidence/${filename}`;
        console.log(`[Evidence Store] Saved Base64 evidence image to: ${evidenceImageUrl}`);
      } catch (b64Err) {
        console.warn(`[Evidence Store Warning] Failed to save Base64 evidence frame: ${b64Err.message}`);
      }
    }

    if (!evidenceImageUrl && req.body.best_frame_path && fs.existsSync(req.body.best_frame_path)) {
      try {
        const filename = `evidence-${Date.now()}-${Math.floor(100 + Math.random() * 900)}.jpg`;
        const destPath = path.join(evidenceDir, filename);
        fs.copyFileSync(req.body.best_frame_path, destPath);
        evidenceImageUrl = `/uploads/evidence/${filename}`;
        console.log(`[Evidence Store] Copied local best candidate frame to: ${evidenceImageUrl}`);
      } catch (copyErr) {
        console.warn(`[Evidence Store Warning] Failed to copy candidate evidence frame: ${copyErr.message}`);
      }
    }

    // ==============================================================================
    // GPS DUPLICATE PROTECTION: Merging detections of same pothole within 10 meters
    // ==============================================================================
    let duplicateTarget = null;
    let minDistance = Infinity;

    // 1. Direct candidate_id or event_id match
    if (candidate_id || event_id) {
      for (const existing of inMemoryEvents.values()) {
        if ((candidate_id && existing.candidate_id === candidate_id) || (event_id && existing.event_id === event_id)) {
          duplicateTarget = existing;
          minDistance = 0;
          break;
        }
      }
    }

    // 2. Spatial 10-meter proximity match within same session
    if (!duplicateTarget && newLat !== null && newLon !== null && session_id) {
      const incomingClass = (class_name || 'pothole').toLowerCase();
      for (const existing of inMemoryEvents.values()) {
        if (existing.session_id === session_id) {
          const existingClass = (existing.class_name || 'pothole').toLowerCase();
          const sameCategory = (existingClass === incomingClass) ||
            (existingClass.includes('pothole') && incomingClass.includes('pothole'));
          if (sameCategory && existing.latitude !== null && existing.longitude !== null) {
            const dist = haversineDistanceMeters(existing.latitude, existing.longitude, newLat, newLon);
            if (dist < DUPLICATE_DISTANCE_METERS && dist < minDistance) {
              minDistance = dist;
              duplicateTarget = existing;
            }
          }
        }
      }
    }

    if (duplicateTarget) {
      if (dedupeKey) processedCandidateEvents.add(dedupeKey);

      const oldConf = duplicateTarget.confidence || 0.0;
      if (newConf > oldConf) {
        // HIGHER CONFIDENCE: Update existing event in-place
        console.log(`[GPS Duplicate Protection] Duplicate detected within ${minDistance.toFixed(1)}m. Updating event ${duplicateTarget.event_id} with higher confidence ${(newConf * 100).toFixed(1)}% > ${(oldConf * 100).toFixed(1)}%`);

        // If old evidence file exists and is superseded by new image, remove old file from disk
        if (evidenceImageUrl && duplicateTarget.evidence_image_url && duplicateTarget.evidence_image_url !== evidenceImageUrl) {
          const cleanOldPath = duplicateTarget.evidence_image_url.startsWith('/') ? duplicateTarget.evidence_image_url.slice(1) : duplicateTarget.evidence_image_url;
          const oldFilePath = path.join(__dirname, cleanOldPath);
          if (fs.existsSync(oldFilePath)) {
            try {
              fs.unlinkSync(oldFilePath);
              console.log(`[Evidence Cleanup] Removed superseded lower-confidence image: ${duplicateTarget.evidence_image_url}`);
            } catch (_) {}
          }
          duplicateTarget.evidence_image_url = evidenceImageUrl;
        }

        duplicateTarget.confidence = newConf;
        duplicateTarget.latitude = newLat;
        duplicateTarget.longitude = newLon;
        if (gps_timestamp) duplicateTarget.gps_timestamp = gps_timestamp;
        if (gps_accuracy && !isNaN(parseFloat(gps_accuracy))) duplicateTarget.gps_accuracy = parseFloat(gps_accuracy);
        if (timestamp_difference_ms && !isNaN(parseInt(timestamp_difference_ms, 10))) duplicateTarget.timestamp_difference_ms = parseInt(timestamp_difference_ms, 10);
        if (gps_match_status) duplicateTarget.gps_match_status = gps_match_status;
        if (frame_id) duplicateTarget.frame_id = parseInt(frame_id, 10);
        if (video_timestamp) duplicateTarget.video_timestamp = video_timestamp;
        duplicateTarget.processing_timestamp = processing_timestamp || new Date().toISOString();
        duplicateTarget.observation_count = (duplicateTarget.observation_count || 1) + (observation_count ? parseInt(observation_count, 10) : 1);
        if (bbox_x1) duplicateTarget.bbox_x1 = parseInt(bbox_x1, 10);
        if (bbox_y1) duplicateTarget.bbox_y1 = parseInt(bbox_y1, 10);
        if (bbox_x2) duplicateTarget.bbox_x2 = parseInt(bbox_x2, 10);
        if (bbox_y2) duplicateTarget.bbox_y2 = parseInt(bbox_y2, 10);

        // Pothole detection >= 0.80 is automatically ACCEPTED without manual verification
        duplicateTarget.status = 'ACCEPTED';
        duplicateTarget.verification_status = 'ACCEPTED';
        duplicateTarget.verification_method = 'AUTO_ACCEPTED';
        duplicateTarget.is_active = true;
        if (!duplicateTarget.verified_at) {
          duplicateTarget.verified_at = new Date().toISOString();
          duplicateTarget.verified_by = 'AUTO_ACCEPTED';
        }

        if (parsedRiskScore !== null && parsedRiskScore > (duplicateTarget.risk_score || 0)) {
          duplicateTarget.risk_score = parsedRiskScore;
          duplicateTarget.risk_level = parsedRiskLevel;
          duplicateTarget.priority = parsedPriority;
        }

        // Persist in Supabase
        if (supabase.isSupabaseConfigured()) {
          await supabase.insertPotholeEvent(duplicateTarget);
        }

        // Update videoJobProgress counters
        const job = videoJobProgress.get(session_id);
        if (job) {
          job.events_updated = (job.events_updated || 0) + 1;
        }

        // Broadcast update via WebSocket
        io.emit('edge-pothole-updated', duplicateTarget);
        io.emit('edge-event-detected', duplicateTarget);

        return res.status(200).json({
          success: true,
          action: 'UPDATED',
          duplicate: true,
          event_id: duplicateTarget.event_id,
          candidate_id: candidate_id || null,
          confidence: duplicateTarget.confidence,
          distance_meters: Math.round(minDistance * 10) / 10,
          evidence_image_url: duplicateTarget.evidence_image_url,
          message: `In-place updated existing event with higher confidence (${(newConf * 100).toFixed(1)}% > ${(oldConf * 100).toFixed(1)}%)`
        });
      } else {
        // LOWER OR EQUAL CONFIDENCE: Keep existing higher confidence, drop candidate
        console.log(`[GPS Duplicate Protection] Duplicate detected within ${minDistance.toFixed(1)}m. Retained existing event ${duplicateTarget.event_id} (${(oldConf * 100).toFixed(1)}% >= ${(newConf * 100).toFixed(1)}%)`);

        // Clean up newly uploaded image file so duplicate evidence is not kept
        if (req.file && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
        }

        duplicateTarget.observation_count = (duplicateTarget.observation_count || 1) + 1;

        return res.status(200).json({
          success: true,
          action: 'RETAINED',
          duplicate: true,
          event_id: duplicateTarget.event_id,
          candidate_id: candidate_id || null,
          confidence: duplicateTarget.confidence,
          distance_meters: Math.round(minDistance * 10) / 10,
          message: `Retained existing event with higher confidence (${(oldConf * 100).toFixed(1)}% >= ${(newConf * 100).toFixed(1)}%)`
        });
      }
    }

    // ==============================================================================
    // NEW UNIQUE EVENT CREATION
    // ==============================================================================
    if (dedupeKey) {
      processedCandidateEvents.add(dedupeKey);
    }

    const taxonomy = resolveEventTaxonomy(class_name);
    const gateResult = evaluateVerificationGate(
      newConf,
      req.body.verification_status || null,
      req.body.verification_method || null
    );

    const hasValidCoords = newLat !== null && newLon !== null && (newLat !== 0 || newLon !== 0);
    const eventRecord = {
      event_id: event_id || `EVT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      candidate_id: candidate_id || null,
      observation_count: observation_count ? parseInt(observation_count, 10) : 1,
      risk_score: parsedRiskScore,
      risk_level: parsedRiskLevel,
      priority: parsedPriority,
      category: req.body.category || taxonomy.category,
      department: req.body.department || taxonomy.department,
      status: 'ACCEPTED',
      report_status: req.body.report_status || 'PENDING',
      report_id: req.body.report_id || null,
      work_order_id: req.body.work_order_id || null,
      session_id: session_id || 'UNKNOWN',
      bus_id: bus_id || 'BUS-101',
      camera_id: camera_id || 'CAM-01',
      frame_id: frame_id ? parseInt(frame_id, 10) : null,
      video_timestamp: video_timestamp || null,
      processing_timestamp: processing_timestamp || new Date().toISOString(),
      confidence: newConf,
      class_name: class_name || taxonomy.problem,
      bbox_x1: bbox_x1 ? parseInt(bbox_x1, 10) : null,
      bbox_y1: bbox_y1 ? parseInt(bbox_y1, 10) : null,
      bbox_x2: bbox_x2 ? parseInt(bbox_x2, 10) : null,
      bbox_y2: bbox_y2 ? parseInt(bbox_y2, 10) : null,
      latitude: hasValidCoords ? newLat : null,
      longitude: hasValidCoords ? newLon : null,
      gps_timestamp: gps_timestamp || null,
      gps_accuracy: gps_accuracy && !isNaN(parseFloat(gps_accuracy)) ? parseFloat(gps_accuracy) : null,
      timestamp_difference_ms: timestamp_difference_ms && !isNaN(parseInt(timestamp_difference_ms, 10)) ? parseInt(timestamp_difference_ms, 10) : null,
      gps_match_status: gps_match_status || 'UNCHECKED',
      video_source: req.body.video_source || req.body.video_filename || null,
      source_type: req.body.source_type || 'UPLOAD',
      evidence_image_url: evidenceImageUrl,
      verification_status: gateResult.verification_status || 'ACCEPTED',
      verification_method: gateResult.verification_method || 'AUTO_ACCEPTED',
      is_active: true,
      verified_at: new Date().toISOString(),
      verified_by: 'AUTO_ACCEPTED',
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null
    };

    // Cache in in-memory event store
    inMemoryEvents.set(eventRecord.event_id, eventRecord);

    // Update videoJobProgress counters
    const job = videoJobProgress.get(session_id);
    if (job) {
      job.events_created = (job.events_created || 0) + 1;
    }

    console.log(`\n[Edge AI Event] ${eventRecord.event_id} | ${eventRecord.class_name} ${(eventRecord.confidence * 100).toFixed(1)}% | Category: ${eventRecord.category} | Dept: ${eventRecord.department} | Risk: ${eventRecord.risk_level} (${eventRecord.risk_score}) | Priority: ${eventRecord.priority} (Observed: ${eventRecord.observation_count}x)`);
    console.log(`  Candidate: ${eventRecord.candidate_id || 'N/A'} | Frame: ${eventRecord.frame_id} | Video Time: ${eventRecord.video_timestamp}`);
    console.log(`  GPS: (${eventRecord.latitude}, ${eventRecord.longitude}) | Match: ${eventRecord.gps_match_status} (delta: ${eventRecord.timestamp_difference_ms} ms)`);
    if (evidenceImageUrl) {
      console.log(`  Evidence Image: ${evidenceImageUrl}`);
    }

    // Persist to Supabase if configured
    let dbSaved = false;
    if (supabase.isSupabaseConfigured()) {
      const dbRes = await supabase.insertPotholeEvent(eventRecord);
      dbSaved = dbRes.success;
      if (dbSaved) {
        console.log(`[DB] Event saved: ${eventRecord.event_id}`);
      }
    } else {
      console.log(`[DB] Local memory relay (Supabase unconfigured): ${eventRecord.event_id}`);
    }

    // Broadcast event to connected laptop monitors and admin portals
    const targetRoom = eventRecord.bus_id || 'BUS-101';
    io.to(targetRoom).emit('edge-event-detected', eventRecord);
    io.emit('edge-event-detected', eventRecord);
    io.emit('edge-pothole-detected', eventRecord);

    return res.status(200).json({
      success: true,
      action: 'CREATED',
      event_id: eventRecord.event_id,
      candidate_id: eventRecord.candidate_id,
      category: eventRecord.category,
      department: eventRecord.department,
      evidence_image_url: evidenceImageUrl,
      confidence: eventRecord.confidence,
      verification_status: eventRecord.verification_status,
      verification_method: eventRecord.verification_method,
      is_active: eventRecord.is_active,
      dbSaved,
      dbConfigured: supabase.isSupabaseConfigured()
    });
  } catch (err) {
    console.error('[API ERROR] /api/edge/events:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// ADMIN & COMMAND PORTAL APIS (SECURED)
// ==============================================================================

// GET /api/admin/config: Returns taxonomy definitions, thresholds and departments
app.get('/api/admin/config', requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    taxonomy: EVENT_TAXONOMY,
    thresholds: {
      auto_verify_threshold: AUTO_VERIFY_THRESHOLD,
      review_threshold: REVIEW_THRESHOLD
    },
    departments: [
      'ROAD MAINTENANCE',
      'TRAFFIC',
      'POLICE',
      'MUNICIPAL',
      'POLICE / EMERGENCY'
    ],
    statuses: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    report_statuses: ['PENDING', 'SENT', 'FAILED']
  });
});

// GET /api/admin/events: Retrieves real events with filters and search
app.get('/api/admin/events', requireAdminAuth, async (req, res) => {
  try {
    const { category, problem, risk_level, priority, department, status, report_status, bus_id, search, limit, verification_status, include_inactive } = req.query;

    let allEvents = [];
    if (supabase.isSupabaseConfigured()) {
      const dbResult = await supabase.getPotholeEvents({
        category,
        risk_level,
        priority,
        department,
        status,
        report_status,
        bus_id,
        limit: limit ? parseInt(limit, 10) : 200
      });
      if (dbResult.success && Array.isArray(dbResult.data)) {
        allEvents = dbResult.data;
      }
    }

    // Merge in-memory events if not already fetched from DB
    const dbEventIds = new Set(allEvents.map(e => e.event_id));
    for (const [id, memEvt] of inMemoryEvents.entries()) {
      if (!dbEventIds.has(id)) {
        allEvents.push(memEvt);
      }
    }

    // Sort descending by timestamp
    allEvents.sort((a, b) => {
      const tA = new Date(a.created_at || a.video_timestamp || a.processing_timestamp || 0).getTime();
      const tB = new Date(b.created_at || b.video_timestamp || b.processing_timestamp || 0).getTime();
      return tB - tA;
    });

    // Enrich each event with taxonomy metadata
    let enriched = allEvents.map(evt => {
      const tax = resolveEventTaxonomy(evt.class_name || evt.problem || 'Pothole');
      const rawLat = (evt.latitude !== undefined && evt.latitude !== null && !isNaN(parseFloat(evt.latitude))) ? parseFloat(evt.latitude) : null;
      const rawLon = (evt.longitude !== undefined && evt.longitude !== null && !isNaN(parseFloat(evt.longitude))) ? parseFloat(evt.longitude) : null;
      const hasCoords = rawLat !== null && rawLon !== null && (rawLat !== 0 || rawLon !== 0);

      return {
        event_id: evt.event_id,
        candidate_id: evt.candidate_id || null,
        observation_count: evt.observation_count || 1,
        category: evt.category || tax.category,
        categoryId: tax.categoryId,
        categoryIcon: tax.categoryIcon,
        problem: evt.class_name || evt.problem || tax.problem,
        class_name: evt.class_name || evt.problem || tax.problem,
        department: evt.department || tax.department,
        status: evt.status || 'ACCEPTED',
        report_status: evt.report_status || 'PENDING',
        report_id: evt.report_id || null,
        work_order_id: evt.work_order_id || null,
        confidence: evt.confidence !== undefined ? parseFloat(evt.confidence) : 0.85,
        risk_score: evt.risk_score !== undefined && evt.risk_score !== null ? parseInt(evt.risk_score, 10) : 50,
        risk_level: evt.risk_level || 'MEDIUM',
        priority: evt.priority || 'MEDIUM',
        latitude: hasCoords ? rawLat : null,
        longitude: hasCoords ? rawLon : null,
        gps_timestamp: evt.gps_timestamp || null,
        video_timestamp: evt.video_timestamp || null,
        processing_timestamp: evt.processing_timestamp || evt.created_at || new Date().toISOString(),
        created_at: evt.created_at || evt.processing_timestamp || new Date().toISOString(),
        frame_id: evt.frame_id !== undefined ? evt.frame_id : null,
        bus_id: evt.bus_id || 'BUS-101',
        camera_id: evt.camera_id || 'CAM-01',
        session_id: evt.session_id || 'UNKNOWN',
        gps_match_status: evt.gps_match_status || 'UNCHECKED',
        timestamp_difference_ms: evt.timestamp_difference_ms || null,
        evidence_image_url: evt.evidence_image_url || null,
        video_source: evt.video_source || null,
        source_type: evt.source_type || 'LIVE',
        // Acceptance status for pothole detections
        verification_status: evt.verification_status || (evt.status === 'REJECTED' ? 'REJECTED' : 'ACCEPTED'),
        verification_method: evt.verification_method || 'AUTO_ACCEPTED',
        is_active: evt.is_active !== undefined ? (evt.is_active === true || evt.is_active === 'true' || evt.is_active === 1) : true,
        verified_at: evt.verified_at || null,
        verified_by: evt.verified_by || null,
        rejected_at: evt.rejected_at || null,
        rejected_by: evt.rejected_by || null,
        rejection_reason: evt.rejection_reason || null
      };
    });

    // Admin Portal Requirement: Events without valid GPS and frame image must not be in the Admin Portal
    enriched = enriched.filter(e => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      const hasValidGps = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
      const img = e.evidence_image_url;
      const hasValidFrameImage = typeof img === 'string' && img.trim().length > 0 &&
                                 img.trim().toLowerCase() !== 'null' && img.trim().toLowerCase() !== 'undefined' &&
                                 img.trim().toLowerCase() !== 'n/a' && img.trim().toLowerCase() !== 'none';
      return hasValidGps && hasValidFrameImage;
    });

    // Verification / acceptance status filter
    if (verification_status && verification_status !== 'all') {
      enriched = enriched.filter(e => (e.verification_status || 'ACCEPTED').toUpperCase() === verification_status.toUpperCase());
    } else if (include_inactive !== 'true' && verification_status !== 'all') {
      // By default exclude soft-deleted/rejected events from active views unless explicitly requested
      enriched = enriched.filter(e => e.is_active !== false && (e.verification_status || 'ACCEPTED') !== 'REJECTED');
    }

    // Filter layer
    if (category && category !== 'all') {
      enriched = enriched.filter(e => e.category.toLowerCase().includes(category.toLowerCase()));
    }
    if (problem && problem !== 'all') {
      enriched = enriched.filter(e => e.problem.toLowerCase().includes(problem.toLowerCase()));
    }
    if (risk_level && risk_level !== 'all') {
      enriched = enriched.filter(e => e.risk_level.toUpperCase() === risk_level.toUpperCase());
    }
    if (priority && priority !== 'all') {
      enriched = enriched.filter(e => e.priority.toUpperCase() === priority.toUpperCase());
    }
    if (department && department !== 'all') {
      enriched = enriched.filter(e => e.department.toLowerCase().includes(department.toLowerCase()));
    }
    if (status && status !== 'all') {
      enriched = enriched.filter(e => e.status.toUpperCase() === status.toUpperCase());
    }
    if (report_status && report_status !== 'all') {
      enriched = enriched.filter(e => (e.report_status || 'PENDING').toUpperCase() === report_status.toUpperCase());
    }
    if (bus_id && bus_id !== 'all') {
      enriched = enriched.filter(e => e.bus_id.toLowerCase().includes(bus_id.toLowerCase()));
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      enriched = enriched.filter(e =>
        e.event_id.toLowerCase().includes(q) ||
        (e.candidate_id && e.candidate_id.toLowerCase().includes(q)) ||
        e.bus_id.toLowerCase().includes(q) ||
        e.problem.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    }

    return res.json({
      success: true,
      count: enriched.length,
      events: enriched
    });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/events:', err.message);
    return res.status(500).json({ success: false, error: err.message, events: [] });
  }
});

// GET /api/admin/stats: Real summary counts for Overview cards
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    let allEvents = [];
    if (supabase.isSupabaseConfigured()) {
      const dbResult = await supabase.getPotholeEvents({ limit: 1000 });
      if (dbResult.success && Array.isArray(dbResult.data)) {
        allEvents = dbResult.data;
      }
    }
    const dbEventIds = new Set(allEvents.map(e => e.event_id));
    for (const [id, memEvt] of inMemoryEvents.entries()) {
      if (!dbEventIds.has(id)) {
        allEvents.push(memEvt);
      }
    }

    // Admin Portal Requirement: Events without valid GPS and frame image must not appear in Admin Portal statistics
    allEvents = allEvents.filter(evt => {
      const rawLat = evt.latitude !== undefined && evt.latitude !== null ? parseFloat(evt.latitude) : NaN;
      const rawLon = evt.longitude !== undefined && evt.longitude !== null ? parseFloat(evt.longitude) : NaN;
      const hasValidGps = Number.isFinite(rawLat) && Number.isFinite(rawLon) && (rawLat !== 0 || rawLon !== 0);
      const img = evt.evidence_image_url || evt.image_url || evt.evidence_url || evt.frame_image || evt.evidence_image;
      const hasValidFrameImage = typeof img === 'string' && img.trim().length > 0 &&
                                 img.trim().toLowerCase() !== 'null' && img.trim().toLowerCase() !== 'undefined' &&
                                 img.trim().toLowerCase() !== 'n/a' && img.trim().toLowerCase() !== 'none';
      return hasValidGps && hasValidFrameImage;
    });

    const total = allEvents.length;
    let newEvents = 0;
    let highPriority = 0;
    let criticalEvents = 0;
    let roadProblems = 0;
    let trafficProblems = 0;
    let safetyIncidents = 0;
    let reportsDispatched = 0;
    let pendingReview = 0;
    let verifiedCount = 0;
    let rejectedCount = 0;
    const byDepartment = {};
    const byCategory = {};

    for (const evt of allEvents) {
      const tax = resolveEventTaxonomy(evt.class_name || evt.problem || 'Pothole');
      const cat = evt.category || tax.category;
      const dept = evt.department || tax.department;
      const rLvl = (evt.risk_level || 'MEDIUM').toUpperCase();
      const prio = (evt.priority || 'MEDIUM').toUpperCase();
      const stat = (evt.status || 'NEW').toUpperCase();
      const repStat = (evt.report_status || 'PENDING').toUpperCase();
      const vStat = (evt.verification_status || 'PENDING_REVIEW').toUpperCase();
      const isActive = evt.is_active !== undefined ? (evt.is_active === true || evt.is_active === 'true' || evt.is_active === 1) : true;

      if (vStat === 'ACCEPTED' || vStat === 'VERIFIED') verifiedCount++;
      else if (vStat === 'REJECTED' || !isActive) rejectedCount++;
      else verifiedCount++;

      if (stat === 'NEW' || stat === 'ACCEPTED') newEvents++;
      if (prio === 'HIGH') highPriority++;
      if (rLvl === 'CRITICAL') criticalEvents++;
      if (repStat === 'SENT') reportsDispatched++;

      if (cat.toLowerCase().includes('road')) roadProblems++;
      else if (cat.toLowerCase().includes('traffic')) trafficProblems++;
      else if (cat.toLowerCase().includes('safety')) safetyIncidents++;

      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return res.json({
      success: true,
      stats: {
        total_events: total,
        total_detections: total,
        accepted: verifiedCount,
        verified: verifiedCount,
        pending_review: 0,
        rejected: rejectedCount,
        reports_sent: reportsDispatched,
        new_events: newEvents,
        high_priority: highPriority,
        critical_events: criticalEvents,
        road_problems: roadProblems,
        traffic_problems: trafficProblems,
        safety_incidents: safetyIncidents,
        reports_dispatched: reportsDispatched,
        by_department: byDepartment,
        by_category: byCategory
      }
    });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/stats:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reverse-geocode: Cached reverse geocoding proxy
app.get('/api/reverse-geocode', requireAdminAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.json({ success: true, formatted: 'Address unavailable', address: null });
  }

  const result = await reverseGeocode(lat, lon);
  return res.json({ success: true, ...result });
});

// PATCH /api/admin/events/:eventId/status: Update event status
app.patch('/api/admin/events/:eventId/status', requireAdminAuth, async (req, res) => {
  const { eventId } = req.params;
  const { status } = req.body;

  const validStatuses = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ success: false, error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
  }

  const normalizedStatus = status.toUpperCase();

  // Update in memory if present
  if (inMemoryEvents.has(eventId)) {
    const mem = inMemoryEvents.get(eventId);
    mem.status = normalizedStatus;
    inMemoryEvents.set(eventId, mem);
  }

  // Update in Supabase if configured
  if (supabase.isSupabaseConfigured()) {
    await supabase.updateEventStatus(eventId, normalizedStatus);
  }

  io.emit('event-status-updated', {
    event_id: eventId,
    status: normalizedStatus
  });

  return res.json({ success: true, event_id: eventId, status: normalizedStatus });
});

// PATCH /api/admin/events/:eventId/verify: Verify detection candidate
app.patch('/api/admin/events/:eventId/verify', requireAdminAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    let event = inMemoryEvents.get(eventId);
    if (!event && supabase.isSupabaseConfigured()) {
      const dbRes = await supabase.getPotholeEvents({ limit: 500 });
      if (dbRes.success && Array.isArray(dbRes.data)) {
        event = dbRes.data.find(e => e.event_id === eventId);
      }
    }

    if (!event) {
      return res.status(404).json({ success: false, error: `Event not found: ${eventId}` });
    }

    event.verification_status = 'VERIFIED';
    event.verification_method = 'HUMAN_VERIFIED';
    event.is_active = true;
    event.verified_at = new Date().toISOString();
    event.verified_by = req.adminUser ? req.adminUser.username : 'admin';
    event.rejected_at = null;
    event.rejected_by = null;
    event.rejection_reason = null;
    inMemoryEvents.set(eventId, event);

    if (supabase.isSupabaseConfigured()) {
      await supabase.updateEventVerificationStatus(eventId, 'VERIFIED', true);
    }

    io.emit('event-verified', {
      event_id: eventId,
      verification_status: 'VERIFIED',
      verification_method: 'HUMAN_VERIFIED',
      is_active: true,
      verified_by: event.verified_by,
      verified_at: event.verified_at
    });

    console.log(`[Admin Verification] Event ${eventId} marked as VERIFIED (${event.verification_method}) by ${event.verified_by}`);
    return res.json({ success: true, event_id: eventId, verification_status: 'VERIFIED', verification_method: 'HUMAN_VERIFIED', is_active: true, event });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/events/:eventId/verify:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/events/:eventId/reject: Reject detection candidate (soft delete from active views)
app.patch('/api/admin/events/:eventId/reject', requireAdminAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reason } = req.body || {};
    let event = inMemoryEvents.get(eventId);
    if (!event && supabase.isSupabaseConfigured()) {
      const dbRes = await supabase.getPotholeEvents({ limit: 500 });
      if (dbRes.success && Array.isArray(dbRes.data)) {
        event = dbRes.data.find(e => e.event_id === eventId);
      }
    }

    if (!event) {
      return res.status(404).json({ success: false, error: `Event not found: ${eventId}` });
    }

    event.verification_status = 'REJECTED';
    event.verification_method = 'HUMAN_REJECTED';
    event.is_active = false;
    event.rejection_reason = reason || 'False positive / Rejected by Admin';
    event.rejected_at = new Date().toISOString();
    event.rejected_by = req.adminUser ? req.adminUser.username : 'admin';
    inMemoryEvents.set(eventId, event);

    if (supabase.isSupabaseConfigured()) {
      await supabase.updateEventVerificationStatus(eventId, 'REJECTED', false);
    }

    io.emit('event-rejected', {
      event_id: eventId,
      verification_status: 'REJECTED',
      verification_method: 'HUMAN_REJECTED',
      is_active: false,
      rejected_by: event.rejected_by,
      rejected_at: event.rejected_at,
      rejection_reason: event.rejection_reason
    });

    console.log(`[Admin Verification] Event ${eventId} marked as REJECTED (${event.verification_method}) by ${event.rejected_by} (soft-deleted from active map)`);
    return res.json({ success: true, event_id: eventId, verification_status: 'REJECTED', verification_method: 'HUMAN_REJECTED', is_active: false, event });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/events/:eventId/reject:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/reports/send: Send GIS incident report to responsible department (Idempotent)
app.post('/api/admin/reports/send', requireAdminAuth, async (req, res) => {
  try {
    const { event_id, notes, supervisor } = req.body;
    if (!event_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: event_id' });
    }

    // Find the event (check in-memory first, then DB)
    let event = inMemoryEvents.get(event_id);
    if (!event && supabase.isSupabaseConfigured()) {
      const dbRes = await supabase.getPotholeEvents({ limit: 500 });
      if (dbRes.success && Array.isArray(dbRes.data)) {
        event = dbRes.data.find(e => e.event_id === event_id);
      }
    }

    if (!event) {
      return res.status(404).json({ success: false, error: `Event not found: ${event_id}` });
    }

    // Reporting eligibility: Event must be active and not rejected/discarded
    if (event.is_active === false || (event.verification_status && event.verification_status.toUpperCase() === 'REJECTED')) {
      return res.status(400).json({
        success: false,
        error: `Cannot dispatch report: Incident is inactive or discarded.`
      });
    }

    // Duplicate prevention: If report is already sent for this event, do not create duplicate
    if (event.report_status === 'SENT' && event.report_id) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Report already dispatched to department for this incident',
        report_id: event.report_id,
        status: 'SENT',
        event_id: event.event_id
      });
    }

    const taxonomy = resolveEventTaxonomy(event.class_name || event.problem || 'Pothole');
    const department = event.department || taxonomy.department;
    const category = event.category || taxonomy.category;
    const problem = event.class_name || event.problem || taxonomy.problem;

    // Resolve address if coordinates are available
    let locationAddress = 'Address unavailable';
    if (event.latitude && event.longitude) {
      const geo = await reverseGeocode(event.latitude, event.longitude);
      locationAddress = geo.formatted || `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`;
    }

    const report_id = `RPT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();

    const reportRecord = {
      report_id,
      event_id: event.event_id,
      department,
      category,
      problem,
      priority: event.priority || 'MEDIUM',
      risk_score: event.risk_score !== undefined && event.risk_score !== null ? parseInt(event.risk_score, 10) : 50,
      risk_level: event.risk_level || 'MEDIUM',
      status: 'SENT',
      latitude: event.latitude || null,
      longitude: event.longitude || null,
      location_address: locationAddress,
      evidence_image_url: event.evidence_image_url || null,
      notes: notes || 'Automated GIS incident report forwarded by DrishtiYana Command Center',
      dispatched_by: req.adminUser ? req.adminUser.username : (supervisor || 'admin'),
      dispatched_at: nowIso,
      created_at: nowIso
    };

    // Update in-memory event status & report reference
    event.report_status = 'SENT';
    event.report_id = report_id;
    inMemoryEvents.set(event.event_id, event);
    persistedReports.set(report_id, reportRecord);

    // Persist to Supabase if configured
    let dbSaved = false;
    if (supabase.isSupabaseConfigured()) {
      const saveRes = await supabase.saveDepartmentReport(reportRecord);
      const updateRes = await supabase.updateEventReportStatus(event.event_id, 'SENT', report_id);
      dbSaved = saveRes.success && updateRes.success;
    }

    // Broadcast report event to connected monitors
    io.emit('department-report-sent', {
      report_id,
      event_id: event.event_id,
      department,
      status: 'SENT',
      report: reportRecord
    });

    console.log(`[Department Report] Dispatched ${report_id} for ${event.event_id} -> ${department} (Addr: ${locationAddress})`);

    return res.status(200).json({
      success: true,
      report_id,
      event_id: event.event_id,
      department,
      status: 'SENT',
      location_address: locationAddress,
      dbSaved,
      report: reportRecord
    });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/reports/send:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/reports: List all dispatched department reports
app.get('/api/admin/reports', requireAdminAuth, async (req, res) => {
  try {
    const { department, status, limit } = req.query;
    let reports = Array.from(persistedReports.values());

    if (department && department !== 'all') {
      reports = reports.filter(r => r.department.toLowerCase().includes(department.toLowerCase()));
    }
    if (status && status !== 'all') {
      reports = reports.filter(r => r.status.toUpperCase() === status.toUpperCase());
    }

    reports.sort((a, b) => new Date(b.dispatched_at || 0) - new Date(a.dispatched_at || 0));

    if (limit) {
      reports = reports.slice(0, parseInt(limit, 10));
    }

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (err) {
    console.error('[Admin API Error] /api/admin/reports:', err.message);
    return res.status(500).json({ success: false, error: err.message, reports: [] });
  }
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

  // Update latestBusLocations for Citizen Portal (SOURCE A: Mobile Live GPS)
  const activeBusId = bus_id || PROTOTYPE_MOBILE_BUS.bus_id;
  const route = busRoutes.get(activeBusId) || PROTOTYPE_MOBILE_BUS;
  const busLocPayload = {
    bus_id: activeBusId,
    session_id,
    source_type: 'LIVE',
    latitude: latNum,
    longitude: lonNum,
    speed: locationRecord.speed,
    heading: locationRecord.heading,
    gps_timestamp: locationRecord.gps_timestamp,
    updated_at: Date.now(),
    source: route.source || PROTOTYPE_MOBILE_BUS.source,
    destination: route.destination || PROTOTYPE_MOBILE_BUS.destination,
    route_name: route.route_name || PROTOTYPE_MOBILE_BUS.route_name
  };
  latestBusLocations.set(activeBusId, busLocPayload);
  io.emit('citizen-bus-location', busLocPayload);

  res.status(200).json({
    success: true,
    server_received_at,
    dbConfigured: supabase.isSupabaseConfigured()
  });
});

// Load locally trusted mkcert development certificate from certs/ (or fall back to self-signed)
const certDir = path.join(__dirname, 'certs');
const certKeyPath = path.join(certDir, 'key.pem');
const certCrtPath = path.join(certDir, 'cert.pem');

let sslOptions = null;
if (fs.existsSync(certKeyPath) && fs.existsSync(certCrtPath)) {
  console.log('[HTTPS] Loading locally trusted mkcert development certificate from certs/');
  sslOptions = {
    key: fs.readFileSync(certKeyPath),
    cert: fs.readFileSync(certCrtPath)
  };
} else {
  console.warn('[HTTPS Warning] certs/key.pem or certs/cert.pem not found. Falling back to self-signed cert.');
  const attrs = [{ name: 'commonName', value: 'drishtiyana.local' }];
  const pems = selfsigned.generate(attrs, { days: 30, keySize: 2048 });
  sslOptions = {
    key: pems.private,
    cert: pems.cert
  };
}

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
    console.log(`[Verification Gate]: Auto-verify ≥ ${(AUTO_VERIFY_THRESHOLD * 100).toFixed(0)}% | Review: ${(REVIEW_THRESHOLD * 100).toFixed(0)}%–${((AUTO_VERIFY_THRESHOLD - 0.0001) * 100).toFixed(1)}% | Reject: < ${(REVIEW_THRESHOLD * 100).toFixed(0)}%`);
    console.log('\n[1] LAPTOP / LOCAL ACCESS:');
    console.log(`    👉 Admin Portal:  https://localhost:${HTTPS_PORT}/admin`);
    console.log(`    👉 Edge Monitor:  https://localhost:${HTTPS_PORT}/viewer`);
    console.log('\n[2] MOBILE BUS SENSOR & LAN ACCESS:');
    console.log(`    👉 Bus Sensor:    https://${primaryIp}:${HTTPS_PORT}/mobile`);
    console.log(`    👉 Admin Portal:  https://${primaryIp}:${HTTPS_PORT}/admin`);
    console.log(`    👉 Root CA Cert:  http://${primaryIp}:${HTTP_PORT}/ca.crt (Install on phone/laptop for trusted CA)`);
    console.log('============================================================\n');
  });
});
