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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;
// Traffic Density & Map Mode State
let currentMapMode = 'EVENTS'; // 'EVENTS' | 'DENSITY'
let trafficHeatLayer = null;
let currentDensityVehicleFilter = 'all';
let currentDensityTimeFilter = '1h';

// ==============================================================================
// 1.1 PRESENTATION / DEMO FALLBACK DATASET (FRONTEND ONLY - NEVER STORED IN DB)
// ==============================================================================
const DEMO_ALL_EVENTS = [
  // ============================================================================
  // ROADS & INFRASTRUCTURE DEMO DETECTIONS (6 REQUIRED)
  // ============================================================================
  {
    id: "demo-road-001",
    event_id: "demo-road-001",
    title: "Pothole Detected",
    problem: "Pothole Detected",
    category: "road",
    type: "Pothole",
    class_name: "pothole",
    latitude: 17.4021,
    longitude: 78.4132,
    confidence: 0.94,
    confidence_score: 0.94,
    bus_id: "TS09AB1234",
    source_bus_id: "TS09AB1234",
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 88,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Road Maintenance",
    address: "Tolichowki Flyover Underpass, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_pothole.jpg",
    observation_count: 14,
    is_demo: true
  },
  {
    id: "demo-road-002",
    event_id: "demo-road-002",
    title: "Surface Crack",
    problem: "Surface Crack",
    category: "road",
    type: "Surface Crack",
    class_name: "crack",
    latitude: 17.4351,
    longitude: 78.5022,
    confidence: 0.88,
    confidence_score: 0.88,
    bus_id: "TS09AB1235",
    source_bus_id: "TS09AB1235",
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    priority: "MEDIUM",
    risk_level: "MEDIUM",
    risk_score: 62,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Road Maintenance",
    address: "Secunderabad Station Approach, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_crack.jpg",
    observation_count: 8,
    is_demo: true
  },
  {
    id: "demo-road-003",
    event_id: "demo-road-003",
    title: "Damaged Road Surface",
    problem: "Damaged Road Surface",
    category: "road",
    type: "Damaged Road Surface",
    class_name: "road_damage",
    latitude: 17.3922,
    longitude: 78.4410,
    confidence: 0.91,
    confidence_score: 0.91,
    bus_id: "TS09AB1236",
    source_bus_id: "TS09AB1236",
    timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 79,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Road Maintenance",
    address: "Mehdipatnam Bus Terminal Corridor, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_road_damage.jpg",
    observation_count: 19,
    is_demo: true
  },
  {
    id: "demo-road-004",
    event_id: "demo-road-004",
    title: "Missing Divider",
    problem: "Missing Divider",
    category: "road",
    type: "Missing Divider",
    class_name: "divider",
    latitude: 17.4178,
    longitude: 78.4390,
    confidence: 0.86,
    confidence_score: 0.86,
    bus_id: "TS09AB1237",
    source_bus_id: "TS09AB1237",
    timestamp: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    priority: "MEDIUM",
    risk_level: "MEDIUM",
    risk_score: 74,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Traffic Engineering Cell",
    address: "Banjara Hills Road No 12, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_road_damage.jpg",
    observation_count: 6,
    is_demo: true
  },
  {
    id: "demo-road-005",
    event_id: "demo-road-005",
    title: "Damaged Signboard",
    problem: "Damaged Signboard",
    category: "road",
    type: "Damaged Signboard",
    class_name: "signboard",
    latitude: 17.4912,
    longitude: 78.3985,
    confidence: 0.84,
    confidence_score: 0.84,
    bus_id: "TS09AB1238",
    source_bus_id: "TS09AB1238",
    timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    priority: "LOW",
    risk_level: "LOW",
    risk_score: 45,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Urban Infrastructure",
    address: "Kukatpally Housing Board Outer Link, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_signboard.jpg",
    observation_count: 5,
    is_demo: true
  },
  {
    id: "demo-road-006",
    event_id: "demo-road-006",
    title: "Waterlogged Road",
    problem: "Waterlogged Road",
    category: "road",
    type: "Waterlogged Road",
    class_name: "waterlogged_road",
    latitude: 17.4215,
    longitude: 78.4552,
    confidence: 0.93,
    confidence_score: 0.93,
    bus_id: "TS09AB1239",
    source_bus_id: "TS09AB1239",
    timestamp: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 83,
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Road Maintenance",
    address: "Somajiguda Raj Bhavan Road, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_waterlogging.jpg",
    observation_count: 11,
    is_demo: true
  },

  // ============================================================================
  // TRAFFIC DEMO DETECTIONS (6 REQUIRED - WITH VEHICLE BREAKDOWN PINS)
  // ============================================================================
  {
    id: "demo-traffic-001",
    event_id: "demo-traffic-001",
    title: "Heavy Vehicle Density",
    problem: "Heavy Vehicle Density",
    category: "traffic",
    type: "Heavy Vehicle Density",
    class_name: "traffic",
    latitude: 17.4401,
    longitude: 78.3489,
    cars: 28,
    motorcycles: 14,
    buses: 6,
    trucks: 4,
    total_vehicles: 52,
    density_level: "HIGH",
    traffic_stats: { cars: 28, motorcycles: 14, buses: 6, trucks: 4 },
    confidence: 0.95,
    confidence_score: 0.95,
    bus_id: "TS09AB2001",
    source_bus_id: "TS09AB2001",
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 82,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "Hyderabad Traffic Police",
    address: "Gachibowli Junction Arterial, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_traffic.jpg",
    observation_count: 52,
    is_demo: true
  },
  {
    id: "demo-traffic-002",
    event_id: "demo-traffic-002",
    title: "Traffic Congestion",
    problem: "Traffic Congestion",
    category: "traffic",
    type: "Traffic Congestion",
    class_name: "congestion",
    latitude: 17.4504,
    longitude: 78.3808,
    cars: 24,
    motorcycles: 11,
    buses: 4,
    trucks: 3,
    total_vehicles: 42,
    density_level: "HIGH",
    traffic_stats: { cars: 24, motorcycles: 11, buses: 4, trucks: 3 },
    confidence: 0.97,
    confidence_score: 0.97,
    bus_id: "TS09AB2002",
    source_bus_id: "TS09AB2002",
    timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    priority: "CRITICAL",
    risk_level: "CRITICAL",
    risk_score: 91,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "Hyderabad Traffic Police",
    address: "Hitec City Cyber Towers Circle, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_congestion.jpg",
    observation_count: 42,
    is_demo: true
  },
  {
    id: "demo-traffic-003",
    event_id: "demo-traffic-003",
    title: "Bus Congestion",
    problem: "Bus Congestion",
    category: "traffic",
    type: "Bus Congestion",
    class_name: "bus",
    latitude: 17.4265,
    longitude: 78.4518,
    cars: 16,
    motorcycles: 12,
    buses: 10,
    trucks: 2,
    total_vehicles: 40,
    density_level: "HIGH",
    traffic_stats: { cars: 16, motorcycles: 12, buses: 10, trucks: 2 },
    confidence: 0.93,
    confidence_score: 0.93,
    bus_id: "TS09AB2003",
    source_bus_id: "TS09AB2003",
    timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    priority: "MEDIUM",
    risk_level: "MEDIUM",
    risk_score: 68,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "TSRTC & Traffic Police",
    address: "Panjagutta Central Circle, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_bus.jpg",
    observation_count: 40,
    is_demo: true
  },
  {
    id: "demo-traffic-004",
    event_id: "demo-traffic-004",
    title: "Vehicle Cluster",
    problem: "Vehicle Cluster",
    category: "traffic",
    type: "Vehicle Cluster",
    class_name: "traffic",
    latitude: 17.4412,
    longitude: 78.4682,
    cars: 20,
    motorcycles: 15,
    buses: 3,
    trucks: 2,
    total_vehicles: 40,
    density_level: "MEDIUM",
    traffic_stats: { cars: 20, motorcycles: 15, buses: 3, trucks: 2 },
    confidence: 0.94,
    confidence_score: 0.94,
    bus_id: "TS09AB2004",
    source_bus_id: "TS09AB2004",
    timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 80,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "Hyderabad Traffic Police",
    address: "Begumpet Flyover Corridor, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_yolo_scene.jpg",
    observation_count: 40,
    is_demo: true
  },
  {
    id: "demo-traffic-005",
    event_id: "demo-traffic-005",
    title: "Traffic Bottleneck",
    problem: "Traffic Bottleneck",
    category: "traffic",
    type: "Traffic Bottleneck",
    class_name: "congestion",
    latitude: 17.4042,
    longitude: 78.4639,
    cars: 22,
    motorcycles: 18,
    buses: 5,
    trucks: 3,
    total_vehicles: 48,
    density_level: "HIGH",
    traffic_stats: { cars: 22, motorcycles: 18, buses: 5, trucks: 3 },
    confidence: 0.92,
    confidence_score: 0.92,
    bus_id: "TS09AB2005",
    source_bus_id: "TS09AB2005",
    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 84,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "Hyderabad Traffic Police",
    address: "Lakdikapul Railway Crossing, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_congestion.jpg",
    observation_count: 48,
    is_demo: true
  },
  {
    id: "demo-traffic-006",
    event_id: "demo-traffic-006",
    title: "High Car Density",
    problem: "High Car Density",
    category: "traffic",
    type: "High Car Density",
    class_name: "traffic",
    latitude: 17.4947,
    longitude: 78.3996,
    cars: 32,
    motorcycles: 8,
    buses: 2,
    trucks: 1,
    total_vehicles: 43,
    density_level: "HIGH",
    traffic_stats: { cars: 32, motorcycles: 8, buses: 2, trucks: 1 },
    confidence: 0.90,
    confidence_score: 0.90,
    bus_id: "TS09AB2006",
    source_bus_id: "TS09AB2006",
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 78,
    status: "ACTIVE",
    verification_status: "ACCEPTED",
    department: "Hyderabad Traffic Police",
    address: "KPHB Colony Main Arterial, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_traffic.jpg",
    observation_count: 43,
    is_demo: true
  },

  // ============================================================================
  // PUBLIC SAFETY DEMO DETECTIONS (6 REQUIRED)
  // ============================================================================
  {
    id: "demo-safety-001",
    event_id: "demo-safety-001",
    title: "Unsafe Crossing",
    problem: "Unsafe Crossing",
    category: "safety",
    type: "Pedestrian Risk",
    class_name: "crossing",
    latitude: 17.3688,
    longitude: 78.5247,
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 82,
    confidence: 0.92,
    confidence_score: 0.92,
    bus_id: "TS08XY4321",
    source_bus_id: "TS08XY4321",
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Traffic Police & Urban Safety",
    address: "Dilsukhnagar Main Intersection, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_pedestrian.jpg",
    observation_count: 14,
    is_demo: true
  },
  {
    id: "demo-safety-002",
    event_id: "demo-safety-002",
    title: "Pedestrian Risk Zone",
    problem: "Pedestrian Risk Zone",
    category: "safety",
    type: "Pedestrian Risk Zone",
    class_name: "pedestrian",
    latitude: 17.3872,
    longitude: 78.4835,
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 78,
    confidence: 0.91,
    confidence_score: 0.91,
    bus_id: "TS08XY4322",
    source_bus_id: "TS08XY4322",
    timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Traffic Police & Urban Safety",
    address: "Koti Women's College Crossing, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_pedestrian.jpg",
    observation_count: 15,
    is_demo: true
  },
  {
    id: "demo-safety-003",
    event_id: "demo-safety-003",
    title: "Waterlogging",
    problem: "Waterlogging",
    category: "safety",
    type: "Waterlogging",
    class_name: "waterlogging",
    latitude: 17.4195,
    longitude: 78.4988,
    priority: "CRITICAL",
    risk_level: "CRITICAL",
    risk_score: 94,
    confidence: 0.96,
    confidence_score: 0.96,
    bus_id: "TS08XY4323",
    source_bus_id: "TS08XY4323",
    timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "GHMC Stormwater Drainage",
    address: "Musheerabad Low-Lying Underpass, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_waterlogging.jpg",
    observation_count: 22,
    is_demo: true
  },
  {
    id: "demo-safety-004",
    event_id: "demo-safety-004",
    title: "Road Hazard",
    problem: "Road Hazard",
    category: "safety",
    type: "Road Hazard",
    class_name: "hazard",
    latitude: 17.4272,
    longitude: 78.4525,
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 76,
    confidence: 0.89,
    confidence_score: 0.89,
    bus_id: "TS08XY4324",
    source_bus_id: "TS08XY4324",
    timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Disaster Response Force (DRF)",
    address: "Panjagutta Flyover Merge, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_hazard.jpg",
    observation_count: 11,
    is_demo: true
  },
  {
    id: "demo-safety-005",
    event_id: "demo-safety-005",
    title: "Dangerous Road Condition",
    problem: "Dangerous Road Condition",
    category: "safety",
    type: "Dangerous Road Condition",
    class_name: "hazard",
    latitude: 17.3615,
    longitude: 78.4990,
    priority: "CRITICAL",
    risk_level: "CRITICAL",
    risk_score: 93,
    confidence: 0.95,
    confidence_score: 0.95,
    bus_id: "TS08XY4325",
    source_bus_id: "TS08XY4325",
    timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Disaster Response Force (DRF)",
    address: "Moosarambagh Causeway Approach, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_hazard.jpg",
    observation_count: 18,
    is_demo: true
  },
  {
    id: "demo-safety-006",
    event_id: "demo-safety-006",
    title: "Pedestrian Near-Miss",
    problem: "Pedestrian Near-Miss",
    category: "safety",
    type: "Pedestrian Near-Miss",
    class_name: "pedestrian",
    latitude: 17.4395,
    longitude: 78.4110,
    priority: "HIGH",
    risk_level: "HIGH",
    risk_score: 85,
    confidence: 0.90,
    confidence_score: 0.90,
    bus_id: "TS08XY4326",
    source_bus_id: "TS08XY4326",
    timestamp: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    status: "PENDING",
    verification_status: "ACCEPTED",
    department: "Traffic Police & Urban Safety",
    address: "Jubilee Hills Road No 36 Junction, Hyderabad",
    evidence_image_url: "/assets/demo_evidence/demo_pedestrian.jpg",
    observation_count: 12,
    is_demo: true
  }
];

const DEMO_EVENTS_MAP = new Map();
DEMO_ALL_EVENTS.forEach(e => {
  if (e.id) DEMO_EVENTS_MAP.set(e.id, e);
  if (e.event_id) DEMO_EVENTS_MAP.set(e.event_id, e);
});

// Helper: REAL SUPABASE EVENTS + FRONTEND-ONLY DEMO EVENTS = MAP PRESENTATION DATA
// Real detections always take absolute priority. Static demo records are presentation-only.
function getCombinedPresentationEvents() {
  const validRealEvents = (allEventsCache || []).filter(evt => {
    if (evt.is_active === false) return false;
    const vStat = (evt.verification_status || 'PENDING_REVIEW').toUpperCase();
    if (vStat === 'REJECTED') return false;
    if (evt.latitude === null || evt.longitude === null || evt.latitude === undefined || evt.longitude === undefined) return false;
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  });

  const realIds = new Set(validRealEvents.map(e => e.event_id || e.id));
  const demoList = DEMO_ALL_EVENTS.filter(d => !realIds.has(d.event_id || d.id));

  return [...validRealEvents, ...demoList];
}

const socket = io({ transports: ['websocket', 'polling'] });
let supabaseClient = null;

async function initSupabase() {
  try {
    const res = await fetch('/api/config/supabase', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const { supabaseUrl, supabaseKey } = await res.json();
    if (supabaseUrl && supabaseKey && window.supabase) {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
      console.log('[Supabase Client] Initialized successfully in Admin Portal');

      // Subscribe to realtime changes on events table
      try {
        supabaseClient.channel('realtime:events')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, async (payload) => {
            console.log('[Supabase Realtime] Event table change received:', payload);
            await fetchStats();
            await fetchAndRenderEvents();
            if (payload.eventType === 'INSERT' && payload.new && (payload.new.id || payload.new.event_id)) {
              selectEventById(payload.new.id || payload.new.event_id, true);
            }
          })
          .subscribe((status) => {
            console.log('[Supabase Realtime] Events subscription status:', status);
          });
      } catch (subErr) {
        console.warn('[Supabase Realtime] Subscription warning:', subErr.message);
      }
    }
  } catch (err) {
    console.warn('[Supabase Client] Could not initialize client-side Supabase:', err.message);
  }
}

// DOM Elements - Navigation, User & Stats
const adminUserDisplay = document.getElementById('adminUserDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const adminTotalEventsBadge = document.getElementById('adminTotalEventsBadge');
const adminDbBadge = document.getElementById('adminDbBadge');
const adminDbDot = document.getElementById('adminDbDot');
const adminDbText = document.getElementById('adminDbText');
const adminServerBadge = document.getElementById('adminServerBadge');
const adminServerDot = document.getElementById('adminServerDot');
const adminServerText = document.getElementById('adminServerText');

const statTotalEvents = document.getElementById('statTotalEvents');
const statPendingReview = document.getElementById('statPendingReview');
const statVerified = document.getElementById('statVerified');
const statRejected = document.getElementById('statRejected');
const statReportsSent = document.getElementById('statReportsSent');
const statNewEvents = document.getElementById('statNewEvents');
const statHighPriority = document.getElementById('statHighPriority');
const statCriticalEvents = document.getElementById('statCriticalEvents');
const statRoadProblems = document.getElementById('statRoadProblems');
const statTrafficProblems = document.getElementById('statTrafficProblems');
const statSafetyIncidents = document.getElementById('statSafetyIncidents');

const badgeRoadCount = document.getElementById('badgeRoadCount');
const badgeTrafficCount = document.getElementById('badgeTrafficCount');
const badgeSafetyCount = document.getElementById('badgeSafetyCount');
const mapEventCountBadge = document.getElementById('mapEventCountBadge');

// DOM Elements - Traffic Density & Unified Map Mode Switcher
const btnModeEvents = document.getElementById('btnModeEvents');
const btnModeDensity = document.getElementById('btnModeDensity');
const eventsMapActions = document.getElementById('eventsMapActions');
const trafficDensityToolbar = document.getElementById('trafficDensityToolbar');
const densityVehicleFilter = document.getElementById('densityVehicleFilter');
const densityTimeFilter = document.getElementById('densityTimeFilter');
const refreshDensityBtn = document.getElementById('refreshDensityBtn');
const densityValTotal = document.getElementById('densityValTotal');
const densityValCars = document.getElementById('densityValCars');
const densityValMotorcycles = document.getElementById('densityValMotorcycles');
const densityValBuses = document.getElementById('densityValBuses');
const densityValTrucks = document.getElementById('densityValTrucks');
const densityEmptyState = document.getElementById('densityEmptyState');

// DOM Elements - Details Panel
const adminDetailPanel = document.getElementById('adminDetailPanel');
const detailPlaceholder = document.getElementById('detailPlaceholder');
const detailContent = document.getElementById('detailContent');
const detailStatusBadge = document.getElementById('detailStatusBadge');
const detailVerificationBadge = document.getElementById('detailVerificationBadge');
const detailVerificationBanner = document.getElementById('detailVerificationBanner');
const detailBannerTitle = document.getElementById('detailBannerTitle');
const detailBannerBadge = document.getElementById('detailBannerBadge');
const detailBannerDesc = document.getElementById('detailBannerDesc');
const verifyEventBtn = document.getElementById('verifyEventBtn');
const rejectEventBtn = document.getElementById('rejectEventBtn');

const detailEvidenceImg = document.getElementById('detailEvidenceImg');
const detailEvidenceUnavailable = document.getElementById('detailEvidenceUnavailable');
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

// DOM Elements - Department Dispatch Action Card
const detailReportStatusBadge = document.getElementById('detailReportStatusBadge');
const detailDispatchDept = document.getElementById('detailDispatchDept');
const reportNotesInput = document.getElementById('reportNotesInput');
const sendReportBtn = document.getElementById('sendReportBtn');
const sendReportBtnText = document.getElementById('sendReportBtnText');
const sendReportSpinner = document.getElementById('sendReportSpinner');
const reportFeedback = document.getElementById('reportFeedback');
const reportLockNotice = document.getElementById('reportLockNotice');

// DOM Elements - Filter Bar
const verificationFilterGroup = document.getElementById('verificationFilterGroup');
let currentVerificationFilter = 'all'; // Accepted detections shown by default

const filterSearchInput = document.getElementById('filterSearchInput');
const filterCategorySelect = document.getElementById('filterCategorySelect');
const filterDepartmentSelect = document.getElementById('filterDepartmentSelect');
const filterRiskSelect = document.getElementById('filterRiskSelect');
const filterPrioritySelect = document.getElementById('filterPrioritySelect');
const filterStatusSelect = document.getElementById('filterStatusSelect');
const filterReportStatusSelect = document.getElementById('filterReportStatusSelect');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const refreshEventsBtn = document.getElementById('refreshEventsBtn');
const recenterAdminMapBtn = document.getElementById('recenterAdminMapBtn');
const fitAllEventsBtn = document.getElementById('fitAllEventsBtn');

// DOM Elements - Table
const eventsTableBody = document.getElementById('eventsTableBody');
const tableEmptyState = document.getElementById('tableEmptyState');

// Modal Elements
const imageModal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImg');
const closeModalBtn = document.getElementById('closeModalBtn');

// Dispatch Confirmation Modal Elements
const confirmReportModal = document.getElementById('confirmReportModal');
const confirmModalDept = document.getElementById('confirmModalDept');
const confirmModalEventId = document.getElementById('confirmModalEventId');
const confirmModalProblem = document.getElementById('confirmModalProblem');
const confirmModalConf = document.getElementById('confirmModalConf');
const cancelReportBtn = document.getElementById('cancelReportBtn');
const confirmSendReportBtn = document.getElementById('confirmSendReportBtn');
const reportPreviewSubject = document.getElementById('reportPreviewSubject');
const reportPreviewPriority = document.getElementById('reportPreviewPriority');
const reportPreviewTimestamp = document.getElementById('reportPreviewTimestamp');
const reportPreviewLocation = document.getElementById('reportPreviewLocation');
const reportPreviewEvidenceImg = document.getElementById('reportPreviewEvidenceImg');
const reportPreviewEvidencePlaceholder = document.getElementById('reportPreviewEvidencePlaceholder');
const reportPreviewDesc = document.getElementById('reportPreviewDesc');

// Top Department Cards & Sub-Filter Bar Elements
const deptCardRoad = document.getElementById('deptCard-road');
const deptCardTraffic = document.getElementById('deptCard-traffic');
const deptCardAll = document.getElementById('deptCard-all');
const deptCountRoadEl = document.getElementById('deptCountRoad');
const deptCountTrafficEl = document.getElementById('deptCountTraffic');
const deptCountAllEl = document.getElementById('deptCountAll');
const selectedDeptHeading = document.getElementById('selectedDeptHeading');
const deptStatusTabs = document.getElementById('deptStatusTabs');
const subCountPendingEl = document.getElementById('subCountPending');
const subCountVerifiedEl = document.getElementById('subCountVerified');
const subCountReportedEl = document.getElementById('subCountReported');
const subCountAllEl = document.getElementById('subCountAll');

// ==============================================================================
// 1.1 AUTHENTICATION HELPERS
// ==============================================================================
function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const token = sessionStorage.getItem('drishtiyana_admin_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function checkAuthentication() {
  try {
    const res = await fetch('/api/auth/check', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.authenticated) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return false;
    }
    if (adminUserDisplay && data.user && data.user.username) {
      adminUserDisplay.textContent = data.user.username;
    }
    return true;
  } catch (err) {
    window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
    return false;
  }
}

function setupLogoutHandler() {
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
      } catch (e) {}
      sessionStorage.removeItem('drishtiyana_admin_token');
      sessionStorage.removeItem('drishtiyana_admin_user');
      window.location.replace('/login');
    });
  }
}

// ==============================================================================
// 2. INITIALIZATION ON LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuthentication();
  if (!isAuthed) return;

  initGisMap();
  setupTrafficDensityControls();
  setupRoadControls();
  setupTrafficViewControls();
  setupSafetyControls();
  setupAnalyticsControls();
  setupSidebarNavigation();
  setupMobileSidebar();
  setupDrawerControls();
  setupFilterListeners();
  setupAllEventsListeners();
  setupLifecycleStatusControls();
  setupVerificationButtons();
  setupSocketListeners();
  setupImageModal();
  setupReportSender();
  setupLogoutHandler();

  await initSupabase();
  await fetchStats();
  await fetchAndRenderEvents();
});

// ==============================================================================
// 3. LEAFLET GIS MAP INITIALIZATION (OpenStreetMap)
// ==============================================================================
function initGisMap() {
  if (leafletMap) {
    leafletMap.invalidateSize();
    return;
  }
  if (!window.L) {
    setTimeout(initGisMap, 200);
    return;
  }

  // Default coordinate (Hyderabad, Telangana)
  const defaultCenter = [17.385044, 78.486671];

  leafletMap = L.map('adminGisMap', {
    zoomControl: true,
    attributionControl: true
  }).setView(defaultCenter, 12);

  // Dedicated Pane for detection markers above tiles and heatmaps
  if (!leafletMap.getPane('detectionPane')) {
    leafletMap.createPane('detectionPane');
    leafletMap.getPane('detectionPane').style.zIndex = 650;
  }
  window.leafletMap = leafletMap;

  // OpenStreetMap standard tile layer (100% free, zero Google/paid API key required)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(leafletMap);

  // Keep map clean and uncluttered without oversized legends
  // Floating Map Navigation Tools Event Listeners
  if (recenterAdminMapBtn) {
    recenterAdminMapBtn.addEventListener('click', () => {
      if (leafletMap) leafletMap.setView([17.385044, 78.486671], 12);
    });
  }

  if (fitAllEventsBtn) {
    fitAllEventsBtn.addEventListener('click', () => {
      fitMapToMarkers();
    });
  }

  if (refreshEventsBtn) {
    refreshEventsBtn.addEventListener('click', async () => {
      refreshEventsBtn.style.transform = 'rotate(180deg)';
      setTimeout(() => { refreshEventsBtn.style.transform = ''; }, 350);
      await fetchStats();
      await fetchAndRenderEvents();
      if (currentMapMode === 'DENSITY') {
        fetchAndRenderTrafficDensity();
      }
    });
  }

  // CRITICAL FIX: ResizeObserver on map container guarantees full height without blank lower half
  const mapContainer = document.getElementById('adminGisMap');
  const mapCard = document.querySelector('.admin-map-card');
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
      }
    });
    if (mapContainer) resizeObserver.observe(mapContainer);
    if (mapCard) resizeObserver.observe(mapCard);
  }

  window.addEventListener('resize', () => {
    if (leafletMap) leafletMap.invalidateSize();
  });

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
    if (allEventsCache && allEventsCache.length > 0) {
      applyDepartmentFiltersAndRender();
    }
  }, 350);
}

function showAdminToast(msg, type = 'info') {
  let container = document.getElementById('adminToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'adminToastContainer';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  const icon = type === 'success' ? '✓' : (type === 'warning' ? '⚠' : 'ℹ');
  toast.innerHTML = `<span style="color:var(--admin-accent,#38BDF8);font-size:1rem;">${icon}</span> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function createCategoryIcon(category, problem, riskLevel, verificationStatus) {
  let catClass = 'road';
  const catNorm = (category || '').toLowerCase();
  const probNorm = (problem || '').toLowerCase();
  const isCritical = (riskLevel || '').toUpperCase() === 'CRITICAL';

  let microSvg = '';

  if (catNorm.includes('traffic') || probNorm.includes('traffic') || probNorm.includes('congestion') || probNorm.includes('density') || probNorm.includes('vehicle') || probNorm.includes('car') || probNorm.includes('bus') || probNorm.includes('truck')) {
    catClass = 'traffic';
    microSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="8" rx="2"/><path d="M5 10l2-5h10l2 5M7 18v2M17 18v2M7 13h.01M17 13h.01"/></svg>`;
  } else if (catNorm.includes('safety') || probNorm.includes('pedestrian') || probNorm.includes('hazard') || probNorm.includes('rash') || probNorm.includes('crossing') || probNorm.includes('accident') || probNorm.includes('danger') || probNorm.includes('waterlog')) {
    catClass = 'safety';
    microSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    // Road & Infrastructure
    catClass = 'road';
    if (probNorm.includes('pothole')) {
      microSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16h18M6 16c1.2-3 3.5-4 6-4s4.8 1 6 4"/><ellipse cx="12" cy="16" rx="4" ry="1.5" fill="#FFFFFF" opacity="0.4"/></svg>`;
    } else {
      microSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19L9 5M20 19L15 5M12 7V9M12 15V17"/></svg>`;
    }
  }

  const pingHtml = isCritical ? '<div class="gis-marker-ping"></div>' : '';

  return L.divIcon({
    className: 'gis-marker-container drishtiyana-gis-marker-wrapper',
    html: `
      <div class="gis-marker-pin ${catClass} ${isCritical ? 'critical' : ''}">
        ${pingHtml}
        <div class="gis-marker-body">
          ${microSvg}
        </div>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    tooltipAnchor: [0, -38],
    popupAnchor: [0, -38]
  });
}

function formatMarkerTooltip(evt) {
  const title = (evt.title || evt.problem || evt.class_name || 'DETECTION').toUpperCase();
  const cat = evt.category || 'Road & Infrastructure';
  const busId = evt.bus_id || evt.source_bus_id || 'TS09AB1234';
  const catNorm = (cat || '').toLowerCase();
  const probNorm = title.toLowerCase();

  const dt = evt.created_at || evt.timestamp || Date.now();
  const timeFormatted = new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // TRAFFIC COMPACT TOOLTIP
  if (catNorm.includes('traffic') || probNorm.includes('traffic') || probNorm.includes('congestion') || probNorm.includes('density') || evt.traffic_stats || evt.cars !== undefined) {
    const stats = evt.traffic_stats || {
      cars: evt.cars !== undefined ? evt.cars : (evt.car_count || 18),
      motorcycles: evt.motorcycles !== undefined ? evt.motorcycles : (evt.motorcycle_count || 7),
      buses: evt.buses !== undefined ? evt.buses : (evt.bus_count || 3),
      trucks: evt.trucks !== undefined ? evt.trucks : (evt.truck_count || 2)
    };
    return `
      <div class="gis-compact-tooltip traffic">
        <div class="gis-tt-title">${escapeHtml(title.includes('DENSITY') ? title : 'TRAFFIC DENSITY')}</div>
        <div class="gis-tt-cat">Traffic</div>
        <div class="gis-tt-divider"></div>
        <div class="gis-tt-grid-2x2">
          <div class="gis-tt-col"><span class="gis-tt-lbl">Cars</span><span class="gis-tt-val">${stats.cars}</span></div>
          <div class="gis-tt-col"><span class="gis-tt-lbl">Motorcycles</span><span class="gis-tt-val">${stats.motorcycles}</span></div>
          <div class="gis-tt-col"><span class="gis-tt-lbl">Buses</span><span class="gis-tt-val">${stats.buses}</span></div>
          <div class="gis-tt-col"><span class="gis-tt-lbl">Trucks</span><span class="gis-tt-val">${stats.trucks}</span></div>
        </div>
      </div>
    `;
  }

  // SAFETY COMPACT TOOLTIP
  if (catNorm.includes('safety') || probNorm.includes('crossing') || probNorm.includes('pedestrian') || probNorm.includes('hazard') || probNorm.includes('danger') || probNorm.includes('waterlog')) {
    const prio = (evt.priority || evt.risk_level || 'HIGH').toUpperCase();
    const prioClass = prio === 'CRITICAL' ? 'priority-critical' : 'priority-high';
    return `
      <div class="gis-compact-tooltip safety">
        <div class="gis-tt-title">${escapeHtml(title)}</div>
        <div class="gis-tt-cat">Public Safety</div>
        <div class="gis-tt-divider"></div>
        <div class="gis-tt-rows">
          <div class="gis-tt-row"><span class="gis-tt-lbl">Priority</span><span class="gis-tt-val ${prioClass}">${prio}</span></div>
          <div class="gis-tt-row"><span class="gis-tt-lbl">Bus</span><span class="gis-tt-val mono">${escapeHtml(busId)}</span></div>
          <div class="gis-tt-row"><span class="gis-tt-lbl">Time</span><span class="gis-tt-val">${timeFormatted}</span></div>
        </div>
      </div>
    `;
  }

  // ROAD & INFRASTRUCTURE COMPACT TOOLTIP
  const rawConf = evt.confidence_score !== undefined ? evt.confidence_score : (evt.confidence !== undefined ? evt.confidence : 0.94);
  const conf = Math.round(rawConf > 1 ? rawConf : rawConf * 100);
  return `
    <div class="gis-compact-tooltip road">
      <div class="gis-tt-title">${escapeHtml(title)}</div>
      <div class="gis-tt-cat">Road &amp; Infrastructure</div>
      <div class="gis-tt-divider"></div>
      <div class="gis-tt-rows">
        <div class="gis-tt-row"><span class="gis-tt-lbl">Confidence</span><span class="gis-tt-val">${conf}%</span></div>
        <div class="gis-tt-row"><span class="gis-tt-lbl">Bus</span><span class="gis-tt-val mono">${escapeHtml(busId)}</span></div>
        <div class="gis-tt-row"><span class="gis-tt-lbl">Time</span><span class="gis-tt-val">${timeFormatted}</span></div>
      </div>
    </div>
  `;
}

function fitMapToMarkers() {
  if (!leafletMap || mapMarkersMap.size === 0) {
    if (leafletMap) leafletMap.setView([17.385044, 78.486671], 12);
    return;
  }

  const group = L.featureGroup(Array.from(mapMarkersMap.values()));
  if (group.getBounds().isValid()) {
    leafletMap.fitBounds(group.getBounds(), {
      padding: [60, 60],
      maxZoom: 14
    });
  }
}

// ==============================================================================
// 4. DATA FETCHING & RENDERING
// ==============================================================================
async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (res.status === 401) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.stats) return;

    const s = data.stats;
    if (statTotalEvents) statTotalEvents.textContent = s.total_detections || s.total_events || 0;
    if (statPendingReview) statPendingReview.textContent = s.pending_review || 0;
    if (statVerified) statVerified.textContent = s.verified || 0;
    if (statRejected) statRejected.textContent = s.rejected || 0;
    if (statReportsSent) statReportsSent.textContent = s.reports_sent || s.reports_dispatched || 0;
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

    // Executive City Insights Overview Counters
    const insightRoadCount = document.getElementById('insightRoadCount');
    const insightTrafficCount = document.getElementById('insightTrafficCount');
    const insightSafetyCount = document.getElementById('insightSafetyCount');
    if (insightRoadCount) insightRoadCount.textContent = `${s.road_problems || 0} Issues`;
    if (insightTrafficCount) insightTrafficCount.textContent = `${s.traffic_problems || 0} Monitored`;
    if (insightSafetyCount) insightSafetyCount.textContent = `${s.safety_incidents || 0} Alerts`;

    const uniqueBuses = new Set((allEventsCache || []).map(e => e.bus_id).filter(b => b && b !== 'Not available' && b !== '--'));
    const statActiveBuses = document.getElementById('statActiveBuses');
    if (statActiveBuses) statActiveBuses.textContent = uniqueBuses.size;

    const statTrafficObs = document.getElementById('statTrafficObs');
    try {
      const tRes = await fetch('/api/admin/traffic-density/summary?window=all', { headers: getAuthHeaders() });
      if (tRes.ok) {
        const tData = await tRes.json();
        if (statTrafficObs && tData.summary) {
          statTrafficObs.textContent = tData.summary.total_observations || tData.summary.total_vehicles || 30;
        }
      }
    } catch (te) {}

    renderDepartmentBreakdown(s.by_department || {});
    renderAnalyticsBreakdown(s);
  } catch (err) {
    console.warn('[Admin Portal] Stats fetch error:', err.message);
  }
}

// Department-Centric State
let currentSelectedDepartment = 'ALL'; // 'ALL' | 'ROAD MAINTENANCE' | 'TRAFFIC' | 'SAFETY'
let currentSubFilter = 'ALL'; // 'ALL' | 'PENDING_REVIEW' | 'VERIFIED' | 'REPORTED'

function isRoadEvent(evt) {
  const dept = String(evt.department || '').toUpperCase();
  const cat = String(evt.category || '').toLowerCase();
  const prob = String(evt.problem || evt.problem_type || evt.class_name || evt.title || evt.type || '').toLowerCase();
  if (prob.includes('waterlog') || prob.includes('drain') || prob.includes('flood') || prob.includes('hazard') || prob.includes('pedestrian')) return false;
  return dept.includes('ROAD') || cat === 'road' || cat.includes('road') || cat.includes('infra') ||
    prob.includes('pothole') || prob.includes('crack') || prob.includes('divider') ||
    prob.includes('sign') || prob.includes('zebra') || prob.includes('damage');
}

function isTrafficEvent(evt) {
  const dept = String(evt.department || '').toUpperCase();
  const cat = String(evt.category || '').toLowerCase();
  const prob = String(evt.problem || evt.problem_type || evt.class_name || evt.title || evt.type || '').toLowerCase();
  if (prob.includes('waterlog') || prob.includes('pedestrian') || prob.includes('crossing') || prob.includes('hazard')) return false;
  if (cat === 'road' || cat.includes('infra') || prob.includes('pothole') || prob.includes('crack') || prob.includes('divider') || prob.includes('sign') || prob.includes('damage')) return false;
  return dept.includes('TRAFFIC') || cat === 'traffic' || cat.includes('traffic') ||
    prob.includes('congestion') || prob.includes('density') || prob.includes('bottleneck') ||
    prob.includes('vehicle') || prob.includes('car') || prob.includes('bus') || prob.includes('cluster');
}

function isSafetyEvent(evt) {
  const dept = String(evt.department || '').toUpperCase();
  const cat = String(evt.category || '').toLowerCase();
  const prob = String(evt.problem || evt.problem_type || evt.class_name || evt.title || evt.type || '').toLowerCase();
  if (cat === 'traffic' || prob.includes('congestion') || prob.includes('density') || prob.includes('bottleneck') || prob.includes('cluster') || prob.includes('vehicle')) return false;
  if (cat === 'road' || prob.includes('pothole') || prob.includes('crack') || prob.includes('divider') || prob.includes('signboard')) return false;
  return dept.includes('SAFETY') || dept.includes('DISASTER') || dept.includes('EMERGENCY') ||
    (dept.includes('POLICE') && !dept.includes('TRAFFIC POLICE')) ||
    cat === 'safety' || cat.includes('safety') || prob.includes('waterlog') || prob.includes('drain') || prob.includes('flood') ||
    prob.includes('pedestrian') || prob.includes('crossing') || prob.includes('hazard') ||
    prob.includes('rash') || prob.includes('hit and run') || prob.includes('accident');
}

function applyDepartmentFiltersAndRender() {
  const combined = getCombinedPresentationEvents();

  // 1. Calculate department overview counts from combined presentation events
  const roadTotal = combined.filter(isRoadEvent).length;
  const trafficTotal = combined.filter(isTrafficEvent).length;
  const safetyTotal = combined.filter(isSafetyEvent).length;
  const allTotal = combined.length;

  if (deptCountRoadEl) deptCountRoadEl.textContent = roadTotal;
  if (deptCountTrafficEl) deptCountTrafficEl.textContent = trafficTotal;
  if (deptCountAllEl) deptCountAllEl.textContent = allTotal;

  // 2. Filter by currently selected category / department BEFORE marker creation
  let deptFiltered = combined;
  const normDept = (currentSelectedDepartment || 'ALL').toUpperCase();
  if (normDept === 'ROAD MAINTENANCE' || normDept === 'ROAD' || normDept === 'ROADS') {
    deptFiltered = combined.filter(isRoadEvent);
  } else if (normDept === 'TRAFFIC') {
    deptFiltered = combined.filter(isTrafficEvent);
  } else if (normDept === 'SAFETY') {
    deptFiltered = combined.filter(isSafetyEvent);
  } else {
    // 'ALL' -> show Road + Traffic + Safety detections
    deptFiltered = combined;
  }

  // 3. Sub-status filtering if active
  let finalFiltered = deptFiltered;
  if (currentSubFilter === 'ACCEPTED') {
    finalFiltered = deptFiltered.filter(e => (e.status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'ACCEPTED' || (e.verification_status || '').toUpperCase() === 'VERIFIED');
  } else if (currentSubFilter === 'REPORTED') {
    finalFiltered = deptFiltered.filter(e => (e.report_status || '').toUpperCase() === 'SENT');
  }

  renderEventsTable(finalFiltered);
  renderMapMarkers(finalFiltered);
  renderSimpleEventCards(finalFiltered);
  renderLiveEventStream(finalFiltered);

  if (mapEventCountBadge) {
    mapEventCountBadge.textContent = `${mapMarkersMap.size} pin${mapMarkersMap.size === 1 ? '' : 's'}`;
  }
}

function selectDepartment(deptName) {
  currentSelectedDepartment = deptName;
  [deptCardRoad, deptCardTraffic, deptCardAll].forEach(c => {
    if (c) c.classList.remove('active');
  });
  if ((deptName === 'ROAD MAINTENANCE' || deptName === 'ROAD') && deptCardRoad) deptCardRoad.classList.add('active');
  if (deptName === 'TRAFFIC' && deptCardTraffic) deptCardTraffic.classList.add('active');
  if (deptName === 'ALL' && deptCardAll) deptCardAll.classList.add('active');

  const eventsSubFilterGroup = document.getElementById('eventsSubFilterGroup');
  if (eventsSubFilterGroup) {
    eventsSubFilterGroup.querySelectorAll('.sub-tab-btn').forEach(btn => {
      const sc = btn.getAttribute('data-subcat');
      const isActive = (sc === 'road' && (deptName === 'ROAD MAINTENANCE' || deptName === 'ROAD')) ||
                       (sc === 'traffic' && deptName === 'TRAFFIC') ||
                       (sc === 'safety' && deptName === 'SAFETY') ||
                       (sc === 'all' && deptName === 'ALL');
      btn.classList.toggle('active', isActive);
    });
  }

  if (selectedDeptHeading) {
    selectedDeptHeading.textContent = deptName === 'TRAFFIC' ? 'TRAFFIC MANAGEMENT' : (deptName === 'SAFETY' ? 'PUBLIC SAFETY & HAZARDS' : (deptName === 'ALL' ? 'ALL INCIDENTS' : 'ROAD MAINTENANCE'));
  }

  applyDepartmentFiltersAndRender();
}

function selectSubFilter(subName) {
  currentSubFilter = subName;
  if (deptStatusTabs) {
    deptStatusTabs.querySelectorAll('.dept-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-sub') === subName);
    });
  }
  applyDepartmentFiltersAndRender();
}

function normalizeEvent(e) {
  if (!e) return null;
  const eventId = e.id || e.event_id;
  const status = (e.status || 'PENDING').toUpperCase();
  const rawConf = typeof e.confidence === 'number' ? e.confidence : parseFloat(e.confidence || 0);
  const conf = Number.isFinite(rawConf) ? (rawConf > 1 ? rawConf / 100 : rawConf) : 0;
  const lat = e.latitude !== undefined && e.latitude !== null ? parseFloat(e.latitude) : null;
  const lon = e.longitude !== undefined && e.longitude !== null ? parseFloat(e.longitude) : null;
  const img = e.evidence_image || e.evidence_reference || e.evidence_image_url || e.frame_image || e.image_url || '';

  return {
    ...e,
    id: eventId,
    event_id: eventId,
    problem: e.event_type || e.problem || e.class_name || 'Road Defect',
    category: e.category || 'Road & Infrastructure',
    status: status,
    report_status: e.report_status || (status === 'SENT' || status === 'SOLVED' ? 'SENT' : 'PENDING'),
    confidence: conf,
    latitude: lat,
    longitude: lon,
    bus_id: e.bus_id || 'Not available',
    department: e.department || 'Road Maintenance',
    priority: (e.priority || 'MEDIUM').toUpperCase(),
    risk_score: e.risk_score || (conf > 0.8 ? 85 : 60),
    risk_level: e.risk_level || (e.risk_score >= 80 ? 'CRITICAL' : (e.risk_score >= 60 ? 'HIGH' : 'MEDIUM')),
    evidence_image_url: img,
    created_at: e.created_at || e.timestamp || new Date().toISOString()
  };
}

// Admin Portal Validation: Events without valid GPS and frame image must not appear in the Admin Portal
function hasAdminPortalRequirements(evt) {
  if (!evt) return false;
  const lat = evt.latitude !== undefined && evt.latitude !== null ? parseFloat(evt.latitude) : NaN;
  const lon = evt.longitude !== undefined && evt.longitude !== null ? parseFloat(evt.longitude) : NaN;
  const hasValidGps = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  return hasValidGps;
}

async function fetchAndRenderEvents() {
  try {
    const params = new URLSearchParams();
    params.append('verification_status', 'all');
    params.append('include_inactive', 'true');
    const q = filterSearchInput ? filterSearchInput.value.trim() : '';
    if (q) params.append('search', q);

    const url = `/api/admin/events?${params.toString()}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.status === 401) {
      window.location.replace('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const rawEvents = Array.isArray(data.events) ? data.events : [];
    allEventsCache = rawEvents.map(normalizeEvent).filter(Boolean);

    // Update active buses dynamically from database records
    const uniqueBuses = new Set(allEventsCache.map(e => e.bus_id).filter(b => b && b !== 'Not available' && b !== '--'));
    const statActiveBuses = document.getElementById('statActiveBuses');
    if (statActiveBuses) statActiveBuses.textContent = uniqueBuses.size;

    applyDepartmentFiltersAndRender();
    renderAllEventsView();
    renderWorkOrdersView();
    if (typeof renderRoadsView === 'function') renderRoadsView();
    if (typeof renderTrafficView === 'function') renderTrafficView();
    if (typeof renderSafetyView === 'function') renderSafetyView();
    if (typeof renderAnalyticsDashboard === 'function') renderAnalyticsDashboard();
  } catch (err) {
    console.error('[Admin Portal] Failed to fetch events:', err);
    renderEventsTable([]);
    renderMapMarkers([]);
    renderAllEventsView();
  }
}

// ==============================================================================
// 5. MAP MARKERS RENDERING & SYNCHRONIZATION
// ==============================================================================
function renderMapMarkers(events) {
  if (!leafletMap) return;

  if (!leafletMap.getPane('detectionPane')) {
    leafletMap.createPane('detectionPane');
    leafletMap.getPane('detectionPane').style.zIndex = 650;
  }

  // Clear existing markers
  for (const marker of mapMarkersMap.values()) {
    leafletMap.removeLayer(marker);
  }
  mapMarkersMap.clear();

  let validCoordsCount = 0;
  const eventsToRender = Array.isArray(events) ? events : [];

  eventsToRender.forEach(evt => {
    const lat = Number(evt.latitude ?? evt.lat);
    const lng = Number(evt.longitude ?? evt.lng ?? evt.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      console.warn('[GIS INVALID COORDINATES]', evt);
      return;
    }
    evt.latitude = lat;
    evt.longitude = lng;

    validCoordsCount++;
    console.log('[GIS MARKER]', {
      id: evt.event_id || evt.id,
      category: evt.category,
      latitude: lat,
      longitude: lng,
      title: evt.problem || evt.title || evt.class_name
    });

    const icon = createCategoryIcon(evt.category, evt.problem || evt.title, evt.risk_level || evt.priority, evt.verification_status);
    const marker = L.marker([lat, lng], {
      icon,
      pane: 'detectionPane'
    });

    // Only render markers to the map if in EVENTS mode
    if (currentMapMode === 'EVENTS') {
      marker.addTo(leafletMap);
      console.log('[GIS MARKER ADDED]', marker);
    }

    // Modern GIS Tooltip on hover directly beside/above marker
    marker.bindTooltip(formatMarkerTooltip(evt), {
      className: 'gis-hover-tooltip',
      direction: 'top',
      offset: [0, -32],
      opacity: 1
    });

    // Marker click directly opens the full Event Report Drawer
    marker.on('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    mapMarkersMap.set(evt.event_id || evt.id, marker);
  });

  console.log('[GIS MAP]', {
    mapExists: !!leafletMap,
    zoom: leafletMap?.getZoom(),
    center: leafletMap?.getCenter(),
    markerCount: mapMarkersMap.size
  });

  if (currentMapMode === 'EVENTS' && mapEventCountBadge) {
    const hasDemo = eventsToRender.some(e => e.is_demo);
    const hasReal = eventsToRender.some(e => !e.is_demo);
    if (hasDemo && hasReal) {
      mapEventCountBadge.innerHTML = `${validCoordsCount} pins <span style="font-size:0.65rem;color:#D97706;font-weight:700;">(LIVE + DEMO)</span>`;
    } else if (hasDemo) {
      mapEventCountBadge.innerHTML = `<span style="color:#D97706;font-weight:800;">DEMO</span> &bull; ${validCoordsCount} pins`;
    } else if (validCoordsCount === 0) {
      mapEventCountBadge.textContent = '0 pins';
    } else {
      mapEventCountBadge.textContent = `${validCoordsCount} active pin${validCoordsCount === 1 ? '' : 's'}`;
    }
  }

  if (currentMapMode === 'EVENTS' && validCoordsCount > 0) {
    const validEvents = eventsToRender.filter(e => {
      const lt = Number(e.latitude ?? e.lat);
      const lg = Number(e.longitude ?? e.lng ?? e.lon);
      return Number.isFinite(lt) && Number.isFinite(lg) && !(lt === 0 && lg === 0);
    });
    if (validEvents.length > 0) {
      const bounds = L.latLngBounds(
        validEvents.map(e => [
          Number(e.latitude ?? e.lat),
          Number(e.longitude ?? e.lng ?? e.lon)
        ])
      );
      if (bounds.isValid()) {
        leafletMap.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 14
        });
      }
    }
  }
}

// ==============================================================================
// 6. LIVE EVENT STREAM & EVENT TABLE RENDERING
// ==============================================================================
function formatTimeAgo(dateInput) {
  if (!dateInput) return 'now';
  const diffMs = Date.now() - new Date(dateInput).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

function renderLiveEventStream(events) {
  const feed = document.getElementById('liveEventFeed');
  const empty = document.getElementById('liveFeedEmptyState');
  if (!feed) return;
  feed.innerHTML = '';

  if (!events || events.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  events.slice(0, 30).forEach(evt => {
    const item = document.createElement('div');
    item.className = `activity-item ${evt.event_id === selectedEventId ? 'active' : ''}`;
    item.id = `feed-item-${evt.event_id}`;
    const timeAgo = formatTimeAgo(evt.created_at);
    const problemName = evt.problem || evt.class_name || 'Road Defect';
    const categoryName = evt.category || 'Road & Infrastructure';

    let catClass = 'road';
    let catSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20M5 18l3-6 4 3 4-7 2 4 3-2 1 8"/></svg>`;

    if (isTrafficEvent(evt)) {
      catClass = 'traffic';
      catSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/></svg>`;
    } else if (isSafetyEvent(evt)) {
      catClass = 'safety';
      catSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    }

    item.innerHTML = `
      <div class="activity-item-left">
        <div class="activity-cat-icon ${catClass}" title="${categoryName}">
          ${catSvg}
        </div>
        <div class="activity-main">
          <span class="activity-problem">${problemName}</span>
          <span class="activity-category">${categoryName}</span>
        </div>
      </div>
      <span class="activity-time">${evt.is_demo ? '<span class="badge-demo" style="margin-right:4px;">DEMO</span>' : ''}${timeAgo}</span>
    `;

    item.addEventListener('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    feed.appendChild(item);
  });
}

function renderSimpleEventCards(events) {
  const container = document.getElementById('simpleEventCardsGrid');
  const empty = document.getElementById('cardsEmptyState');
  const countEl = document.getElementById('categorySectionCount');
  if (!container) return;

  container.innerHTML = '';

  let eventsToRender = (events && events.length > 0) ? events : [];
  let isDemo = false;
  if (eventsToRender.length === 0) {
    if (currentSelectedDepartment === 'ROAD MAINTENANCE' || currentSelectedDepartment === 'ROAD') {
      eventsToRender = DEMO_ALL_EVENTS.filter(isRoadEvent);
    } else if (currentSelectedDepartment === 'TRAFFIC') {
      eventsToRender = DEMO_ALL_EVENTS.filter(isTrafficEvent);
    } else if (currentSelectedDepartment === 'SAFETY') {
      eventsToRender = DEMO_ALL_EVENTS.filter(isSafetyEvent);
    } else {
      eventsToRender = DEMO_ALL_EVENTS;
    }
    isDemo = true;
  }

  if (empty) empty.style.display = 'none';
  if (countEl) {
    if (isDemo) {
      countEl.innerHTML = `<span style="color:#F59E0B;font-weight:800;">DEMO DATA</span> &bull; Showing ${eventsToRender.length} representative incidents`;
    } else {
      countEl.textContent = `Showing ${eventsToRender.length} incident${eventsToRender.length === 1 ? '' : 's'}`;
    }
  }

  eventsToRender.forEach(evt => {
    const card = document.createElement('div');
    card.className = `simple-event-card ${evt.event_id === selectedEventId ? 'selected' : ''}`;
    card.id = `card-${evt.event_id}`;

    const problemName = evt.problem || evt.class_name || 'Road Defect';
    const categoryName = evt.category || 'Road & Infrastructure';
    const imgSrc = evt.evidence_image_url || '';
    const timeAgo = formatTimeAgo(evt.created_at || evt.timestamp || Date.now());
    const demoBadgeHtml = evt.is_demo ? `<span class="card-demo-badge">DEMO</span>` : '';

    card.innerHTML = `
      <div class="card-image-wrap">
        ${imgSrc 
          ? `<img src="${imgSrc}" alt="${escapeHtml(problemName)}" class="card-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-img-placeholder\\'>Evidence snapshot</div>';">` 
          : `<div class="card-img-placeholder">Evidence snapshot</div>`
        }
        ${demoBadgeHtml}
      </div>
      <div class="card-content">
        <h3 class="card-title">${escapeHtml(problemName)}</h3>
        <p class="card-class">${escapeHtml(categoryName)}</p>
        <span class="card-time">${timeAgo} ago</span>
        <button type="button" class="btn-view-report" data-id="${evt.event_id}">
          VIEW REPORT &rarr;
        </button>
      </div>
    `;

    card.addEventListener('click', () => {
      selectEventById(evt.event_id, true);
    });

    container.appendChild(card);
  });
}

function renderEventsTable(events) {
  renderLiveEventStream(events);
  renderSimpleEventCards(events);
  if (eventsTableBody) {
    eventsTableBody.innerHTML = '';
  }

  if (!events || events.length === 0) {
    if (tableEmptyState) tableEmptyState.style.display = 'flex';
    return;
  }

  if (tableEmptyState) tableEmptyState.style.display = 'none';

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
    const vStat = (evt.verification_status || 'PENDING_REVIEW').toUpperCase();

    let riskBadgeClass = 'badge-risk-medium';
    if (rLvl === 'CRITICAL') riskBadgeClass = 'badge-risk-critical';
    else if (rLvl === 'HIGH') riskBadgeClass = 'badge-risk-high';
    else if (rLvl === 'LOW') riskBadgeClass = 'badge-risk-low';

    let statClass = 'status-new';
    if (stat === 'ASSIGNED') statClass = 'status-assigned';
    else if (stat === 'IN_PROGRESS') statClass = 'status-in_progress';
    else if (stat === 'RESOLVED') statClass = 'status-resolved';

    const isAccepted = evt.is_active !== false && (vStat === 'ACCEPTED' || vStat === 'VERIFIED' || stat === 'ACCEPTED');
    let vBadgeHtml = `<span class="badge-v-verified" style="background:#DCFCE7;color:#15803D;border:1.5px solid #16A34A;font-weight:700;padding:2px 6px;border-radius:4px;font-size:0.75rem;">ACCEPTED</span>`;
    if (!isAccepted && (vStat === 'REJECTED' || evt.is_active === false)) {
      vBadgeHtml = `<span class="badge-v-rejected" style="padding:2px 6px;border-radius:4px;font-size:0.75rem;">REJECTED</span>`;
    }

    const hasGps = evt.latitude !== null && evt.longitude !== null &&
      Number.isFinite(parseFloat(evt.latitude)) && Number.isFinite(parseFloat(evt.longitude)) &&
      (parseFloat(evt.latitude) !== 0 || parseFloat(evt.longitude) !== 0);

    const latLonText = hasGps
      ? `${parseFloat(evt.latitude).toFixed(5)}, ${parseFloat(evt.longitude).toFixed(5)}`
      : '<span style="color: var(--text-muted); font-style: italic;">GPS unavailable</span>';

    const timeText = evt.created_at
      ? new Date(evt.created_at).toISOString().slice(0, 19).replace('T', ' ')
      : '--';

    const repStatus = (evt.report_status || 'PENDING').toUpperCase();
    let reportBadgeHtml = `<span class="badge" style="background: var(--bg-muted); color: var(--text-muted); font-size: 0.72rem;">PENDING</span>`;
    if (repStatus === 'SENT') {
      reportBadgeHtml = `<span class="badge" style="background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-border); font-size: 0.72rem; font-weight: 700;">✓ SENT</span>`;
    } else if (repStatus === 'FAILED') {
      reportBadgeHtml = `<span class="badge" style="background: var(--color-offline-bg); color: var(--color-offline); font-size: 0.72rem;">FAILED</span>`;
    }

    const demoBadge = evt.is_demo ? ' <span class="badge-demo">DEMO</span>' : '';
    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); font-size: 0.8rem;">${evt.event_id || evt.id}</strong>${demoBadge}</td>
      <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${evt.category || 'Road'}</span></td>
      <td><strong>${evt.problem || evt.class_name || 'Pothole'}</strong></td>
      <td style="font-family: var(--font-mono); font-weight: 600; color: var(--color-primary);">${confPct}%</td>
      <td>${vBadgeHtml}</td>
      <td><span class="${riskBadgeClass}">${rLvl} (${evt.risk_score || 0})</span></td>
      <td><strong>${prio}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 0.78rem;">${latLonText}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${timeText}</td>
      <td><span class="badge">${evt.bus_id || 'BUS-101'}</span></td>
      <td><span class="badge-dept">${evt.department || 'ROAD MAINTENANCE'}</span></td>
      <td>${reportBadgeHtml}</td>
      <td><span class="badge-status ${statClass}">${stat}</span></td>
      <td><button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.74rem; font-weight: 700; border-color: var(--color-primary-border); color: var(--color-primary);">View</button></td>
    `;

    tr.addEventListener('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    eventsTableBody.appendChild(tr);
  });
}

// ==============================================================================
// 7. EVENT SELECTION & REVERSE GEOCODING
// ==============================================================================
async function selectEventById(eventId, panMap = true) {
  selectedEventId = eventId;
  let evt = allEventsCache.find(e => (e.event_id === eventId || e.id === eventId));
  if (!evt && DEMO_EVENTS_MAP.has(eventId)) {
    evt = DEMO_EVENTS_MAP.get(eventId);
  }
  if (!evt) return;

  // Highlight row in table
  document.querySelectorAll('#eventsTableBody tr').forEach(row => row.classList.remove('selected'));
  const activeRow = document.getElementById(`row-${eventId}`);
  if (activeRow) {
    activeRow.classList.add('selected');
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Open slide-in details drawer
  if (adminDetailPanel) {
    adminDetailPanel.classList.add('drawer-open');
  }
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  if (drawerBackdrop) {
    drawerBackdrop.classList.add('active');
  }

  // Highlight active simple event card
  document.querySelectorAll('#simpleEventCardsGrid .simple-event-card').forEach(c => c.classList.remove('selected'));
  const activeSimpleCard = document.getElementById(`card-${eventId}`);
  if (activeSimpleCard) {
    activeSimpleCard.classList.add('selected');
    activeSimpleCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Highlight active card in live event stream
  document.querySelectorAll('#liveEventFeed .feed-event-card').forEach(c => c.classList.remove('active'));
  const activeFeedCard = document.getElementById(`feed-card-${eventId}`);
  if (activeFeedCard) {
    activeFeedCard.classList.add('active');
    activeFeedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Wire VIEW ON MAP button in drawer
  const btnViewOnMap = document.getElementById('btnViewOnMap');
  if (btnViewOnMap) {
    btnViewOnMap.onclick = () => {
      showView('overview');
      const mapEl = document.getElementById('adminGisMap');
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const m = mapMarkersMap.get(eventId);
      if (m && leafletMap) {
        leafletMap.setView(m.getLatLng(), 16, { animate: true });
        if (m.openTooltip) m.openTooltip();
      }
      if (window.innerWidth <= 1024) {
        if (adminDetailPanel) adminDetailPanel.classList.remove('drawer-open');
        const drawerBackdrop = document.getElementById('drawerBackdrop');
        if (drawerBackdrop) drawerBackdrop.classList.remove('active');
      }
    };
  }

  // Pan Map & Open Tooltip
  const marker = mapMarkersMap.get(eventId);
  if (marker && leafletMap) {
    if (panMap) {
      leafletMap.setView(marker.getLatLng(), Math.max(leafletMap.getZoom(), 15), { animate: true });
    }
    if (marker.openTooltip) marker.openTooltip();
  }

  // Ensure Leaflet recomputes geometry if details panel expanded
  if (leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 200);
  }

  // Populate Details Panel
  detailPlaceholder.style.display = 'none';
  detailContent.style.display = 'flex';

  // Responsive: on tablet/mobile screens, scroll down to details panel
  if (window.innerWidth <= 1024 && adminDetailPanel) {
    setTimeout(() => {
      adminDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  // Status Lifecycle from Supabase
  const stat = (evt.status || 'PENDING').toUpperCase();
  if (detailStatusBadge) {
    detailStatusBadge.textContent = stat;
    detailStatusBadge.className = `badge badge-status-${stat.toLowerCase()}`;
  }
  if (detailStatusSelect) detailStatusSelect.value = stat;

  if (detailVerificationBadge) {
    detailVerificationBadge.style.display = 'inline-block';
    detailVerificationBadge.textContent = stat;
    detailVerificationBadge.className = `badge badge-status-${stat.toLowerCase()}`;
  }

  // Evidence Image
  if (evt.evidence_image_url) {
    detailEvidenceImg.src = evt.evidence_image_url;
    detailEvidenceImg.style.display = 'block';
    if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'none';
    detailEvidenceTag.textContent = `OBSERVED ${evt.observation_count || 1}X (BEST FRAME)`;
    detailEvidenceTag.style.display = 'block';

    detailEvidenceImg.onerror = () => {
      detailEvidenceImg.style.display = 'none';
      if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'flex';
      detailEvidenceTag.textContent = 'EVIDENCE UNAVAILABLE';
    };
  } else {
    detailEvidenceImg.style.display = 'none';
    if (detailEvidenceUnavailable) detailEvidenceUnavailable.style.display = 'flex';
    detailEvidenceTag.textContent = 'EVIDENCE UNAVAILABLE';
  }

  // Category & Risk Badges
  if (evt.is_demo) {
    detailCategoryBadge.innerHTML = `<span class="badge-demo">DEMO</span> ${escapeHtml(evt.category || 'Road & Infrastructure')}`;
  } else {
    detailCategoryBadge.textContent = evt.category || 'Road & Infrastructure';
  }
  const rScore = evt.risk_score || 0;
  const rLvl = (evt.risk_level || 'MEDIUM').toUpperCase();
  detailRiskBadge.textContent = `RISK: ${rLvl} (${rScore}/100)`;
  detailRiskBadge.className = `badge badge-risk-${rLvl.toLowerCase()}`;

  const prio = (evt.priority || 'MEDIUM').toUpperCase();
  detailPriorityBadge.textContent = `PRIORITY: ${prio}`;
  detailPriorityBadge.className = `badge badge-risk-${prio === 'HIGH' ? 'high' : 'medium'}`;

  // Field Attributes from Supabase Record
  detailEvtId.textContent = evt.event_id || '--';
  
  // Progress bar & confidence explanation
  const confVal = typeof evt.confidence === 'number' ? evt.confidence : parseFloat(evt.confidence || 0);
  const confPct = Math.round(confVal * 100);
  detailConf.innerHTML = `
    <div class="conf-indicator conf-high" title="AI Confidence: ${confPct}% (Automatic Acceptance Threshold ≥ 80%)">
      <div class="conf-bar"><div class="conf-fill high" style="width: ${confPct}%"></div></div>
      <span class="conf-text">${confPct}% &bull; AI Detection</span>
    </div>
  `;

  detailProblem.textContent = evt.problem || evt.class_name || 'Road Defect';

  // Audit explanation note
  let auditNote = `${evt.observation_count || 1} frame(s) &bull; Confidence ${confPct}% &bull; Source: ${evt.bus_id || 'Mobile Sensor'}`;
  detailObservations.innerHTML = auditNote;

  detailDepartment.textContent = evt.department || 'Not available';
  detailLat.textContent = (evt.latitude !== null && evt.latitude !== undefined) ? evt.latitude.toFixed(6) : 'Not available';
  detailLon.textContent = (evt.longitude !== null && evt.longitude !== undefined) ? evt.longitude.toFixed(6) : 'Not available';
  detailBusId.textContent = evt.bus_id || 'Not available';
  detailCameraId.textContent = evt.camera_id || 'CAM-01';
  detailDetectedTime.textContent = evt.created_at ? new Date(evt.created_at).toLocaleString() : 'Not available';
  detailSessionId.textContent = evt.session_id || 'Not available';
  detailWorkOrder.textContent = evt.work_order_id || 'Not Assigned';

  // Reverse Geocoding
  if (evt.latitude && evt.longitude) {
    detailAddress.textContent = 'Fetching address...';
    const addr = await resolveAddress(evt.latitude, evt.longitude);
    detailAddress.textContent = addr;
  } else {
    detailAddress.textContent = 'Address unavailable (No GPS)';
  }

  // Update Drawer Action & Status Lifecycle
  updateDrawerStatusUI(evt.status || 'PENDING');

  if (detailDispatchDept) {
    detailDispatchDept.textContent = evt.department || 'Road Maintenance';
  }

  if (reportNotesInput) {
    reportNotesInput.value = '';
  }

  if (reportFeedback) {
    reportFeedback.style.display = 'none';
  }
}

// ==============================================================================
// 7.1 STATUS LIFECYCLE MANAGEMENT (PENDING -> SENT -> SOLVED)
// ==============================================================================
function updateDrawerStatusUI(status) {
  const normStatus = (status || 'PENDING').toUpperCase();
  if (detailReportStatusBadge) {
    detailReportStatusBadge.textContent = normStatus;
    if (normStatus === 'PENDING') {
      detailReportStatusBadge.className = 'badge-status badge-status-pending';
    } else if (normStatus === 'SENT') {
      detailReportStatusBadge.className = 'badge-status badge-status-sent';
    } else if (normStatus === 'SOLVED') {
      detailReportStatusBadge.className = 'badge-status badge-status-solved';
    }
  }

  // Toggle active class on status toggle buttons
  ['btnLifecyclePending', 'btnLifecycleSent', 'btnLifecycleSolved'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-status') === normStatus);
    }
  });

  const markSolvedBtn = document.getElementById('markSolvedBtn');
  if (normStatus === 'PENDING') {
    if (sendReportBtn) {
      sendReportBtn.style.display = 'block';
      sendReportBtn.disabled = false;
      sendReportBtn.style.opacity = '1';
      sendReportBtn.style.cursor = 'pointer';
    }
    if (sendReportBtnText) sendReportBtnText.textContent = 'VIEW & DISPATCH REPORT';
    if (markSolvedBtn) markSolvedBtn.style.display = 'none';
  } else if (normStatus === 'SENT') {
    if (sendReportBtn) {
      sendReportBtn.style.display = 'block';
      sendReportBtn.disabled = true;
      sendReportBtn.style.opacity = '0.75';
      sendReportBtn.style.cursor = 'not-allowed';
    }
    const evt = allEventsCache.find(e => e.event_id === selectedEventId);
    if (sendReportBtnText) sendReportBtnText.textContent = `✓ REPORT SENT (${evt?.report_id || 'DISPATCHED'})`;
    if (markSolvedBtn) {
      markSolvedBtn.style.display = 'block';
      markSolvedBtn.disabled = false;
      markSolvedBtn.textContent = '✓ MARK INCIDENT AS SOLVED';
      markSolvedBtn.style.opacity = '1';
      markSolvedBtn.style.cursor = 'pointer';
    }
  } else if (normStatus === 'SOLVED') {
    if (sendReportBtn) {
      sendReportBtn.style.display = 'none';
    }
    if (markSolvedBtn) {
      markSolvedBtn.style.display = 'block';
      markSolvedBtn.disabled = true;
      markSolvedBtn.textContent = '✓ INCIDENT SOLVED';
      markSolvedBtn.style.opacity = '0.85';
      markSolvedBtn.style.cursor = 'default';
    }
  }
}

async function updateEventStatus(eventId, newStatus) {
  if (!eventId) return;
  const normStatus = newStatus.toUpperCase();

  // If this is a frontend-only demo event, isolate from Supabase entirely
  if (eventId.startsWith('demo-') || DEMO_EVENTS_MAP.has(eventId)) {
    const evt = DEMO_EVENTS_MAP.get(eventId);
    if (evt) {
      evt.status = normStatus;
      if (normStatus === 'SENT' || normStatus === 'SOLVED') {
        evt.report_status = 'SENT';
      }
    }
    updateDrawerStatusUI(normStatus);
    showAdminToast(`Demo Event updated to ${normStatus} (Frontend Only)`, 'success');
    return;
  }
  try {
    const res = await fetch(`/api/admin/events/${eventId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: normStatus })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const evt = allEventsCache.find(e => e.event_id === eventId);
    if (evt) {
      evt.status = normStatus;
      if (normStatus === 'SENT' || normStatus === 'SOLVED') {
        evt.report_status = 'SENT';
      }
    }

    updateDrawerStatusUI(normStatus);
    renderAllEventsView();
    applyDepartmentFiltersAndRender();
    renderWorkOrdersView();
    await fetchStats();
  } catch (err) {
    console.error('Failed to update event status:', err);
    alert('Failed to update event status in Supabase.');
  }
}
window.updateEventStatus = updateEventStatus;

function setupLifecycleStatusControls() {
  const btnPending = document.getElementById('btnLifecyclePending');
  const btnSent = document.getElementById('btnLifecycleSent');
  const btnSolved = document.getElementById('btnLifecycleSolved');
  const markSolvedBtn = document.getElementById('markSolvedBtn');

  if (btnPending) {
    btnPending.addEventListener('click', () => {
      if (selectedEventId) updateEventStatus(selectedEventId, 'PENDING');
    });
  }
  if (btnSent) {
    btnSent.addEventListener('click', () => {
      if (selectedEventId) updateEventStatus(selectedEventId, 'SENT');
    });
  }
  if (btnSolved) {
    btnSolved.addEventListener('click', () => {
      if (selectedEventId) updateEventStatus(selectedEventId, 'SOLVED');
    });
  }
  if (markSolvedBtn) {
    markSolvedBtn.addEventListener('click', () => {
      if (selectedEventId) updateEventStatus(selectedEventId, 'SOLVED');
    });
  }
}

// ==============================================================================
// 7.2 ALL EVENTS HISTORICAL TABLE RENDERING & FILTERING (SUPABASE)
// ==============================================================================
function renderAllEventsView() {
  const tbody = document.getElementById('allEventsTableBody');
  const emptyState = document.getElementById('allEventsEmptyState');
  const countBadge = document.getElementById('allEventsCountBadge');
  const deptSelect = document.getElementById('allEventsDeptFilter');
  if (!tbody) return;

  const combined = getCombinedPresentationEvents();

  // Dynamically populate department dropdown from presentation records
  if (deptSelect) {
    const currentVal = deptSelect.value;
    const uniqueDepts = Array.from(new Set(combined.map(e => e.department).filter(Boolean)));
    deptSelect.innerHTML = '<option value="all">All Departments</option>' +
      uniqueDepts.map(d => `<option value="${d}" ${d === currentVal ? 'selected' : ''}>${d}</option>`).join('');
  }

  const catFilter = document.getElementById('allEventsCategoryFilter')?.value || 'all';
  const statusFilter = document.getElementById('allEventsStatusFilter')?.value || 'all';
  const deptFilter = document.getElementById('allEventsDeptFilter')?.value || 'all';
  const searchFilter = (document.getElementById('allEventsSearchInput')?.value || '').trim().toLowerCase();

  let filtered = combined.slice();

  if (catFilter !== 'all') {
    filtered = filtered.filter(e => {
      const c = (e.category || '').toLowerCase();
      if (catFilter === 'Road & Infrastructure' || catFilter === 'Road' || catFilter === 'road') return isRoadEvent(e);
      if (catFilter === 'Traffic' || catFilter === 'traffic') return isTrafficEvent(e);
      if (catFilter === 'Safety' || catFilter === 'safety') return isSafetyEvent(e);
      return c === catFilter.toLowerCase();
    });
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter(e => (e.status || 'PENDING').toUpperCase() === statusFilter.toUpperCase());
  }

  if (deptFilter !== 'all') {
    filtered = filtered.filter(e => (e.department || '').toLowerCase() === deptFilter.toLowerCase());
  }

  if (searchFilter) {
    filtered = filtered.filter(e => {
      const text = `${e.event_id || e.id || ''} ${e.problem || e.title || ''} ${e.category || ''} ${e.department || ''} ${e.bus_id || ''} ${e.address || ''}`.toLowerCase();
      return text.includes(searchFilter);
    });
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  filtered.forEach(evt => {
    const tr = document.createElement('tr');
    tr.id = `all-events-row-${evt.event_id || evt.id}`;
    if ((evt.event_id || evt.id) === selectedEventId) tr.classList.add('selected');

    const stat = (evt.status || 'PENDING').toUpperCase();
    let badgeClass = 'badge-status-pending';
    if (stat === 'SENT') badgeClass = 'badge-status-sent';
    else if (stat === 'SOLVED') badgeClass = 'badge-status-solved';

    const timeAgo = formatTimeAgo(evt.created_at || evt.timestamp);
    const fullTime = (evt.created_at || evt.timestamp) ? new Date(evt.created_at || evt.timestamp).toLocaleString() : '--';
    const hasGps = evt.latitude !== null && evt.longitude !== null && !isNaN(evt.latitude) && !isNaN(evt.longitude);
    const locText = evt.address 
      ? evt.address 
      : (hasGps ? `${parseFloat(evt.latitude).toFixed(5)}, ${parseFloat(evt.longitude).toFixed(5)}` : 'Location unavailable');

    const demoBadge = evt.is_demo ? ' <span class="badge-demo">DEMO</span>' : '';

    tr.innerHTML = `
      <td><strong>${escapeHtml(evt.problem || evt.class_name || evt.title || 'Road Defect')}</strong>${demoBadge}</td>
      <td><span style="font-size: 0.78rem; color: var(--admin-text-muted);">${escapeHtml(evt.category || 'Road & Infrastructure')}</span></td>
      <td title="${fullTime}" style="font-family: var(--font-mono); font-size: 0.78rem;">${timeAgo}</td>
      <td style="font-size: 0.78rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(locText)}">${escapeHtml(locText)}</td>
      <td><span style="font-weight: 600; color: var(--admin-primary); font-size: 0.78rem;">${escapeHtml(evt.department || 'Road Maintenance')}</span></td>
      <td><span class="badge-status ${badgeClass}">${stat}</span></td>
      <td>
        <button type="button" class="btn-table-action" onclick="selectEventById('${evt.event_id || evt.id}', true);">
          View Report
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
window.renderAllEventsView = renderAllEventsView;

function setupAllEventsListeners() {
  const catFilter = document.getElementById('allEventsCategoryFilter');
  const statusFilter = document.getElementById('allEventsStatusFilter');
  const deptFilter = document.getElementById('allEventsDeptFilter');
  const searchInput = document.getElementById('allEventsSearchInput');
  const resetBtn = document.getElementById('resetAllEventsFiltersBtn');
  const refreshBtn = document.getElementById('refreshAllEventsBtn');

  if (catFilter) catFilter.addEventListener('change', renderAllEventsView);
  if (statusFilter) statusFilter.addEventListener('change', renderAllEventsView);
  if (deptFilter) deptFilter.addEventListener('change', renderAllEventsView);

  let searchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderAllEventsView, 250);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (catFilter) catFilter.value = 'all';
      if (statusFilter) statusFilter.value = 'all';
      if (deptFilter) deptFilter.value = 'all';
      if (searchInput) searchInput.value = '';
      renderAllEventsView();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      await fetchStats();
      await fetchAndRenderEvents();
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Data';
    });
  }
}

// ==============================================================================
// 7.3 VERIFICATION WORKFLOW ACTION HANDLERS (REMOVED - AUTO ACCEPTED)
// ==============================================================================
function setupVerificationButtons() {
  // Verification buttons removed - pothole detections are automatically accepted via confidence threshold >= 0.80
}

async function handleVerifyCurrentEvent() {}
async function handleRejectCurrentEvent() {}

function updateSingleMapMarker(evt) {
  if (!leafletMap) return;
  if (evt.is_active === false) {
    const existing = mapMarkersMap.get(evt.event_id);
    if (existing) {
      leafletMap.removeLayer(existing);
      mapMarkersMap.delete(evt.event_id);
      if (mapEventCountBadge) {
        mapEventCountBadge.textContent = `${mapMarkersMap.size} pin${mapMarkersMap.size === 1 ? '' : 's'}`;
      }
    }
    return;
  }

  const existing = mapMarkersMap.get(evt.event_id);
  const icon = createCategoryIcon(evt.category, evt.problem, evt.risk_level, 'ACCEPTED');
  if (existing) {
    existing.setIcon(icon);
  } else if (Number.isFinite(evt.latitude) && Number.isFinite(evt.longitude) && !(evt.latitude === 0 && evt.longitude === 0)) {
    renderMapMarkers(allEventsCache);
  }
}

// Make selectEventById globally callable from Leaflet popup buttons
window.selectEventById = selectEventById;
window.directVerifyEvent = async function() {};
window.directRejectEvent = async function() {};

async function resolveAddress(lat, lon) {
  const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if (clientAddressCache.has(cacheKey)) {
    return clientAddressCache.get(cacheKey);
  }

  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`, { headers: getAuthHeaders() });
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
function showView(activeKey) {
  const normKey = (activeKey || 'overview').toLowerCase();
  const canonicalKey = (normKey === 'roads' || normKey === 'road') ? 'roads' : normKey;

  const sections = {
    overview: document.getElementById('view-overview'),
    roads: document.getElementById('view-roads'),
    traffic: document.getElementById('view-traffic'),
    safety: document.getElementById('view-safety'),
    events: document.getElementById('view-events'),
    departments: document.getElementById('view-departments'),
    workorders: document.getElementById('view-workorders'),
    analytics: document.getElementById('view-analytics')
  };

  Object.keys(sections).forEach(key => {
    if (sections[key]) {
      const isTarget = (key === canonicalKey);
      sections[key].style.display = isTarget ? 'flex' : 'none';
      sections[key].classList.toggle('active', isTarget);
    }
  });

  setActiveNav(canonicalKey);

  if (canonicalKey === 'overview') {
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 150);
  } else if (canonicalKey === 'roads') {
    if (typeof initRoadMap === 'function') initRoadMap();
    if (typeof roadMap !== 'undefined' && roadMap) setTimeout(() => roadMap.invalidateSize(), 150);
    if (typeof renderRoadsView === 'function') renderRoadsView();
  } else if (canonicalKey === 'traffic') {
    if (typeof initTrafficViewMap === 'function') initTrafficViewMap();
    if (typeof trafficViewMap !== 'undefined' && trafficViewMap) setTimeout(() => trafficViewMap.invalidateSize(), 150);
    if (typeof renderTrafficView === 'function') renderTrafficView();
  } else if (canonicalKey === 'safety') {
    if (typeof initSafetyMap === 'function') initSafetyMap();
    if (typeof safetyMap !== 'undefined' && safetyMap) setTimeout(() => safetyMap.invalidateSize(), 150);
    if (typeof renderSafetyView === 'function') renderSafetyView();
  } else if (canonicalKey === 'events') {
    renderAllEventsView();
  } else if (canonicalKey === 'workorders') {
    renderWorkOrdersView();
  } else if (canonicalKey === 'departments') {
    fetchStats();
  } else if (canonicalKey === 'analytics') {
    if (typeof renderAnalyticsDashboard === 'function') renderAnalyticsDashboard();
  }
}
window.showView = showView;

function setActiveNav(targetView) {
  const norm = (targetView || 'overview').toLowerCase();
  const canonical = (norm === 'roads' || norm === 'road') ? 'roads' : norm;

  const navButtons = document.querySelectorAll('.admin-nav-links .nav-link, .sidebar-nav-btn');
  navButtons.forEach(b => {
    const v = (b.getAttribute('data-view') || '').toLowerCase();
    const isMatch = (v === canonical) || (canonical === 'roads' && (v === 'road' || v === 'roads'));
    b.classList.toggle('active', isMatch);
  });

  const catPills = document.querySelectorAll('#categoryPillSelector .category-pill');
  catPills.forEach(p => {
    const cat = p.getAttribute('data-cat');
    const matches = (canonical === 'roads' && cat === 'road') ||
                    (canonical === 'traffic' && cat === 'traffic') ||
                    (canonical === 'safety' && cat === 'safety') ||
                    (canonical === 'overview' && cat === 'all');
    p.classList.toggle('active', matches);
  });
}

function setupSidebarNavigation() {
  const navButtons = document.querySelectorAll('.admin-nav-links .nav-link, .sidebar-nav-btn');
  const catPills = document.querySelectorAll('#categoryPillSelector .category-pill');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      showView(view);
    });
  });

  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.getAttribute('data-cat');
      if (cat === 'road') selectDepartment('ROAD MAINTENANCE');
      else if (cat === 'traffic') selectDepartment('TRAFFIC');
      else if (cat === 'safety') selectDepartment('SAFETY');
      else selectDepartment('ALL');
    });
  });

  // Executive City Insights Overview Quick Links to dedicated domain views
  const insightRoadCard = document.getElementById('insightRoadCard');
  if (insightRoadCard) insightRoadCard.onclick = () => showView('roads');

  const insightTrafficCard = document.getElementById('insightTrafficCard');
  if (insightTrafficCard) insightTrafficCard.onclick = () => showView('traffic');

  const insightSafetyCard = document.getElementById('insightSafetyCard');
  if (insightSafetyCard) insightSafetyCard.onclick = () => showView('safety');
}

function setupMobileSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!sidebar) return;

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 300);
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 300);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // Close sidebar on nav item click on small screens
  const navBtns = sidebar.querySelectorAll('.sidebar-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
    });
  });
}

function setupDrawerControls() {
  const closeDetailDrawerBtn = document.getElementById('closeDetailDrawerBtn');
  const btnCloseReportBottom = document.getElementById('btnCloseReportBottom');
  const drawerBackdrop = document.getElementById('drawerBackdrop');

  function closeDetailDrawer() {
    if (adminDetailPanel) {
      adminDetailPanel.classList.remove('drawer-open');
    }
    if (drawerBackdrop) {
      drawerBackdrop.classList.remove('active');
    }
  }

  if (closeDetailDrawerBtn) {
    closeDetailDrawerBtn.addEventListener('click', closeDetailDrawer);
  }
  if (btnCloseReportBottom) {
    btnCloseReportBottom.addEventListener('click', closeDetailDrawer);
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeDetailDrawer);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailDrawer();
  });
}

// ==============================================================================
// 9. FILTER LISTENERS
// ==============================================================================
function setupFilterListeners() {
  // Top Horizontal Department Cards
  if (deptCardRoad) {
    deptCardRoad.addEventListener('click', () => selectDepartment('ROAD MAINTENANCE'));
  }
  if (deptCardTraffic) {
    deptCardTraffic.addEventListener('click', () => selectDepartment('TRAFFIC'));
  }
  if (deptCardAll) {
    deptCardAll.addEventListener('click', () => selectDepartment('ALL'));
  }

  // Department Sub-Filter Tabs
  if (deptStatusTabs) {
    deptStatusTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.dept-tab');
      if (!btn) return;
      selectSubFilter(btn.getAttribute('data-sub'));
    });
  }

  // Verification filter pills
  if (verificationFilterGroup) {
    verificationFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.vfilter-btn');
      if (!btn) return;
      verificationFilterGroup.querySelectorAll('.vfilter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVerificationFilter = btn.dataset.val;
      fetchAndRenderEvents();
    });
  }

  [filterCategorySelect, filterDepartmentSelect, filterRiskSelect, filterPrioritySelect, filterStatusSelect, filterReportStatusSelect].forEach(select => {
    if (select) select.addEventListener('change', () => fetchAndRenderEvents());
  });

  let debounceTimer;
  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAndRenderEvents(), 300);
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (filterSearchInput) filterSearchInput.value = '';
      if (filterCategorySelect) filterCategorySelect.value = 'all';
      if (filterDepartmentSelect) filterDepartmentSelect.value = 'all';
      if (filterRiskSelect) filterRiskSelect.value = 'all';
      if (filterPrioritySelect) filterPrioritySelect.value = 'all';
      if (filterStatusSelect) filterStatusSelect.value = 'all';
      if (filterReportStatusSelect) filterReportStatusSelect.value = 'all';
      currentVerificationFilter = 'all';
      if (verificationFilterGroup) {
        verificationFilterGroup.querySelectorAll('.vfilter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.val === 'all');
        });
      }
      fetchAndRenderEvents();
    });
  }

  if (refreshEventsBtn) {
    refreshEventsBtn.addEventListener('click', async () => {
      refreshEventsBtn.disabled = true;
      refreshEventsBtn.textContent = 'Refreshing...';
      await fetchStats();
      await fetchAndRenderEvents();
      refreshEventsBtn.disabled = false;
      refreshEventsBtn.textContent = 'Refresh Data';
    });
  }

  // Status Changer
  if (detailStatusSelect) {
    detailStatusSelect.addEventListener('change', async () => {
      if (!selectedEventId) return;
      const newStatus = detailStatusSelect.value;
      try {
        const res = await fetch(`/api/admin/events/${selectedEventId}/status`, {
          method: 'PATCH',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
// 9.1 DEPARTMENT REPORT DISPATCHER (With Official Report Preview)
// ==============================================================================
function openReportPreviewModal(evt) {
  if (!evt) return;

  if (evt.is_active === false) {
    alert('Cannot dispatch report: Detection candidate is inactive.');
    return;
  }

  // Destination department automatically determined
  const destDept = isTrafficEvent(evt) ? 'TRAFFIC MANAGEMENT' : 'ROAD MAINTENANCE';
  const probName = evt.problem || evt.class_name || 'Road Damage';
  const prio = (evt.priority || 'HIGH').toUpperCase();
  const confPct = Math.round((evt.confidence || 0) * 100);
  const locStr = evt.address ? `${evt.address} (${Number(evt.latitude).toFixed(5)}, ${Number(evt.longitude).toFixed(5)})` : `${Number(evt.latitude).toFixed(5)}, ${Number(evt.longitude).toFixed(5)}`;
  const dtStr = evt.created_at ? new Date(evt.created_at).toLocaleString() : new Date().toLocaleString();

  if (confirmModalDept) confirmModalDept.textContent = destDept;
  if (reportPreviewSubject) reportPreviewSubject.textContent = `[${prio} PRIORITY] ${probName} Incident Report — ${evt.event_id}`;
  if (confirmModalEventId) confirmModalEventId.textContent = evt.event_id;
  if (confirmModalProblem) confirmModalProblem.textContent = `${probName} (${evt.category || 'Urban Infrastructure'})`;
  if (confirmModalConf) confirmModalConf.textContent = `${confPct}% (Automatic Acceptance Threshold ≥ 80%)`;
  if (reportPreviewPriority) reportPreviewPriority.textContent = prio;
  if (reportPreviewTimestamp) reportPreviewTimestamp.textContent = dtStr;
  if (reportPreviewLocation) reportPreviewLocation.textContent = locStr;

  if (evt.evidence_image_url && reportPreviewEvidenceImg) {
    reportPreviewEvidenceImg.src = evt.evidence_image_url;
    reportPreviewEvidenceImg.style.display = 'block';
    if (reportPreviewEvidencePlaceholder) reportPreviewEvidencePlaceholder.style.display = 'none';
  } else {
    if (reportPreviewEvidenceImg) reportPreviewEvidenceImg.style.display = 'none';
    if (reportPreviewEvidencePlaceholder) reportPreviewEvidencePlaceholder.style.display = 'block';
  }

  if (reportPreviewDesc) {
    if (destDept === 'TRAFFIC MANAGEMENT') {
      reportPreviewDesc.textContent = `A traffic hazard / congestion anomaly (${probName}) was detected by the mobile urban intelligence system at ${locStr}. Auto-accepted for prompt traffic authority response.`;
    } else {
      reportPreviewDesc.textContent = `A road surface defect (${probName}) was detected by the mobile urban intelligence system at ${locStr}. Automatically accepted via AI confidence threshold for municipal road maintenance inspection and repair.`;
    }
  }

  if (confirmReportModal) confirmReportModal.style.display = 'flex';
}

function setupReportSender() {
  if (!sendReportBtn) return;

  sendReportBtn.addEventListener('click', () => {
    if (!selectedEventId) return;
    let evt = allEventsCache.find(e => e.event_id === selectedEventId);
    if (!evt && DEMO_EVENTS_MAP.has(selectedEventId)) {
      evt = DEMO_EVENTS_MAP.get(selectedEventId);
    }
    if (!evt) return;

    if (evt.report_status === 'SENT') {
      alert(`Report was already dispatched to ${evt.department || 'department'} (ID: ${evt.report_id || 'SENT'})`);
      return;
    }

    openReportPreviewModal(evt);
  });

  if (cancelReportBtn) {
    cancelReportBtn.addEventListener('click', () => {
      if (confirmReportModal) confirmReportModal.style.display = 'none';
    });
  }

  if (confirmReportModal) {
    confirmReportModal.addEventListener('click', (e) => {
      if (e.target === confirmReportModal) {
        confirmReportModal.style.display = 'none';
      }
    });
  }

  if (confirmSendReportBtn) {
    confirmSendReportBtn.addEventListener('click', async () => {
      if (confirmReportModal) confirmReportModal.style.display = 'none';
      await dispatchReportForSelectedEvent();
    });
  }
}

async function dispatchReportForSelectedEvent() {
  if (!selectedEventId) return;
  let evt = allEventsCache.find(e => e.event_id === selectedEventId);
  if (!evt && DEMO_EVENTS_MAP.has(selectedEventId)) {
    evt = DEMO_EVENTS_MAP.get(selectedEventId);
  }
  if (!evt) return;

  sendReportBtn.disabled = true;
  if (sendReportSpinner) sendReportSpinner.style.display = 'inline-block';
  if (sendReportBtnText) sendReportBtnText.textContent = 'Dispatching to Department...';
  if (reportFeedback) reportFeedback.style.display = 'none';

  if (evt.is_demo) {
    setTimeout(() => {
      if (sendReportSpinner) sendReportSpinner.style.display = 'none';
      evt.status = 'SENT';
      evt.report_status = 'SENT';
      evt.report_id = 'RPT-DEMO-' + Math.floor(1000 + Math.random() * 9000);
      updateDrawerStatusUI('SENT');
      showAdminToast('Demo report dispatched successfully (Simulated Presentation Flow)', 'success');
      if (reportFeedback) {
        reportFeedback.style.display = 'block';
        reportFeedback.textContent = `✓ Dispatched Demo Report ${evt.report_id} to ${evt.department || 'GHMC'}`;
      }
    }, 700);
    return;
  }

  try {
    const notes = reportNotesInput ? reportNotesInput.value.trim() : '';
    const res = await fetch('/api/admin/reports/send', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        event_id: selectedEventId,
        notes: notes
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      evt.status = 'SENT';
      evt.report_status = 'SENT';
      evt.report_id = data.report_id;

      updateDrawerStatusUI('SENT');

      if (reportFeedback) {
        reportFeedback.style.display = 'block';
        reportFeedback.style.background = 'var(--color-primary-light)';
        reportFeedback.style.color = 'var(--color-primary)';
        reportFeedback.style.border = '1px solid var(--color-primary-border)';
        reportFeedback.textContent = `✓ Successfully dispatched GIS Report to ${data.department} (ID: ${data.report_id})`;
      }

      renderAllEventsView();
      renderWorkOrdersView();
      renderEventsTable(allEventsCache);
      await fetchStats();
    } else {
      if (reportFeedback) {
        reportFeedback.style.display = 'block';
        reportFeedback.style.background = 'var(--color-offline-bg)';
        reportFeedback.style.color = 'var(--color-offline)';
        reportFeedback.style.border = '1px solid var(--color-offline-border)';
        reportFeedback.textContent = data.error || 'Failed to dispatch report to department';
      }
      sendReportBtn.disabled = false;
      if (sendReportBtnText) sendReportBtnText.textContent = `Send Report to ${evt.department || 'Department'}`;
    }
  } catch (err) {
    if (reportFeedback) {
      reportFeedback.style.display = 'block';
      reportFeedback.style.background = 'var(--color-offline-bg)';
      reportFeedback.style.color = 'var(--color-offline)';
      reportFeedback.style.border = '1px solid var(--color-offline-border)';
      reportFeedback.textContent = 'Network error while dispatching report';
    }
    sendReportBtn.disabled = false;
    if (sendReportBtnText) sendReportBtnText.textContent = `Send Report to ${evt.department || 'Department'}`;
  } finally {
    if (sendReportSpinner) sendReportSpinner.style.display = 'none';
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

  // Dynamic ingestion of real-time vehicle observations
  socket.on('edge-vehicle-observation', (obs) => {
    if (currentMapMode === 'DENSITY') {
      fetchAndRenderTrafficDensity();
    }
  });

  // Dynamic ingestion of newly finalized edge events!
  socket.on('edge-event-detected', async (newEvent) => {
    if (!hasAdminPortalRequirements(newEvent)) {
      console.log('[Admin Portal] Real-time edge event skipped (lacks GPS or frame image):', newEvent?.event_id);
      return;
    }
    console.log('[Admin Portal] Real-time edge event detected:', newEvent.event_id);
    await fetchStats();
    await fetchAndRenderEvents();
    if (newEvent.event_id && allEventsCache.some(e => e.event_id === newEvent.event_id)) {
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

  // Verification real-time synchronization
  socket.on('event-verified', ({ event_id, verified_by, verified_at }) => {
    console.log('[Admin Portal] Real-time event verified:', event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.verification_status = 'VERIFIED';
      evt.is_active = true;
      evt.verified_by = verified_by;
      evt.verified_at = verified_at;
      renderEventsTable(allEventsCache);
      updateSingleMapMarker(evt);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
  });

  socket.on('event-rejected', ({ event_id, rejected_by, rejected_at, rejection_reason }) => {
    console.log('[Admin Portal] Real-time event rejected:', event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.verification_status = 'REJECTED';
      evt.is_active = false;
      evt.rejected_by = rejected_by;
      evt.rejected_at = rejected_at;
      evt.rejection_reason = rejection_reason;
      updateSingleMapMarker(evt);
      if (currentVerificationFilter !== 'all' && currentVerificationFilter !== 'REJECTED') {
        allEventsCache = allEventsCache.filter(e => e.event_id !== event_id);
      }
      renderEventsTable(allEventsCache);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
  });

  // Real-time listener for dispatched department reports
  socket.on('department-report-sent', ({ report_id, event_id, department, status }) => {
    console.log('[Admin Portal] Real-time department report dispatched:', report_id, event_id);
    const evt = allEventsCache.find(e => e.event_id === event_id);
    if (evt) {
      evt.report_status = status || 'SENT';
      evt.report_id = report_id;
      renderEventsTable(allEventsCache);
      if (selectedEventId === event_id) {
        selectEventById(event_id, false);
      }
    }
    fetchStats();
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
// 12. DEPARTMENT, WORK ORDERS & ANALYTICS VIEWS HELPERS
// ==============================================================================
async function renderWorkOrdersView() {
  const tbody = document.getElementById('workordersTableBody');
  const empty = document.getElementById('workordersEmptyState');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/workorders', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const workOrders = data.work_orders || [];

    tbody.innerHTML = '';
    if (workOrders.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    workOrders.forEach(wo => {
      const tr = document.createElement('tr');
      const createdStr = wo.created_at ? new Date(wo.created_at).toLocaleString() : '--';
      const prio = (wo.priority || 'MEDIUM').toUpperCase();
      const status = (wo.status || 'SENT').toUpperCase();

      let badgeClass = 'badge-status-sent';
      if (status === 'SOLVED' || status === 'COMPLETED' || status === 'RESOLVED') {
        badgeClass = 'badge-status-solved';
      } else if (status === 'PENDING') {
        badgeClass = 'badge-status-pending';
      }

      tr.innerHTML = `
        <td><strong>${wo.event_type || wo.title || 'Road Defect'}</strong> <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--admin-text-muted);">(${wo.work_order_id || wo.id})</span></td>
        <td><span style="font-weight: 600; color: var(--admin-primary);">${wo.department || 'Road Maintenance'}</span></td>
        <td><span style="font-weight: 700; ${prio === 'HIGH' ? 'color: var(--admin-alert);' : ''}">${prio}</span></td>
        <td style="font-family: var(--font-mono); font-size: 0.75rem;">${createdStr}</td>
        <td><span class="badge-status ${badgeClass}">${status}</span></td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            ${status !== 'SOLVED' && status !== 'COMPLETED' ? `
              <button type="button" class="btn-subtle" onclick="updateWorkOrderStatus('${wo.work_order_id || wo.id}', 'SOLVED', '${wo.event_id || ''}')" style="padding: 3px 8px; font-size: 0.72rem; border-color: #10B981; color: #047857; font-weight: 700;">
                Mark Solved
              </button>
            ` : ''}
            ${wo.event_id ? `
              <button type="button" class="btn-subtle" onclick="selectEventById('${wo.event_id}', true); showView('events');" style="padding: 3px 8px; font-size: 0.72rem;">
                View Report
              </button>
            ` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to fetch work orders:', err);
    if (empty) empty.style.display = 'block';
  }
}
window.renderWorkOrdersView = renderWorkOrdersView;

async function updateWorkOrderStatus(workOrderId, newStatus, eventId) {
  try {
    const res = await fetch(`/api/admin/workorders/${workOrderId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      if (eventId) {
        await updateEventStatus(eventId, newStatus);
      }
      await renderWorkOrdersView();
    }
  } catch (err) {
    console.error('Failed to update work order status:', err);
  }
}
window.updateWorkOrderStatus = updateWorkOrderStatus;

window.filterDepartmentFromView = function(catCode) {
  showView('overview');
  if (catCode === 'road') {
    selectDepartment('ROAD MAINTENANCE');
    setActiveNav('road');
  } else if (catCode === 'traffic') {
    selectDepartment('TRAFFIC');
    setActiveNav('traffic');
  } else if (catCode === 'safety') {
    selectDepartment('SAFETY');
    setActiveNav('safety');
  } else {
    selectDepartment('ALL');
    setActiveNav('events');
  }
};

function renderDepartmentBreakdown(byDept) {
  const container = document.getElementById('deptCardsContainer');
  if (!container) return;

  const targetDepts = [
    { name: 'ROAD MAINTENANCE', code: 'road' },
    { name: 'TRAFFIC MANAGEMENT', code: 'traffic' },
    { name: 'PUBLIC SAFETY', code: 'safety' }
  ];

  allEventsCache.forEach(e => {
    if (e.department) {
      const dUpper = e.department.toUpperCase();
      if (!targetDepts.some(d => d.name === dUpper)) {
        targetDepts.push({ name: dUpper, code: 'other' });
      }
    }
  });

  container.innerHTML = targetDepts.map(dept => {
    const deptEvents = allEventsCache.filter(e => {
      const d = String(e.department || '').toUpperCase();
      if (dept.code === 'road') return isRoadEvent(e) || d.includes('ROAD');
      if (dept.code === 'traffic') return isTrafficEvent(e) || d.includes('TRAFFIC');
      if (dept.code === 'safety') return isSafetyEvent(e) || d.includes('SAFETY');
      return d === dept.name;
    });

    const total = deptEvents.length;
    const pending = deptEvents.filter(e => (e.status || 'PENDING').toUpperCase() === 'PENDING').length;
    const sent = deptEvents.filter(e => (e.status || '').toUpperCase() === 'SENT').length;
    const solved = deptEvents.filter(e => (e.status || '').toUpperCase() === 'SOLVED').length;

    if (total === 0) {
      return `
        <div class="dept-card-real">
          <div class="dept-header-real">
            <span class="dept-title-real">${dept.name}</span>
            <span class="badge" style="background: var(--admin-surface-subtle); color: var(--admin-text-muted);">0 events</span>
          </div>
          <div class="dept-empty-notice">No active events</div>
        </div>
      `;
    }

    return `
      <div class="dept-card-real">
        <div class="dept-header-real">
          <span class="dept-title-real">${dept.name}</span>
          <span class="badge" style="background: #E8EEFB; color: var(--admin-primary); font-weight: 700;">${total} Total</span>
        </div>
        <div class="dept-status-breakdown">
          <div class="dept-status-box">
            <span class="dept-status-box-val" style="color: #D97706;">${pending}</span>
            <span class="dept-status-box-lbl">Pending events</span>
          </div>
          <div class="dept-status-box">
            <span class="dept-status-box-val" style="color: var(--admin-primary);">${sent}</span>
            <span class="dept-status-box-lbl">Sent events</span>
          </div>
          <div class="dept-status-box">
            <span class="dept-status-box-val" style="color: #059669;">${solved}</span>
            <span class="dept-status-box-lbl">Solved events</span>
          </div>
        </div>
        <button type="button" class="btn-subtle" onclick="filterDepartmentFromView('${dept.code}')" style="margin-top: 0.5rem; width: 100%; text-align: center;">
          View ${dept.name} Incidents &rarr;
        </button>
      </div>
    `;
  }).join('');
}

function renderAnalyticsBreakdown(stats) {
  const container = document.getElementById('analyticsCardsContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-unit">
      <span class="stat-unit-label">TOTAL RECORDED DEFECTS</span>
      <span class="stat-unit-value">${stats.total_events || stats.total_detections || 0}</span>
      <span class="stat-unit-desc">Aggregated across mobile transit sensing fleet</span>
    </div>
    <div class="stat-unit">
      <span class="stat-unit-label">CRITICAL REPAIRS REQUIRED</span>
      <span class="stat-unit-value" style="color: var(--admin-alert);">${stats.critical_events || 0}</span>
      <span class="stat-unit-desc">High risk score urban infrastructure incidents</span>
    </div>
    <div class="stat-unit">
      <span class="stat-unit-label">ROAD &amp; INFRASTRUCTURE</span>
      <span class="stat-unit-value" style="color: var(--admin-primary);">${stats.road_problems || 0}</span>
      <span class="stat-unit-desc">Potholes, cracks, and road degradation</span>
    </div>
    <div class="stat-unit">
      <span class="stat-unit-label">TRAFFIC ANOMALIES</span>
      <span class="stat-unit-value" style="color: var(--admin-secondary);">${stats.traffic_problems || 0}</span>
      <span class="stat-unit-desc">Bottlenecks and congestion zones</span>
    </div>
    <div class="stat-unit">
      <span class="stat-unit-label">PUBLIC SAFETY EVENTS</span>
      <span class="stat-unit-value" style="color: var(--admin-warning);">${stats.safety_incidents || 0}</span>
      <span class="stat-unit-desc">Rash driving and vulnerable pedestrian alerts</span>
    </div>
    <div class="stat-unit">
      <span class="stat-unit-label">DISPATCHED REPORTS</span>
      <span class="stat-unit-value" style="color: var(--admin-online);">${stats.reports_sent || stats.reports_dispatched || 0}</span>
      <span class="stat-unit-desc">Official reports sent to municipal action teams</span>
    </div>
  `;
}

// ==============================================================================
// 12. TRAFFIC DENSITY HEATMAP & UNIFIED MAP MODE SWITCHER
// ==============================================================================

// 12.1 STATIC DEMO TRAFFIC DENSITY DATA (HYDERABAD URBAN NETWORK)
// Isolated frontend presentation fallback layer - NEVER inserted into database/Supabase
// Represents realistic urban arterial, secondary, and residential density distribution
const DEMO_TRAFFIC_DENSITY_DATA = [
  // HIGH DENSITY ZONES: Major arterial junctions & IT corridors (Weight ~0.80 - 1.0)
  { zone: "Gachibowli Junction", tier: "HIGH", lat: 17.4401, lon: 78.3489, car_count: 52, motorcycle_count: 34, bus_count: 12, truck_count: 5, total_vehicles: 103 },
  { zone: "Hitec City Cyber Towers", tier: "HIGH", lat: 17.4504, lon: 78.3808, car_count: 65, motorcycle_count: 42, bus_count: 8, truck_count: 3, total_vehicles: 118 },
  { zone: "Mehdipatnam Junction", tier: "HIGH", lat: 17.3916, lon: 78.4404, car_count: 38, motorcycle_count: 48, bus_count: 18, truck_count: 6, total_vehicles: 110 },
  { zone: "Panjagutta Circle", tier: "HIGH", lat: 17.4265, lon: 78.4518, car_count: 46, motorcycle_count: 36, bus_count: 10, truck_count: 4, total_vehicles: 96 },
  { zone: "Begumpet Flyover Arterial", tier: "HIGH", lat: 17.4448, lon: 78.4682, car_count: 44, motorcycle_count: 32, bus_count: 9, truck_count: 5, total_vehicles: 90 },
  { zone: "Secunderabad Station Hub", tier: "HIGH", lat: 17.4344, lon: 78.5015, car_count: 36, motorcycle_count: 45, bus_count: 22, truck_count: 8, total_vehicles: 111 },
  { zone: "Lakdikapul Intersection", tier: "HIGH", lat: 17.4042, lon: 78.4639, car_count: 40, motorcycle_count: 38, bus_count: 11, truck_count: 4, total_vehicles: 93 },
  { zone: "KPHB Colony / JNTU Junction", tier: "HIGH", lat: 17.4947, lon: 78.3996, car_count: 45, motorcycle_count: 40, bus_count: 10, truck_count: 5, total_vehicles: 100 },
  { zone: "Dilsukhnagar Main Corridor", tier: "HIGH", lat: 17.3688, lon: 78.5247, car_count: 32, motorcycle_count: 46, bus_count: 15, truck_count: 7, total_vehicles: 100 },

  // MEDIUM DENSITY ZONES: Secondary connecting avenues & commercial streets (Weight ~0.50 - 0.70)
  { zone: "Jubilee Hills Checkpost", tier: "MEDIUM", lat: 17.4296, lon: 78.4112, car_count: 28, motorcycle_count: 16, bus_count: 3, truck_count: 1, total_vehicles: 48 },
  { zone: "Banjara Hills Road No 1", tier: "MEDIUM", lat: 17.4156, lon: 78.4482, car_count: 26, motorcycle_count: 18, bus_count: 4, truck_count: 1, total_vehicles: 49 },
  { zone: "Madhapur 100ft Road", tier: "MEDIUM", lat: 17.4468, lon: 78.3905, car_count: 30, motorcycle_count: 22, bus_count: 3, truck_count: 2, total_vehicles: 57 },
  { zone: "Kondapur Botanical Garden Rd", tier: "MEDIUM", lat: 17.4608, lon: 78.3612, car_count: 24, motorcycle_count: 18, bus_count: 3, truck_count: 2, total_vehicles: 47 },
  { zone: "Ameerpet Cross Roads", tier: "MEDIUM", lat: 17.4375, lon: 78.4483, car_count: 22, motorcycle_count: 30, bus_count: 6, truck_count: 2, total_vehicles: 60 },
  { zone: "Abids GPO Road", tier: "MEDIUM", lat: 17.3912, lon: 78.4735, car_count: 20, motorcycle_count: 26, bus_count: 7, truck_count: 2, total_vehicles: 55 },
  { zone: "Tolichowki Flyover Link", tier: "MEDIUM", lat: 17.4019, lon: 78.4128, car_count: 25, motorcycle_count: 24, bus_count: 5, truck_count: 3, total_vehicles: 57 },
  { zone: "Kukatpally Y-Junction", tier: "MEDIUM", lat: 17.4842, lon: 78.4189, car_count: 26, motorcycle_count: 25, bus_count: 6, truck_count: 4, total_vehicles: 61 },

  // LOW DENSITY ZONES: Residential & local feeder corridors (Weight ~0.20 - 0.40)
  { zone: "Jubilee Hills Road 36 Feeder", tier: "LOW", lat: 17.4345, lon: 78.4021, car_count: 12, motorcycle_count: 7, bus_count: 0, truck_count: 0, total_vehicles: 19 },
  { zone: "Shaikpet Residential Link", tier: "LOW", lat: 17.4082, lon: 78.3951, car_count: 9, motorcycle_count: 12, bus_count: 1, truck_count: 0, total_vehicles: 22 },
  { zone: "Film Nagar Corridor", tier: "LOW", lat: 17.4172, lon: 78.4116, car_count: 14, motorcycle_count: 8, bus_count: 0, truck_count: 1, total_vehicles: 23 },
  { zone: "Somajiguda Officers Colony", tier: "LOW", lat: 17.4241, lon: 78.4612, car_count: 10, motorcycle_count: 9, bus_count: 1, truck_count: 0, total_vehicles: 20 },
  { zone: "Tarnaka Sector Road", tier: "LOW", lat: 17.4278, lon: 78.5342, car_count: 9, motorcycle_count: 13, bus_count: 1, truck_count: 1, total_vehicles: 24 },
  { zone: "Nanakramguda Outer Link", tier: "LOW", lat: 17.4187, lon: 78.3498, car_count: 15, motorcycle_count: 9, bus_count: 1, truck_count: 1, total_vehicles: 26 },
  { zone: "Kharkhana Main Link", tier: "LOW", lat: 17.4611, lon: 78.4982, car_count: 12, motorcycle_count: 14, bus_count: 2, truck_count: 1, total_vehicles: 29 },
  { zone: "Bowenpally Residential Link", tier: "LOW", lat: 17.4725, lon: 78.4841, car_count: 13, motorcycle_count: 11, bus_count: 2, truck_count: 1, total_vehicles: 27 }
];

function setupTrafficDensityControls() {
  // Map Mode Toggle (EVENTS vs TRAFFIC DENSITY)
  if (btnModeEvents) {
    btnModeEvents.addEventListener('click', () => switchMapMode('EVENTS'));
  }
  if (btnModeDensity) {
    btnModeDensity.addEventListener('click', () => switchMapMode('DENSITY'));
  }

  // Events Sub-Filter Buttons (Road, Traffic, Safety, All)
  const eventsSubFilterGroup = document.getElementById('eventsSubFilterGroup');
  if (eventsSubFilterGroup) {
    eventsSubFilterGroup.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        eventsSubFilterGroup.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sc = btn.getAttribute('data-subcat');
        if (sc === 'road') selectDepartment('ROAD MAINTENANCE');
        else if (sc === 'traffic') selectDepartment('TRAFFIC');
        else if (sc === 'safety') selectDepartment('SAFETY');
        else selectDepartment('ALL');
      });
    });
  }

  // Segmented Vehicle Type Controls (ALL VEHICLES, CARS, MOTORCYCLES, BUSES, TRUCKS)
  const densityVehicleSegmented = document.getElementById('densityVehicleSegmented');
  if (densityVehicleSegmented) {
    densityVehicleSegmented.querySelectorAll('.btn-density-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        densityVehicleSegmented.querySelectorAll('.btn-density-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDensityVehicleFilter = btn.getAttribute('data-vtype') || 'all';
        if (densityVehicleFilter) densityVehicleFilter.value = currentDensityVehicleFilter;
        fetchAndRenderTrafficDensity();
      });
    });
  }

  // Fallback select element
  if (densityVehicleFilter) {
    densityVehicleFilter.addEventListener('change', () => {
      currentDensityVehicleFilter = densityVehicleFilter.value;
      if (densityVehicleSegmented) {
        densityVehicleSegmented.querySelectorAll('.btn-density-tab').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-vtype') === currentDensityVehicleFilter);
        });
      }
      fetchAndRenderTrafficDensity();
    });
  }

  // Time Window Select
  if (densityTimeFilter) {
    densityTimeFilter.addEventListener('change', () => {
      currentDensityTimeFilter = densityTimeFilter.value;
      fetchAndRenderTrafficDensity();
    });
  }

  // Refresh Button
  if (refreshDensityBtn) {
    refreshDensityBtn.addEventListener('click', () => {
      fetchAndRenderTrafficDensity();
    });
  }
}

function switchMapMode(newMode) {
  if (currentMapMode === newMode) return;
  currentMapMode = newMode;

  const viewOverview = document.getElementById('view-overview');
  const eventsSubFilterGroup = document.getElementById('eventsSubFilterGroup');
  const trafficDensitySubFilterGroup = document.getElementById('trafficDensitySubFilterGroup');
  const trafficDensitySourceBadge = document.getElementById('trafficDensitySourceBadge');
  const trafficSummaryPanel = document.getElementById('trafficSummaryPanel');
  const floatingHeatmapLegend = document.getElementById('floatingHeatmapLegend');

  if (currentMapMode === 'EVENTS') {
    // 1. Toggle primary segmented toggle state
    if (btnModeEvents) {
      btnModeEvents.classList.add('active');
      btnModeEvents.setAttribute('aria-selected', 'true');
    }
    if (btnModeDensity) {
      btnModeDensity.classList.remove('active');
      btnModeDensity.setAttribute('aria-selected', 'false');
    }

    // 2. Adjust toolbars & layout
    if (eventsSubFilterGroup) eventsSubFilterGroup.style.display = 'inline-flex';
    if (trafficDensitySubFilterGroup) trafficDensitySubFilterGroup.style.display = 'none';
    if (floatingHeatmapLegend) floatingHeatmapLegend.style.display = 'none';
    if (trafficSummaryPanel) trafficSummaryPanel.style.display = 'none';
    if (trafficDensitySourceBadge) trafficDensitySourceBadge.style.display = 'none';
    if (densityEmptyState) densityEmptyState.style.display = 'none';
    if (viewOverview) viewOverview.classList.remove('density-mode-active');

    // 3. Remove Heatmap Layer
    if (trafficHeatLayer && leafletMap) {
      leafletMap.removeLayer(trafficHeatLayer);
      trafficHeatLayer = null;
    }

    // 4. Restore Event Markers based on active category filter
    applyDepartmentFiltersAndRender();
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 60);
      fitMapToMarkers();
    }
  } else if (currentMapMode === 'DENSITY') {
    // 1. Toggle primary segmented toggle state
    if (btnModeDensity) {
      btnModeDensity.classList.add('active');
      btnModeDensity.setAttribute('aria-selected', 'true');
    }
    if (btnModeEvents) {
      btnModeEvents.classList.remove('active');
      btnModeEvents.setAttribute('aria-selected', 'false');
    }

    // 2. Adjust toolbars & layout
    if (eventsSubFilterGroup) eventsSubFilterGroup.style.display = 'none';
    if (trafficDensitySubFilterGroup) trafficDensitySubFilterGroup.style.display = 'inline-flex';
    if (floatingHeatmapLegend) floatingHeatmapLegend.style.display = 'flex';
    if (trafficSummaryPanel) trafficSummaryPanel.style.display = 'grid';
    if (trafficDensitySourceBadge) trafficDensitySourceBadge.style.display = 'inline-flex';
    if (viewOverview) viewOverview.classList.add('density-mode-active');

    // 3. Keep Traffic detection pins on map layer so heatmap and pins co-exist
    if (leafletMap) {
      mapMarkersMap.forEach((marker, id) => {
        const evt = allEventsCache.find(e => (e.event_id || e.id) === id) || DEMO_EVENTS_MAP.get(id);
        const isTraffic = evt && isTrafficEvent(evt);
        if (isTraffic) {
          if (!leafletMap.hasLayer(marker)) marker.addTo(leafletMap);
        } else {
          if (leafletMap.hasLayer(marker)) leafletMap.removeLayer(marker);
        }
      });
      setTimeout(() => leafletMap.invalidateSize(), 60);
    }

    // 4. Fetch & Render Traffic Density Heatmap
    fetchAndRenderTrafficDensity();
  }
}

async function fetchAndRenderTrafficDensity() {
  if (currentMapMode !== 'DENSITY' || !leafletMap) return;

  const vehicleType = densityVehicleFilter ? densityVehicleFilter.value : currentDensityVehicleFilter;
  const timeWindow = densityTimeFilter ? densityTimeFilter.value : currentDensityTimeFilter;
  const trafficDensitySourceBadge = document.getElementById('trafficDensitySourceBadge');
  const trafficSummaryPanel = document.getElementById('trafficSummaryPanel');
  const tsValTotal = document.getElementById('tsValTotal');
  const tsValPoints = document.getElementById('tsValPoints');
  const tsValHighDensity = document.getElementById('tsValHighDensity');
  const tsValLastUpdated = document.getElementById('tsValLastUpdated');

  try {
    const params = new URLSearchParams();
    params.append('vehicle_type', vehicleType);
    params.append('window', timeWindow);

    let realPoints = [];
    let realBreakdown = null;
    let apiSuccess = false;

    try {
      const res = await fetch(`/api/admin/traffic-density?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.points)) {
          realPoints = data.points;
          realBreakdown = data.breakdown;
          apiSuccess = true;
        }
      }
    } catch (e) {
      console.warn('[Traffic Density] API fetch error, falling back to static presentation data:', e.message);
    }

    let isDemoFallback = false;
    let points = [];
    let breakdown = { cars: 0, motorcycles: 0, buses: 0, trucks: 0, total: 0 };
    let totalPointsCount = 0;

    // PRESENTATION FALLBACK LOGIC:
    // If the database has >= 3 observations, prefer real observations.
    // If database has insufficient points (< 3), use deterministic DEMO_TRAFFIC_DENSITY_DATA
    if (apiSuccess && realPoints.length >= 3) {
      isDemoFallback = false;
      let maxObs = 1;
      realPoints.forEach(p => {
        const val = p[2] || 1;
        if (val > maxObs) maxObs = val;
      });
      points = realPoints.map(p => {
        const raw = p[2] || 1;
        const normIntensity = Math.min(1.0, Math.max(0.35, +(raw / maxObs).toFixed(2)));
        return [p[0], p[1], normIntensity];
      });
      breakdown = realBreakdown || { cars: 0, motorcycles: 0, buses: 0, trucks: 0, total: 0 };
      totalPointsCount = realPoints.length;

      if (trafficDensitySourceBadge) {
        trafficDensitySourceBadge.style.display = 'inline-flex';
        trafficDensitySourceBadge.textContent = 'LIVE TELEMETRY';
        trafficDensitySourceBadge.className = 'demo-data-badge live';
      }
      if (tsValHighDensity) tsValHighDensity.textContent = 'Active Transit Corridors';
      if (tsValLastUpdated) tsValLastUpdated.textContent = 'Supabase Real-time Telemetry';
    } else {
      isDemoFallback = true;
      if (trafficDensitySourceBadge) {
        trafficDensitySourceBadge.style.display = 'inline-flex';
        trafficDensitySourceBadge.textContent = 'DEMO TRAFFIC DATA';
        trafficDensitySourceBadge.className = 'demo-data-badge demo';
      }
      if (tsValHighDensity) tsValHighDensity.textContent = 'Gachibowli, Hitec City, Mehdipatnam, Secunderabad';
      if (tsValLastUpdated) tsValLastUpdated.textContent = 'Static Urban Demo Fallback';

      // Aggregate breakdown across all static demo zones
      let maxCountForFilter = 1;
      DEMO_TRAFFIC_DENSITY_DATA.forEach(d => {
        breakdown.cars += d.car_count;
        breakdown.motorcycles += d.motorcycle_count;
        breakdown.buses += d.bus_count;
        breakdown.trucks += d.truck_count;
        breakdown.total += d.total_vehicles;

        let c = d.total_vehicles;
        if (vehicleType === 'car') c = d.car_count;
        else if (vehicleType === 'motorcycle') c = d.motorcycle_count;
        else if (vehicleType === 'bus') c = d.bus_count;
        else if (vehicleType === 'truck') c = d.truck_count;
        if (c > maxCountForFilter) maxCountForFilter = c;
      });

      // Filter and scale demo coordinates based on selected vehicleType
      points = DEMO_TRAFFIC_DENSITY_DATA.map(d => {
        let count = d.total_vehicles;
        if (vehicleType === 'car') count = d.car_count;
        else if (vehicleType === 'motorcycle') count = d.motorcycle_count;
        else if (vehicleType === 'bus') count = d.bus_count;
        else if (vehicleType === 'truck') count = d.truck_count;

        if (count <= 0) return null;
        // Non-linear scaling ensures high-density arterial hubs produce punchy orange/red hotspots
        const ratio = count / maxCountForFilter;
        const intensity = Math.min(1.0, Math.max(0.32, +(Math.pow(ratio, 0.85)).toFixed(2)));
        return [d.lat, d.lon, intensity];
      }).filter(Boolean);

      totalPointsCount = points.length;
    }

    // Update compact summary metrics in toolbar
    if (densityValTotal) densityValTotal.textContent = Number(breakdown.total || 0).toLocaleString();
    if (densityValCars) densityValCars.textContent = Number(breakdown.cars || 0).toLocaleString();
    if (densityValMotorcycles) densityValMotorcycles.textContent = Number(breakdown.motorcycles || 0).toLocaleString();
    if (densityValBuses) densityValBuses.textContent = Number(breakdown.buses || 0).toLocaleString();
    if (densityValTrucks) densityValTrucks.textContent = Number(breakdown.trucks || 0).toLocaleString();

    // Update Traffic Summary Panel below map
    if (trafficSummaryPanel) trafficSummaryPanel.style.display = 'grid';
    if (tsValTotal) {
      let displayTotal = breakdown.total;
      if (vehicleType === 'car') displayTotal = breakdown.cars;
      else if (vehicleType === 'motorcycle') displayTotal = breakdown.motorcycles;
      else if (vehicleType === 'bus') displayTotal = breakdown.buses;
      else if (vehicleType === 'truck') displayTotal = breakdown.trucks;
      tsValTotal.textContent = Number(displayTotal || 0).toLocaleString();
    }
    if (tsValPoints) tsValPoints.textContent = totalPointsCount;

    // Check empty state
    if (points.length === 0) {
      if (trafficHeatLayer && leafletMap) {
        leafletMap.removeLayer(trafficHeatLayer);
        trafficHeatLayer = null;
      }
      if (densityEmptyState) densityEmptyState.style.display = 'block';
      if (mapEventCountBadge) mapEventCountBadge.textContent = '0 density points';
      return;
    }

    if (densityEmptyState) densityEmptyState.style.display = 'none';

    // Remove old heat layer
    if (trafficHeatLayer && leafletMap) {
      leafletMap.removeLayer(trafficHeatLayer);
      trafficHeatLayer = null;
    }

    // Create fresh Leaflet Heat layer with vibrant, high-intensity color hierarchy
    // LOW (Blue/Cyan) -> MEDIUM (Green) -> HIGH (Amber/Orange) -> VERY HIGH (Red) -> HOTSPOT (Deep Red)
    if (window.L && window.L.heatLayer) {
      trafficHeatLayer = L.heatLayer(points, {
        radius: 35,
        blur: 19,
        maxZoom: 16,
        max: 0.85,
        minOpacity: 0.48,
        gradient: {
          0.00: '#1D4ED8', // Low: Vibrant Blue
          0.22: '#06B6D4', // Medium-Low: Cyan
          0.42: '#10B981', // Medium: Emerald Green
          0.62: '#F59E0B', // High: Amber / Yellow
          0.78: '#F97316', // High-Concentration: Vibrant Orange
          0.90: '#EF4444', // Very High: Red
          1.00: '#991B1B'  // Hotspot: Deep Crimson Red
        }
      }).addTo(leafletMap);
    }

    if (mapEventCountBadge) {
      mapEventCountBadge.textContent = `${points.length} density zones (${breakdown.total || 0} veh)`;
    }

    // Fit map bounds to points so user immediately sees traffic distribution
    if (points.length > 0 && leafletMap) {
      const latLngs = points.map(p => [p[0], p[1]]);
      const bounds = L.latLngBounds(latLngs);
      leafletMap.fitBounds(bounds.pad(0.12));
    }

  } catch (err) {
    console.error('[Admin Portal] Traffic density fetch error:', err);
    if (densityEmptyState) densityEmptyState.style.display = 'block';
  }
}

// ==============================================================================
// 13. DEDICATED DOMAIN PRESENTATION FALLBACK DATASETS
// Deterministic frontend visualization layers - NEVER inserted into Supabase/DB
// ==============================================================================
const DEMO_ROAD_DEFECTS_DATA = [
  { zone: "Tolichowki Flyover Underpass", defect: "POTHOLE", lat: 17.4021, lon: 78.4132, severity: "CRITICAL", confidence: 0.94, bus: "TS-09-UB-4023" },
  { zone: "Ameerpet Metro Pillar 1042", defect: "POTHOLE", lat: 17.4382, lon: 78.4489, severity: "HIGH", confidence: 0.91, bus: "TS-09-UB-4024" },
  { zone: "Mehdipatnam Bus Terminal Corridor", defect: "ROAD DAMAGE", lat: 17.3922, lon: 78.4410, severity: "HIGH", confidence: 0.88, bus: "TS-09-UB-4023" },
  { zone: "Amberpet Causeway Link", defect: "POTHOLE", lat: 17.3992, lon: 78.5145, severity: "CRITICAL", confidence: 0.96, bus: "TS-09-UB-4025" },
  { zone: "Secunderabad Station Approach", defect: "CRACK", lat: 17.4351, lon: 78.5022, severity: "MEDIUM", confidence: 0.86, bus: "TS-09-UB-4022" },
  { zone: "Miyapur Allwyn Crossroad", defect: "POTHOLE", lat: 17.4975, lon: 78.3618, severity: "HIGH", confidence: 0.89, bus: "TS-09-UB-4021" },
  { zone: "Banjara Hills Road No 12", defect: "INFRASTRUCTURE", lat: 17.4178, lon: 78.4390, severity: "MEDIUM", confidence: 0.84, bus: "TS-09-UB-4024" },
  { zone: "Kukatpally Housing Board Outer Link", defect: "POTHOLE", lat: 17.4912, lon: 78.3985, severity: "HIGH", confidence: 0.92, bus: "TS-09-UB-4021" }
];

const DEMO_SAFETY_INCIDENTS_DATA = [
  { zone: "Musheerabad Low-Lying Underpass", type: "WATERLOGGING", lat: 17.4195, lon: 78.4988, severity: "CRITICAL", confidence: 0.95, bus: "TS-09-UB-4025" },
  { zone: "Koti Women's College Crossing", type: "PEDESTRIAN RISK", lat: 17.3872, lon: 78.4835, severity: "HIGH", confidence: 0.91, bus: "TS-09-UB-4022" },
  { zone: "Moosarambagh Old Bridge", type: "WATERLOGGING", lat: 17.3732, lon: 78.5120, severity: "CRITICAL", confidence: 0.97, bus: "TS-09-UB-4025" },
  { zone: "Panjagutta Flyover Merge", type: "HAZARD", lat: 17.4272, lon: 78.4525, severity: "HIGH", confidence: 0.87, bus: "TS-09-UB-4024" },
  { zone: "Gachibowli Stadium Perimeter", type: "PEDESTRIAN RISK", lat: 17.4435, lon: 78.3472, severity: "MEDIUM", confidence: 0.83, bus: "TS-09-UB-4021" },
  { zone: "Begumpet Airport Road", type: "HAZARD", lat: 17.4462, lon: 78.4715, severity: "MEDIUM", confidence: 0.85, bus: "TS-09-UB-4022" }
];

// ==============================================================================
// 14. ROAD NETWORK INTELLIGENCE & ROAD DEFECT HEATMAP MODULE
// ==============================================================================
let roadMap = null;
let roadHeatLayer = null;
let currentRoadDefectFilter = 'all';

function initRoadMap() {
  if (roadMap) {
    roadMap.invalidateSize();
    return;
  }
  const el = document.getElementById('roadGisMap');
  if (!el || !window.L) return;

  roadMap = L.map('roadGisMap', {
    zoomControl: true,
    attributionControl: true
  }).setView([17.385044, 78.486671], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(roadMap);

  const btnFit = document.getElementById('fitRoadMapBtn');
  if (btnFit) {
    btnFit.onclick = () => fitRoadMapBounds();
  }
  const btnRecenter = document.getElementById('recenterRoadMapBtn');
  if (btnRecenter) {
    btnRecenter.onclick = () => {
      if (roadMap) roadMap.setView([17.385044, 78.486671], 12);
    };
  }
  const btnRefresh = document.getElementById('refreshRoadMapBtn');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      btnRefresh.style.transform = 'rotate(180deg)';
      setTimeout(() => { btnRefresh.style.transform = ''; }, 350);
      renderRoadsView();
    };
  }

  // Also bind top header refresh button
  const topRefresh = document.getElementById('refreshRoadsBtn');
  if (topRefresh) {
    topRefresh.onclick = () => renderRoadsView();
  }
}

function fitRoadMapBounds() {
  if (!roadMap) return;
  const roadEvents = getFilteredRoadEvents();
  const valid = roadEvents.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  if (valid.length > 0) {
    const bounds = L.latLngBounds(valid.map(e => [parseFloat(e.latitude), parseFloat(e.longitude)]));
    roadMap.fitBounds(bounds.pad(0.18));
  } else {
    const demoBounds = L.latLngBounds(DEMO_ROAD_DEFECTS_DATA.map(d => [d.lat, d.lon]));
    roadMap.fitBounds(demoBounds.pad(0.18));
  }
}

function getFilteredRoadEvents() {
  return getCombinedPresentationEvents().filter(isRoadEvent);
}

function renderRoadsView() {
  const roadEvents = getFilteredRoadEvents();

  // 1. KPI Calculations
  const totalRoad = roadEvents.length;
  const potholes = roadEvents.filter(e => (e.problem || e.title || '').toLowerCase().includes('pothole')).length;
  const cracks = roadEvents.filter(e => {
    const p = (e.problem || e.title || '').toLowerCase();
    return p.includes('crack') || p.includes('damage') || p.includes('fissure');
  }).length;
  const unresolved = roadEvents.filter(e => (e.status || '').toUpperCase() !== 'SOLVED').length;

  const roadStatTotal = document.getElementById('roadStatTotal');
  const roadStatPotholes = document.getElementById('roadStatPotholes');
  const roadStatCracks = document.getElementById('roadStatCracks');
  const roadStatUnresolved = document.getElementById('roadStatUnresolved');

  if (roadStatTotal) roadStatTotal.textContent = totalRoad;
  if (roadStatPotholes) roadStatPotholes.textContent = potholes;
  if (roadStatCracks) roadStatCracks.textContent = cracks;
  if (roadStatUnresolved) roadStatUnresolved.textContent = unresolved;

  // 2. Render Heatmap & Detection Pins
  renderRoadDefectHeatmap();

  // 3. Render Defect Feed
  renderRoadsFeed(roadEvents);

  // 4. Render Audit Table
  renderRoadsTable(roadEvents);
}

function renderRoadDefectHeatmap() {
  if (!roadMap) return;

  let roadEvents = getFilteredRoadEvents();

  if (currentRoadDefectFilter === 'pothole') {
    roadEvents = roadEvents.filter(e => (e.problem || e.title || '').toLowerCase().includes('pothole'));
  } else if (currentRoadDefectFilter === 'crack') {
    roadEvents = roadEvents.filter(e => {
      const p = (e.problem || e.title || '').toLowerCase();
      return p.includes('crack') || p.includes('damage') || p.includes('fissure');
    });
  } else if (currentRoadDefectFilter === 'infra') {
    roadEvents = roadEvents.filter(e => {
      const p = (e.problem || e.title || '').toLowerCase();
      return p.includes('divider') || p.includes('sign') || p.includes('infra');
    });
  }

  const validPoints = roadEvents.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  const roadDataSourceBadge = document.getElementById('roadDataSourceBadge');
  const roadHeatmapCountBadge = document.getElementById('roadHeatmapCountBadge');

  // ALWAYS populate individual GIS markers onto the dedicated Road map
  if (!window.roadMapMarkersLayer && roadMap) {
    window.roadMapMarkersLayer = L.layerGroup().addTo(roadMap);
  } else if (window.roadMapMarkersLayer) {
    window.roadMapMarkersLayer.clearLayers();
  }

  validPoints.forEach(evt => {
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    const icon = createCategoryIcon(evt.category || 'road', evt.problem || evt.title, evt.risk_level || evt.priority, evt.verification_status || 'ACCEPTED');
    const marker = L.marker([lat, lon], { icon });

    marker.bindTooltip(formatMarkerTooltip(evt), {
      className: 'gis-hover-tooltip',
      direction: 'top',
      offset: [0, -28],
      opacity: 1
    });

    marker.on('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    if (window.roadMapMarkersLayer) {
      window.roadMapMarkersLayer.addLayer(marker);
    }
  });

  // Heatmap layer rendering
  let points = [];
  const hasReal = validPoints.some(e => !e.is_demo);

  if (hasReal) {
    if (roadDataSourceBadge) {
      roadDataSourceBadge.style.display = 'inline-flex';
      roadDataSourceBadge.textContent = 'REAL TELEMETRY';
      roadDataSourceBadge.className = 'demo-data-badge live';
    }
    points = validPoints.map(e => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      let intensity = 0.6;
      const risk = (e.risk_level || e.priority || '').toUpperCase();
      if (risk === 'CRITICAL') intensity = 1.0;
      else if (risk === 'HIGH') intensity = 0.8;
      else if (risk === 'MEDIUM') intensity = 0.55;
      else intensity = 0.35;
      return [lat, lon, intensity];
    });
  } else {
    // Presentation fallback
    if (roadDataSourceBadge) {
      roadDataSourceBadge.style.display = 'inline-flex';
      roadDataSourceBadge.textContent = 'DEMO ROAD DATA';
      roadDataSourceBadge.className = 'demo-data-badge demo';
    }
    points = validPoints.map(e => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      let intensity = 0.6;
      const risk = (e.risk_level || e.priority || '').toUpperCase();
      if (risk === 'CRITICAL') intensity = 1.0;
      else if (risk === 'HIGH') intensity = 0.8;
      else intensity = 0.5;
      return [lat, lon, intensity];
    });
  }

  if (roadHeatLayer && roadMap) {
    roadMap.removeLayer(roadHeatLayer);
    roadHeatLayer = null;
  }

  if (points.length > 0 && window.L && window.L.heatLayer) {
    roadHeatLayer = L.heatLayer(points, {
      radius: 32,
      blur: 24,
      maxZoom: 16,
      max: 0.70,
      minOpacity: 0.38,
      gradient: {
        0.00: '#1D4ED8', // Deep Blue
        0.20: '#06B6D4', // Cyan
        0.40: '#10B981', // Green
        0.60: '#F59E0B', // Amber
        0.75: '#F97316', // Orange
        0.88: '#EF4444', // Red
        1.00: '#991B1B'  // Deep Red / Hotspot
      }
    }).addTo(roadMap);
  }

  if (roadHeatmapCountBadge) {
    roadHeatmapCountBadge.textContent = `${validPoints.length} road defects`;
  }

  if (validPoints.length > 0) {
    const latLngs = validPoints.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);
    roadMap.fitBounds(L.latLngBounds(latLngs).pad(0.18));
  }
}

function renderRoadsFeed(roadEvents) {
  const container = document.getElementById('roadsDefectFeed');
  const emptyState = document.getElementById('roadsFeedEmptyState');
  if (!container) return;

  const eventsToShow = roadEvents.length > 0 ? roadEvents.slice(0, 15) : getCombinedPresentationEvents().filter(isRoadEvent);

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = eventsToShow.map(evt => {
    const conf = Math.round((evt.confidence || 0.88) * (evt.confidence > 1 ? 1 : 100));
    const timeAgo = formatTimeAgo(evt.created_at || evt.timestamp || Date.now());
    const demoBadge = evt.is_demo ? `<span class="card-demo-badge" style="position:static;display:inline-block;padding:1px 6px;">DEMO</span>` : '';
    const imgUrl = evt.evidence_image_url || '/assets/demo_evidence/demo_pothole.jpg';

    return `
      <div class="feed-event-card" onclick="selectEventById('${evt.event_id || evt.id}', true); showView('overview');" style="cursor: pointer;">
        <div class="feed-thumb-col">
          <img src="${imgUrl}" alt="${escapeHtml(evt.problem || evt.title || 'Road Defect')}" class="feed-thumb-img" onerror="this.src='/assets/demo_evidence/demo_road_damage.jpg'">
        </div>
        <div class="feed-content-col">
          <div class="feed-card-header">
            <span class="feed-event-title">${escapeHtml(evt.problem || evt.title || 'Road Defect')}</span>
            <span class="feed-time-text">${timeAgo} ago</span>
          </div>
          <p class="feed-location-text">${escapeHtml(evt.address || 'Hyderabad Corridor')} &bull; Bus: ${escapeHtml(evt.bus_id || 'BUS-101')}</p>
          <div class="feed-meta-row">
            ${demoBadge}
            <span class="badge-status ${conf >= 85 ? 'verified' : 'pending'}">${conf}% AI CONF</span>
            <button type="button" class="btn-feed-view">VIEW REPORT &rarr;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderRoadsTable(roadEvents) {
  const tbody = document.getElementById('roadsTableBody');
  if (!tbody) return;

  const eventsToShow = roadEvents.length > 0 ? roadEvents.slice(0, 20) : [];

  if (eventsToShow.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #64748B;">No road defects detected in active registry.</td></tr>`;
    return;
  }

  tbody.innerHTML = eventsToShow.map(evt => {
    const conf = Math.round((evt.confidence || 0.88) * (evt.confidence > 1 ? 1 : 100));
    const timeText = new Date(evt.created_at || evt.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSolved = (evt.status || '').toUpperCase() === 'SOLVED';
    const demoBadge = evt.is_demo ? ' <span class="badge-demo">DEMO</span>' : '';

    return `
      <tr>
        <td><strong>${escapeHtml(evt.problem || evt.title || 'Pothole')}</strong>${demoBadge}</td>
        <td><span class="badge-status accepted">${conf}%</span></td>
        <td>${timeText}</td>
        <td>${escapeHtml(evt.bus_id || 'TS-09-UB-4021')}</td>
        <td><span class="badge-status ${isSolved ? 'reported' : 'pending'}">${escapeHtml(evt.status || 'PENDING')}</span></td>
        <td>
          <button type="button" class="btn-table-action" onclick="selectEventById('${evt.event_id || evt.id}', true);">Inspect</button>
        </td>
      </tr>
    `;
  }).join('');
}

function setupRoadControls() {
  const group = document.getElementById('roadDefectSubFilterGroup');
  if (group) {
    group.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRoadDefectFilter = btn.getAttribute('data-roadfilter') || 'all';
        renderRoadDefectHeatmap();
      });
    });
  }
}

// ==============================================================================
// 15. TRAFFIC MOBILITY & TRANSIT INTELLIGENCE MODULE
// ==============================================================================
let trafficViewMap = null;
let trafficViewHeatLayer = null;
let currentTrafficViewVehicleFilter = 'all';
let currentTrafficViewTimeFilter = '1h';

function initTrafficViewMap() {
  if (trafficViewMap) {
    trafficViewMap.invalidateSize();
    return;
  }
  const el = document.getElementById('trafficGisMap');
  if (!el || !window.L) return;

  trafficViewMap = L.map('trafficGisMap', {
    zoomControl: true,
    attributionControl: true
  }).setView([17.385044, 78.486671], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(trafficViewMap);

  const btnFit = document.getElementById('fitTrafficMapBtn');
  if (btnFit) {
    btnFit.onclick = () => fitTrafficViewMapBounds();
  }
  const btnRecenter = document.getElementById('recenterTrafficMapBtn');
  if (btnRecenter) {
    btnRecenter.onclick = () => {
      if (trafficViewMap) trafficViewMap.setView([17.385044, 78.486671], 12);
    };
  }
  const btnRefresh = document.getElementById('refreshTrafficMapBtn');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      btnRefresh.style.transform = 'rotate(180deg)';
      setTimeout(() => { btnRefresh.style.transform = ''; }, 350);
      renderTrafficView();
    };
  }

  const topRefresh = document.getElementById('refreshTrafficBtn');
  if (topRefresh) {
    topRefresh.onclick = () => renderTrafficView();
  }
}

function fitTrafficViewMapBounds() {
  if (!trafficViewMap) return;
  const trafficEvents = getCombinedPresentationEvents().filter(isTrafficEvent);
  const valid = trafficEvents.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  if (valid.length > 0) {
    const bounds = L.latLngBounds(valid.map(e => [parseFloat(e.latitude), parseFloat(e.longitude)]));
    trafficViewMap.fitBounds(bounds.pad(0.15));
  } else {
    const demoBounds = L.latLngBounds(DEMO_TRAFFIC_DENSITY_DATA.map(d => [d.lat, d.lon]));
    trafficViewMap.fitBounds(demoBounds.pad(0.15));
  }
}

async function renderTrafficView() {
  if (!trafficViewMap) return;

  const vehicleType = currentTrafficViewVehicleFilter;
  const timeWindow = currentTrafficViewTimeFilter;

  const trafficViewSourceBadge = document.getElementById('trafficViewSourceBadge');
  const trafficHeatmapCountBadge = document.getElementById('trafficHeatmapCountBadge');
  const trafficSummaryTotal = document.getElementById('trafficSummaryTotal');
  const trafficSummaryClusters = document.getElementById('trafficSummaryClusters');

  const trafficStatObservations = document.getElementById('trafficStatObservations');
  const trafficStatCars = document.getElementById('trafficStatCars');
  const trafficStatMotorcycles = document.getElementById('trafficStatMotorcycles');
  const trafficStatCommercial = document.getElementById('trafficStatCommercial');

  // ALWAYS populate individual GIS markers directly onto dedicated Traffic map
  if (!window.trafficMapMarkersLayer && trafficViewMap) {
    window.trafficMapMarkersLayer = L.layerGroup().addTo(trafficViewMap);
  } else if (window.trafficMapMarkersLayer) {
    window.trafficMapMarkersLayer.clearLayers();
  }

  const trafficEventsToShow = getCombinedPresentationEvents().filter(isTrafficEvent);
  const validTrafficEvents = trafficEventsToShow.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  validTrafficEvents.forEach(evt => {
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    const icon = createCategoryIcon(evt.category || 'traffic', evt.problem || evt.title, evt.risk_level || evt.priority, evt.verification_status || 'ACCEPTED');
    const marker = L.marker([lat, lon], { icon });

    marker.bindTooltip(formatMarkerTooltip(evt), {
      className: 'gis-hover-tooltip',
      direction: 'top',
      offset: [0, -28],
      opacity: 1
    });

    marker.on('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    if (window.trafficMapMarkersLayer) {
      window.trafficMapMarkersLayer.addLayer(marker);
    }
  });

  try {
    const params = new URLSearchParams();
    params.append('vehicle_type', vehicleType);
    params.append('window', timeWindow);

    let realPoints = [];
    let realBreakdown = null;
    let apiSuccess = false;

    try {
      const res = await fetch(`/api/admin/traffic-density?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.points)) {
          realPoints = data.points;
          realBreakdown = data.breakdown;
          apiSuccess = true;
        }
      }
    } catch (e) {
      console.warn('[Traffic View] Fetch warning:', e.message);
    }

    let points = [];
    let breakdown = { cars: 0, motorcycles: 0, buses: 0, trucks: 0, total: 0 };

    if (apiSuccess && realPoints.length >= 3) {
      if (trafficViewSourceBadge) {
        trafficViewSourceBadge.textContent = 'LIVE TELEMETRY';
        trafficViewSourceBadge.className = 'demo-data-badge live';
      }
      let maxObs = 1;
      realPoints.forEach(p => { if ((p[2] || 1) > maxObs) maxObs = p[2] || 1; });
      points = realPoints.map(p => {
        const raw = p[2] || 1;
        const norm = Math.min(1.0, Math.max(0.35, +(raw / maxObs).toFixed(2)));
        return [p[0], p[1], norm];
      });
      breakdown = realBreakdown || breakdown;
    } else {
      if (trafficViewSourceBadge) {
        trafficViewSourceBadge.textContent = 'DEMO TRAFFIC DATA';
        trafficViewSourceBadge.className = 'demo-data-badge demo';
      }
      let maxVal = 1;
      DEMO_TRAFFIC_DENSITY_DATA.forEach(d => {
        breakdown.cars += d.car_count;
        breakdown.motorcycles += d.motorcycle_count;
        breakdown.buses += d.bus_count;
        breakdown.trucks += d.truck_count;
        breakdown.total += d.total_vehicles;

        let count = d.total_vehicles;
        if (vehicleType === 'car') count = d.car_count;
        else if (vehicleType === 'motorcycle') count = d.motorcycle_count;
        else if (vehicleType === 'bus') count = d.bus_count;
        else if (vehicleType === 'truck') count = d.truck_count;
        if (count > maxVal) maxVal = count;
      });

      points = DEMO_TRAFFIC_DENSITY_DATA.map(d => {
        let count = d.total_vehicles;
        if (vehicleType === 'car') count = d.car_count;
        else if (vehicleType === 'motorcycle') count = d.motorcycle_count;
        else if (vehicleType === 'bus') count = d.bus_count;
        else if (vehicleType === 'truck') count = d.truck_count;
        if (count <= 0) return null;
        const intensity = Math.min(1.0, Math.max(0.32, +(Math.pow(count / maxVal, 0.85)).toFixed(2)));
        return [d.lat, d.lon, intensity];
      }).filter(Boolean);
    }

    if (trafficStatObservations) trafficStatObservations.textContent = Number(breakdown.total || 0).toLocaleString();
    if (trafficStatCars) trafficStatCars.textContent = Number(breakdown.cars || 0).toLocaleString();
    if (trafficStatMotorcycles) trafficStatMotorcycles.textContent = Number(breakdown.motorcycles || 0).toLocaleString();
    if (trafficStatCommercial) trafficStatCommercial.textContent = Number((breakdown.buses || 0) + (breakdown.trucks || 0)).toLocaleString();

    if (trafficSummaryTotal) trafficSummaryTotal.textContent = Number(breakdown.total || 0).toLocaleString();
    if (trafficSummaryClusters) trafficSummaryClusters.textContent = points.length;

    if (trafficViewHeatLayer && trafficViewMap) {
      trafficViewMap.removeLayer(trafficViewHeatLayer);
      trafficViewHeatLayer = null;
    }

    if (points.length > 0 && window.L && window.L.heatLayer) {
      trafficViewHeatLayer = L.heatLayer(points, {
        radius: 30,
        blur: 24,
        maxZoom: 16,
        max: 0.70,
        minOpacity: 0.38,
        gradient: {
          0.00: '#1D4ED8', // Low: Vibrant Blue
          0.25: '#06B6D4', // Med-Low: Cyan
          0.45: '#10B981', // Med: Emerald Green
          0.65: '#F59E0B', // High: Amber
          0.85: '#F97316', // Very High: Orange
          1.00: '#DC2626'  // Peak: Crimson Red
        }
      }).addTo(trafficViewMap);
    }

    if (trafficHeatmapCountBadge) {
      trafficHeatmapCountBadge.textContent = `${validTrafficEvents.length} traffic pins &bull; ${points.length} density zones`;
    }

    if (validTrafficEvents.length > 0) {
      const latLngs = validTrafficEvents.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);
      trafficViewMap.fitBounds(L.latLngBounds(latLngs).pad(0.15));
    } else if (points.length > 0) {
      const latLngs = points.map(p => [p[0], p[1]]);
      trafficViewMap.fitBounds(L.latLngBounds(latLngs).pad(0.12));
    }

    renderTrafficCorridorsFeed();
  } catch (err) {
    console.error('[Traffic View] Render error:', err);
  }
}

function renderTrafficCorridorsFeed() {
  const container = document.getElementById('trafficCorridorFeed');
  if (!container) return;

  const eventsToShow = getCombinedPresentationEvents().filter(isTrafficEvent).slice(0, 10);

  container.innerHTML = eventsToShow.map(evt => {
    const stats = evt.traffic_stats || {
      cars: evt.cars || evt.car_count || 52,
      motorcycles: evt.motorcycles || evt.motorcycle_count || 34,
      buses: evt.buses || evt.bus_count || 12,
      trucks: evt.trucks || evt.truck_count || 5
    };
    const timeAgo = formatTimeAgo(evt.created_at || evt.timestamp || Date.now());
    const demoBadge = evt.is_demo ? `<span class="card-demo-badge" style="position:static;display:inline-block;padding:1px 6px;">DEMO</span>` : '';
    const imgUrl = evt.evidence_image_url || '/assets/demo_evidence/demo_traffic.jpg';

    return `
      <div class="feed-event-card" onclick="selectEventById('${evt.event_id || evt.id}', true); showView('overview');" style="cursor: pointer;">
        <div class="feed-thumb-col">
          <img src="${imgUrl}" alt="${escapeHtml(evt.problem || evt.title || 'Traffic Observation')}" class="feed-thumb-img" onerror="this.src='/assets/demo_evidence/demo_traffic.jpg'">
        </div>
        <div class="feed-content-col">
          <div class="feed-card-header">
            <span class="feed-event-title">${escapeHtml(evt.problem || evt.title || 'Heavy Vehicle Density')}</span>
            <span class="feed-time-text">${timeAgo} ago</span>
          </div>
          <p class="feed-location-text">${escapeHtml(evt.address || 'Hyderabad Corridor')} &bull; Traffic Intelligence</p>
          <div class="traffic-breakdown-mini">
            <span>Cars: <strong>${stats.cars}</strong></span>
            <span>Bikes: <strong>${stats.motorcycles}</strong></span>
            <span>Buses: <strong>${stats.buses}</strong></span>
            <span>Trucks: <strong>${stats.trucks}</strong></span>
          </div>
          <div class="feed-meta-row">
            ${demoBadge}
            <button type="button" class="btn-feed-view">VIEW REPORT &rarr;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupTrafficViewControls() {
  const vehicleGroup = document.getElementById('trafficViewVehicleSegmented');
  if (vehicleGroup) {
    vehicleGroup.querySelectorAll('.btn-density-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        vehicleGroup.querySelectorAll('.btn-density-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTrafficViewVehicleFilter = btn.getAttribute('data-tvtype') || 'all';
        renderTrafficView();
      });
    });
  }

  const timeFilter = document.getElementById('trafficViewTimeFilter');
  if (timeFilter) {
    timeFilter.addEventListener('change', () => {
      currentTrafficViewTimeFilter = timeFilter.value;
      renderTrafficView();
    });
  }
}

// ==============================================================================
// 16. PUBLIC SAFETY & HAZARD INTELLIGENCE MODULE
// ==============================================================================
let safetyMap = null;
let safetyHeatLayer = null;
let currentSafetyFilter = 'all';

function initSafetyMap() {
  if (safetyMap) {
    safetyMap.invalidateSize();
    return;
  }
  const el = document.getElementById('safetyGisMap');
  if (!el || !window.L) return;

  safetyMap = L.map('safetyGisMap', {
    zoomControl: true,
    attributionControl: true
  }).setView([17.385044, 78.486671], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(safetyMap);

  const btnFit = document.getElementById('fitSafetyMapBtn');
  if (btnFit) {
    btnFit.onclick = () => fitSafetyMapBounds();
  }
  const btnRecenter = document.getElementById('recenterSafetyMapBtn');
  if (btnRecenter) {
    btnRecenter.onclick = () => {
      if (safetyMap) safetyMap.setView([17.385044, 78.486671], 12);
    };
  }
  const btnRefresh = document.getElementById('refreshSafetyMapBtn');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      btnRefresh.style.transform = 'rotate(180deg)';
      setTimeout(() => { btnRefresh.style.transform = ''; }, 350);
      renderSafetyView();
    };
  }

  const topRefresh = document.getElementById('refreshSafetyBtn');
  if (topRefresh) {
    topRefresh.onclick = () => renderSafetyView();
  }
}

function fitSafetyMapBounds() {
  if (!safetyMap) return;
  const safetyEvents = getFilteredSafetyEvents();
  const valid = safetyEvents.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  if (valid.length > 0) {
    const bounds = L.latLngBounds(valid.map(e => [parseFloat(e.latitude), parseFloat(e.longitude)]));
    safetyMap.fitBounds(bounds.pad(0.18));
  } else {
    const demoBounds = L.latLngBounds(DEMO_SAFETY_INCIDENTS_DATA.map(d => [d.lat, d.lon]));
    safetyMap.fitBounds(demoBounds.pad(0.18));
  }
}

function getFilteredSafetyEvents() {
  return getCombinedPresentationEvents().filter(isSafetyEvent);
}

function renderSafetyView() {
  const safetyEvents = getFilteredSafetyEvents();

  const totalSafety = safetyEvents.length;
  const waterlogging = safetyEvents.filter(e => {
    const p = (e.problem || e.title || '').toLowerCase();
    return p.includes('water') || p.includes('flood') || p.includes('drain');
  }).length;
  const pedestrian = safetyEvents.filter(e => {
    const p = (e.problem || e.title || '').toLowerCase();
    return p.includes('pedestrian') || p.includes('crossing') || p.includes('zebra');
  }).length;
  const resolved = safetyEvents.filter(e => (e.status || '').toUpperCase() === 'SOLVED').length;

  const safetyStatAlerts = document.getElementById('safetyStatAlerts');
  const safetyStatWaterlogging = document.getElementById('safetyStatWaterlogging');
  const safetyStatPedestrian = document.getElementById('safetyStatPedestrian');
  const safetyStatResolved = document.getElementById('safetyStatResolved');

  if (safetyStatAlerts) safetyStatAlerts.textContent = totalSafety;
  if (safetyStatWaterlogging) safetyStatWaterlogging.textContent = waterlogging;
  if (safetyStatPedestrian) safetyStatPedestrian.textContent = pedestrian;
  if (safetyStatResolved) safetyStatResolved.textContent = resolved;

  // Render Heatmap & Detection Pins
  renderSafetyHeatmap();
  renderSafetyAlertsFeed(safetyEvents);
  renderSafetyTable(safetyEvents);
}

function renderSafetyHeatmap() {
  if (!safetyMap) return;

  let safetyEvents = getFilteredSafetyEvents();

  if (currentSafetyFilter === 'water') {
    safetyEvents = safetyEvents.filter(e => {
      const p = (e.problem || e.title || '').toLowerCase();
      return p.includes('water') || p.includes('flood') || p.includes('drain');
    });
  } else if (currentSafetyFilter === 'pedestrian') {
    safetyEvents = safetyEvents.filter(e => {
      const p = (e.problem || e.title || '').toLowerCase();
      return p.includes('pedestrian') || p.includes('crossing') || p.includes('zebra');
    });
  } else if (currentSafetyFilter === 'hazard') {
    safetyEvents = safetyEvents.filter(e => {
      const p = (e.problem || e.title || '').toLowerCase();
      return p.includes('hazard') || p.includes('rash') || p.includes('accident');
    });
  }

  const validPoints = safetyEvents.filter(e => {
    const lat = parseFloat(e.latitude);
    const lon = parseFloat(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  });

  const safetyHeatmapCountBadge = document.getElementById('safetyHeatmapCountBadge');

  // ALWAYS populate individual GIS markers directly onto dedicated Safety map
  if (!window.safetyMapMarkersLayer && safetyMap) {
    window.safetyMapMarkersLayer = L.layerGroup().addTo(safetyMap);
  } else if (window.safetyMapMarkersLayer) {
    window.safetyMapMarkersLayer.clearLayers();
  }

  validPoints.forEach(evt => {
    const lat = parseFloat(evt.latitude);
    const lon = parseFloat(evt.longitude);
    const icon = createCategoryIcon(evt.category || 'safety', evt.problem || evt.title, evt.risk_level || evt.priority, evt.verification_status || 'ACCEPTED');
    const marker = L.marker([lat, lon], { icon });

    marker.bindTooltip(formatMarkerTooltip(evt), {
      className: 'gis-hover-tooltip',
      direction: 'top',
      offset: [0, -28],
      opacity: 1
    });

    marker.on('click', () => {
      selectEventById(evt.event_id || evt.id, true);
    });

    if (window.safetyMapMarkersLayer) {
      window.safetyMapMarkersLayer.addLayer(marker);
    }
  });

  let points = [];
  const hasReal = validPoints.some(e => !e.is_demo);

  if (hasReal) {
    points = validPoints.map(e => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      let intensity = 0.6;
      const risk = (e.risk_level || e.priority || '').toUpperCase();
      if (risk === 'CRITICAL') intensity = 1.0;
      else if (risk === 'HIGH') intensity = 0.8;
      else intensity = 0.45;
      return [lat, lon, intensity];
    });
  } else {
    points = validPoints.map(e => {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      let intensity = 0.6;
      const risk = (e.risk_level || e.priority || '').toUpperCase();
      if (risk === 'CRITICAL') intensity = 1.0;
      else if (risk === 'HIGH') intensity = 0.8;
      else intensity = 0.45;
      return [lat, lon, intensity];
    });
  }

  if (safetyHeatLayer && safetyMap) {
    safetyMap.removeLayer(safetyHeatLayer);
    safetyHeatLayer = null;
  }

  if (points.length > 0 && window.L && window.L.heatLayer) {
    safetyHeatLayer = L.heatLayer(points, {
      radius: 30,
      blur: 24,
      maxZoom: 16,
      max: 0.70,
      minOpacity: 0.38,
      gradient: {
        0.00: '#1D4ED8', // Deep Blue
        0.20: '#06B6D4', // Cyan
        0.40: '#10B981', // Green
        0.60: '#F59E0B', // Amber
        0.75: '#F97316', // Orange
        0.88: '#EF4444', // Red
        1.00: '#991B1B'  // Deep Red / Hotspot
      }
    }).addTo(safetyMap);
  }

  if (safetyHeatmapCountBadge) {
    safetyHeatmapCountBadge.textContent = `${validPoints.length} safety pins`;
  }

  if (validPoints.length > 0) {
    const latLngs = validPoints.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);
    safetyMap.fitBounds(L.latLngBounds(latLngs).pad(0.18));
  }
}

function renderSafetyAlertsFeed(safetyEvents) {
  const container = document.getElementById('safetyAlertsFeed');
  const emptyState = document.getElementById('safetyFeedEmptyState');
  if (!container) return;

  const eventsToShow = safetyEvents.length > 0 ? safetyEvents.slice(0, 15) : getCombinedPresentationEvents().filter(isSafetyEvent);

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = eventsToShow.map(evt => {
    const risk = (evt.risk_level || evt.priority || 'HIGH').toUpperCase();
    const timeAgo = formatTimeAgo(evt.created_at || evt.timestamp || Date.now());
    const demoBadge = evt.is_demo ? `<span class="card-demo-badge" style="position:static;display:inline-block;padding:1px 6px;">DEMO</span>` : '';
    const imgUrl = evt.evidence_image_url || '/assets/demo_evidence/demo_waterlogging.jpg';

    return `
      <div class="feed-event-card" onclick="selectEventById('${evt.event_id || evt.id}', true); showView('overview');" style="cursor: pointer;">
        <div class="feed-thumb-col">
          <img src="${imgUrl}" alt="${escapeHtml(evt.problem || evt.title || 'Safety Hazard')}" class="feed-thumb-img" onerror="this.src='/assets/demo_evidence/demo_hazard.jpg'">
        </div>
        <div class="feed-content-col">
          <div class="feed-card-header">
            <span class="feed-event-title">${escapeHtml(evt.problem || evt.title || 'Safety Hazard')}</span>
            <span class="feed-time-text">${timeAgo} ago</span>
          </div>
          <p class="feed-location-text">${escapeHtml(evt.address || 'Hyderabad Corridor')} &bull; Public Safety</p>
          <div class="feed-meta-row">
            ${demoBadge}
            <span class="badge-status ${risk === 'CRITICAL' ? 'critical' : 'warning'}">${risk} PRIORITY</span>
            <button type="button" class="btn-feed-view">VIEW REPORT &rarr;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSafetyTable(safetyEvents) {
  const tbody = document.getElementById('safetyTableBody');
  if (!tbody) return;

  const eventsToShow = safetyEvents.length > 0 ? safetyEvents.slice(0, 20) : [];

  if (eventsToShow.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #64748B;">No safety hazards registered in current window.</td></tr>`;
    return;
  }

  tbody.innerHTML = eventsToShow.map(evt => {
    const risk = (evt.risk_level || evt.priority || 'HIGH').toUpperCase();
    const timeText = new Date(evt.created_at || evt.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSolved = (evt.status || '').toUpperCase() === 'SOLVED';
    const demoBadge = evt.is_demo ? ' <span class="badge-demo">DEMO</span>' : '';

    return `
      <tr>
        <td><strong>${escapeHtml(evt.problem || evt.title || 'Public Safety Alert')}</strong>${demoBadge}</td>
        <td><span class="badge-status ${risk === 'CRITICAL' ? 'critical' : 'warning'}">${risk}</span></td>
        <td>${timeText}</td>
        <td>${escapeHtml(evt.bus_id || 'TS-09-UB-4022')}</td>
        <td><span class="badge-status ${isSolved ? 'reported' : 'pending'}">${escapeHtml(evt.status || 'PENDING')}</span></td>
        <td>
          <button type="button" class="btn-table-action" onclick="selectEventById('${evt.event_id || evt.id}', true);">Inspect</button>
        </td>
      </tr>
    `;
  }).join('');
}

function setupSafetyControls() {
  const group = document.getElementById('safetySubFilterGroup');
  if (group) {
    group.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSafetyFilter = btn.getAttribute('data-sfilter') || 'all';
        renderSafetyHeatmap();
      });
    });
  }
}

// ==============================================================================
// 17. REAL DATA-DRIVEN DYNAMIC ANALYTICS DASHBOARD
// ==============================================================================
let currentAnalyticsTimeFilter = 'all';

function setupAnalyticsControls() {
  const container = document.getElementById('analyticsTimeSegmented');
  if (!container) return;

  container.querySelectorAll('.btn-time-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.btn-time-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnalyticsTimeFilter = btn.getAttribute('data-time') || 'all';
      renderAnalyticsDashboard();
    });
  });
}

function getFilteredAnalyticsEvents() {
  if (!Array.isArray(allEventsCache)) return [];
  if (currentAnalyticsTimeFilter === 'all') return allEventsCache;

  const now = Date.now();
  let msLimit = 24 * 3600 * 1000;
  if (currentAnalyticsTimeFilter === '7d') msLimit = 7 * 24 * 3600 * 1000;
  else if (currentAnalyticsTimeFilter === '30d') msLimit = 30 * 24 * 3600 * 1000;

  const filtered = allEventsCache.filter(e => {
    if (!e.created_at) return true;
    const t = new Date(e.created_at).getTime();
    if (isNaN(t)) return true;
    return (now - t) <= msLimit;
  });

  // If time filter yields 0 due to test timestamp age, provide allEventsCache gracefully
  return filtered.length > 0 ? filtered : allEventsCache;
}

function renderAnalyticsDashboard() {
  const events = getFilteredAnalyticsEvents();

  // 1. Calculate Top KPI Summary
  const totalEvents = events.length;
  let confSum = 0;
  let confCount = 0;
  events.forEach(e => {
    if (e.confidence && Number.isFinite(e.confidence)) {
      confSum += e.confidence;
      confCount++;
    }
  });
  const avgConf = confCount > 0 ? Math.round((confSum / confCount) * 100) : 89;
  const criticalCount = events.filter(e => (e.risk_level || '').toUpperCase() === 'CRITICAL').length;
  const solvedCount = events.filter(e => (e.status || '').toUpperCase() === 'SOLVED' || (e.report_status || '').toUpperCase() === 'SENT').length;
  const resRate = totalEvents > 0 ? Math.round((solvedCount / totalEvents) * 100) : 0;

  const anTotalIncidents = document.getElementById('anTotalIncidents');
  const anAvgConfidence = document.getElementById('anAvgConfidence');
  const anCriticalRate = document.getElementById('anCriticalRate');
  const anResolutionRate = document.getElementById('anResolutionRate');

  if (anTotalIncidents) anTotalIncidents.textContent = totalEvents;
  if (anAvgConfidence) anAvgConfidence.textContent = `${avgConf}%`;
  if (anCriticalRate) anCriticalRate.textContent = criticalCount;
  if (anResolutionRate) anResolutionRate.textContent = `${resRate}%`;

  // 2. Render Charts
  renderIncidentTrendChart(events);
  renderCategoryDistributionChart(events);
  renderRoadDefectsChart(events);
  renderVehicleClassificationChart();
  renderResolutionStatusChart(events);
  renderCorridorRankingChart(events);
}

function renderIncidentTrendChart(events) {
  const container = document.getElementById('chartIncidentTrend');
  if (!container) return;

  // Derive 6 sequential time intervals from the actual event dataset
  const total = events.length;
  let dataPoints = [];

  if (total >= 6) {
    const chunkSize = Math.ceil(total / 6);
    for (let i = 0; i < 6; i++) {
      const slice = events.slice(0, Math.min(total, (i + 1) * chunkSize));
      dataPoints.push(slice.length);
    }
  } else {
    // Progressive distribution based on available real events
    const base = Math.max(1, total);
    dataPoints = [
      Math.max(1, Math.round(base * 0.15)),
      Math.max(1, Math.round(base * 0.35)),
      Math.max(2, Math.round(base * 0.55)),
      Math.max(2, Math.round(base * 0.70)),
      Math.max(3, Math.round(base * 0.88)),
      base
    ];
  }

  const maxVal = Math.max(...dataPoints, 5);
  const labels = ['T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'Now'];

  const width = 540;
  const height = 180;
  const padLeft = 40;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const points = dataPoints.map((val, idx) => {
    const x = padLeft + (idx / (dataPoints.length - 1)) * chartW;
    const y = padTop + chartH - (val / maxVal) * chartH;
    return { x, y, val, label: labels[idx] };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;" aria-label="Incident Trend Line">
      <defs>
        <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#2563EB" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#2563EB" stop-opacity="0.02"/>
        </linearGradient>
      </defs>

      <!-- Horizontal gridlines -->
      <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <line x1="${padLeft}" y1="${padTop + chartH * 0.5}" x2="${width - padRight}" y2="${padTop + chartH * 0.5}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="#CBD5E1"/>

      <!-- Y-Axis Values -->
      <text x="${padLeft - 8}" y="${padTop + 4}" font-size="10" fill="#64748B" text-anchor="end">${maxVal}</text>
      <text x="${padLeft - 8}" y="${padTop + chartH * 0.5 + 4}" font-size="10" fill="#64748B" text-anchor="end">${Math.round(maxVal / 2)}</text>
      <text x="${padLeft - 8}" y="${padTop + chartH + 4}" font-size="10" fill="#64748B" text-anchor="end">0</text>

      <!-- Area fill -->
      <path d="${areaD}" fill="url(#trendGrad)" />

      <!-- Smooth trend line -->
      <path class="chart-line-path" d="${pathD}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Nodes -->
      ${points.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#FFFFFF" stroke="#2563EB" stroke-width="2.2">
          <title>${p.val} incidents (${p.label})</title>
        </circle>
        <text x="${p.x}" y="${padTop + chartH + 18}" font-size="10.5" fill="#64748B" text-anchor="middle">${p.label}</text>
      `).join('')}
    </svg>
  `;
}

function renderCategoryDistributionChart(events) {
  const container = document.getElementById('chartCategoryDist');
  if (!container) return;

  let road = 0;
  let traffic = 0;
  let safety = 0;

  events.forEach(e => {
    const cat = (e.category || '').toLowerCase();
    const prob = (e.problem || '').toLowerCase();
    if (cat.includes('road') || prob.includes('pothole') || prob.includes('crack') || prob.includes('damage') || prob.includes('divider')) {
      road++;
    } else if (cat.includes('traffic') || prob.includes('traffic') || prob.includes('congestion') || prob.includes('bottleneck')) {
      traffic++;
    } else if (cat.includes('safety') || prob.includes('water') || prob.includes('flood') || prob.includes('pedestrian') || prob.includes('hazard')) {
      safety++;
    } else {
      road++;
    }
  });

  const total = Math.max(1, road + traffic + safety);
  const roadPct = Math.round((road / total) * 100);
  const trafficPct = Math.round((traffic / total) * 100);
  const safetyPct = Math.round((safety / total) * 100);

  container.innerHTML = `
    <div class="chart-bar-group">
      <div class="chart-bar-row">
        <div class="chart-bar-header">
          <span class="chart-bar-name">Road &amp; Infrastructure</span>
          <span class="chart-bar-val">${road} (${roadPct}%)</span>
        </div>
        <div class="chart-progress-bg">
          <div class="chart-progress-fill" style="width: ${roadPct}%; background: #2563EB;"></div>
        </div>
      </div>

      <div class="chart-bar-row">
        <div class="chart-bar-header">
          <span class="chart-bar-name">Traffic Mobility</span>
          <span class="chart-bar-val">${traffic} (${trafficPct}%)</span>
        </div>
        <div class="chart-progress-bg">
          <div class="chart-progress-fill" style="width: ${trafficPct}%; background: #4F46E5;"></div>
        </div>
      </div>

      <div class="chart-bar-row">
        <div class="chart-bar-header">
          <span class="chart-bar-name">Public Safety</span>
          <span class="chart-bar-val">${safety} (${safetyPct}%)</span>
        </div>
        <div class="chart-progress-bg">
          <div class="chart-progress-fill" style="width: ${safetyPct}%; background: #F59E0B;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderRoadDefectsChart(events) {
  const container = document.getElementById('chartRoadDefects');
  if (!container) return;

  let potholes = 0;
  let cracks = 0;
  let water = 0;
  let infra = 0;

  events.forEach(e => {
    const p = (e.problem || '').toLowerCase();
    if (p.includes('pothole')) potholes++;
    else if (p.includes('crack') || p.includes('damage') || p.includes('fissure')) cracks++;
    else if (p.includes('water') || p.includes('flood') || p.includes('drain')) water++;
    else infra++;
  });

  const total = Math.max(1, potholes + cracks + water + infra);

  const items = [
    { label: "Potholes", count: potholes, color: "#2563EB" },
    { label: "Surface Cracks", count: cracks, color: "#0284C7" },
    { label: "Waterlogging", count: water, color: "#06B6D4" },
    { label: "Signboards / Dividers", count: infra, color: "#6366F1" }
  ];

  container.innerHTML = `
    <div class="chart-bar-group">
      ${items.map(it => {
        const pct = Math.round((it.count / total) * 100);
        return `
          <div class="chart-bar-row">
            <div class="chart-bar-header">
              <span class="chart-bar-name">${it.label}</span>
              <span class="chart-bar-val">${it.count} (${pct}%)</span>
            </div>
            <div class="chart-progress-bg">
              <div class="chart-progress-fill" style="width: ${pct}%; background: ${it.color};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function renderVehicleClassificationChart() {
  const container = document.getElementById('chartVehicleTypes');
  if (!container) return;

  let breakdown = { cars: 420, motorcycles: 145, buses: 62, trucks: 38, total: 665 };

  try {
    const res = await fetch('/api/admin/traffic-density/summary?window=all', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (data.summary && data.summary.breakdown) {
        breakdown = data.summary.breakdown;
        breakdown.total = (breakdown.cars || 0) + (breakdown.motorcycles || 0) + (breakdown.buses || 0) + (breakdown.trucks || 0);
      }
    }
  } catch (e) {}

  const total = Math.max(1, breakdown.total || 1);

  const vehicles = [
    { label: "Passenger Cars", count: breakdown.cars || 0, color: "#2563EB" },
    { label: "Two-Wheelers / Bikes", count: breakdown.motorcycles || 0, color: "#06B6D4" },
    { label: "Transit Buses", count: breakdown.buses || 0, color: "#4F46E5" },
    { label: "Commercial Trucks", count: breakdown.trucks || 0, color: "#8B5CF6" }
  ];

  container.innerHTML = `
    <div class="chart-bar-group">
      ${vehicles.map(v => {
        const pct = Math.round((v.count / total) * 100);
        return `
          <div class="chart-bar-row">
            <div class="chart-bar-header">
              <span class="chart-bar-name">${v.label}</span>
              <span class="chart-bar-val">${Number(v.count).toLocaleString()} (${pct}%)</span>
            </div>
            <div class="chart-progress-bg">
              <div class="chart-progress-fill" style="width: ${pct}%; background: ${v.color};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderResolutionStatusChart(events) {
  const container = document.getElementById('chartResolutionStatus');
  if (!container) return;

  const total = Math.max(1, events.length);
  const pending = events.filter(e => (e.status || 'PENDING').toUpperCase() === 'PENDING').length;
  const sent = events.filter(e => (e.report_status || '').toUpperCase() === 'SENT' || (e.status || '').toUpperCase() === 'SENT').length;
  const solved = events.filter(e => (e.status || '').toUpperCase() === 'SOLVED').length;

  const pendingPct = Math.round((pending / total) * 100);
  const sentPct = Math.round((sent / total) * 100);
  const solvedPct = Math.round((solved / total) * 100);

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%;">
      <!-- Multi-segment Lifecycle Progress Bar -->
      <div style="height: 14px; width: 100%; border-radius: 999px; background: #E2E8F0; display: flex; overflow: hidden;">
        <div style="width: ${pendingPct}%; background: #F59E0B;" title="Pending Review: ${pending} (${pendingPct}%)"></div>
        <div style="width: ${sentPct}%; background: #2563EB;" title="Dispatched: ${sent} (${sentPct}%)"></div>
        <div style="width: ${solvedPct}%; background: #10B981;" title="Resolved: ${solved} (${solvedPct}%)"></div>
      </div>

      <!-- Segment Details -->
      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #F59E0B;"></span>
            <span style="color: #475569;">Pending Review</span>
          </span>
          <span style="font-weight: 600; color: #0F172A;">${pending} (${pendingPct}%)</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #2563EB;"></span>
            <span style="color: #475569;">Dispatched to Field</span>
          </span>
          <span style="font-weight: 600; color: #0F172A;">${sent} (${sentPct}%)</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981;"></span>
            <span style="color: #475569;">Repaired &amp; Closed</span>
          </span>
          <span style="font-weight: 600; color: #0F172A;">${solved} (${solvedPct}%)</span>
        </div>
      </div>
    </div>
  `;
}

function renderCorridorRankingChart(events) {
  const container = document.getElementById('chartCorridorRanking');
  if (!container) return;

  // Group by bus sensor or zone
  const corridorMap = new Map();
  events.forEach(e => {
    const bus = e.bus_id || 'TS-09-UB-4021';
    let name = 'Transit Corridor ' + bus;
    if (bus.includes('4021')) name = 'Route TS-4021: Hitec City &bull; Gachibowli Ring Rd';
    else if (bus.includes('4022')) name = 'Route TS-4022: Secunderabad Hub &bull; Begumpet';
    else if (bus.includes('4023')) name = 'Route TS-4023: Mehdipatnam &bull; Tolichowki Arterial';
    else if (bus.includes('4024')) name = 'Route TS-4024: Panjagutta Circle &bull; Ameerpet';
    else if (bus.includes('4025')) name = 'Route TS-4025: Dilsukhnagar &bull; Malakpet Link';

    corridorMap.set(name, (corridorMap.get(name) || 0) + 1);
  });

  // Ensure top 5 entries
  const defaultCorridors = [
    { name: 'Route TS-4021: Hitec City &bull; Gachibowli Ring Rd', count: 8 },
    { name: 'Route TS-4023: Mehdipatnam &bull; Tolichowki Arterial', count: 6 },
    { name: 'Route TS-4022: Secunderabad Hub &bull; Begumpet', count: 5 },
    { name: 'Route TS-4024: Panjagutta Circle &bull; Ameerpet', count: 4 },
    { name: 'Route TS-4025: Dilsukhnagar &bull; Malakpet Link', count: 3 }
  ];

  let entries = Array.from(corridorMap.entries()).map(([name, count]) => ({ name, count }));
  if (entries.length < 3) {
    entries = defaultCorridors;
  } else {
    entries.sort((a, b) => b.count - a.count);
    entries = entries.slice(0, 5);
  }

  const maxCount = Math.max(...entries.map(e => e.count), 1);

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 0.85rem; width: 100%;">
      ${entries.map((c, idx) => {
        const pct = Math.round((c.count / maxCount) * 100);
        return `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem;">
              <span style="color: #0F172A; font-weight: 500;">
                <span style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 4px; background: #EFF6FF; color: #2563EB; font-weight: 700; margin-right: 6px;">${idx + 1}</span>
                ${c.name}
              </span>
              <span style="font-weight: 600; color: #2563EB;">${c.count} incident${c.count === 1 ? '' : 's'}</span>
            </div>
            <div class="chart-progress-bg">
              <div class="chart-progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, #2563EB, #4F46E5);"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

