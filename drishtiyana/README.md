# DRISHTIYANA - Mobile Sensing & Edge Monitoring System (SIH 2026)

## Features & Modes:
- **Mode 1 (LIVE BUS SENSOR)**: Real-time phone camera streaming via WebRTC, continuous mobile GPS tracking (`watchPosition`), synchronized UTC ISO-8601 timestamps, live Leaflet GIS map tracking, and Supabase cloud persistence.
- **Mode 2 (UPLOAD FILES)**: Prerecorded road video (`.mp4`, `.avi`, `.mov`, `.webm`) and timestamped GPS (`.json`, `.csv`) file upload, GPS parsing and batch persistence to Supabase (`source_type: 'UPLOAD'`), nearest-neighbor timestamp correlation engine (`getGpsForVideoTimestamp`), and synchronized video playback with real-time GIS map route tracing.

---

## Project Structure

```
drishtiyana/
│
├── schema.sql              # Supabase SQL for bus_sessions and gps_locations
│
├── sample_data/
│   ├── pothole_test_01.json # Sample GPS JSON file with realistic coordinates
│   └── pothole_test_01.csv  # Sample GPS CSV file with matching format
│
├── server/
│   ├── .env.example        # Supabase environment variables template
│   ├── .env                # Local configuration (never committed to git)
│   ├── package.json        # Express, Socket.IO, Multer, @supabase/supabase-js, dotenv
│   ├── server.js           # Signaling, REST APIs, Multer file upload & session manager
│   ├── supabase.js         # Safe backend Supabase client module
│   ├── test-signaling.js   # Automated WebRTC test suite
│   ├── test-gps-pipeline.js# Automated Live GPS & timestamp test suite
│   ├── test-upload-pipeline.js # Automated File Upload & timestamp matcher test suite
│   └── uploads/            # Temporary server-side video storage (excluded from git)
│
├── public/
│   ├── mobile.html         # Phone Bus Sensing Unit UI (Mode 1)
│   ├── mobile.js           # Camera capture, GPS watchPosition, and session sync
│   ├── viewer.html         # Laptop Edge Monitor Station UI (Mode 1 & Mode 2)
│   ├── viewer.js           # WebRTC receiver, Upload player, GIS Map, and timestamp matcher
│   └── style.css           # High-tech dark-mode dashboard styling
│
└── README.md
```

---

## Supabase Database Setup

### 1. SQL Schema & Migration
In your **Supabase Dashboard &rarr; SQL Editor**, execute:

```sql
-- 1. Table: bus_sessions
CREATE TABLE IF NOT EXISTS bus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    bus_id TEXT NOT NULL,
    source_type TEXT DEFAULT 'LIVE', -- 'LIVE' or 'UPLOAD'
    video_filename TEXT,
    video_started_at TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    session_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_session_id ON bus_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_bus_id ON bus_sessions(bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_source_type ON bus_sessions(source_type);

-- 2. Table: gps_locations
CREATE TABLE IF NOT EXISTS gps_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    source_type TEXT DEFAULT 'LIVE', -- 'LIVE' or 'UPLOAD'
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    gps_timestamp TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gps_locations_session_id ON gps_locations(session_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_bus_id ON gps_locations(bus_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_gps_timestamp ON gps_locations(gps_timestamp);
CREATE INDEX IF NOT EXISTS idx_gps_locations_source_type ON gps_locations(source_type);

-- Migration for existing tables:
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS video_filename TEXT;
ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';

-- 3. Table: pothole_events (Edge AI Evidence)
CREATE TABLE IF NOT EXISTS pothole_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    bus_id TEXT NOT NULL,
    camera_id TEXT DEFAULT 'CAM-01',
    frame_id INTEGER,
    video_timestamp TIMESTAMPTZ,
    processing_timestamp TIMESTAMPTZ DEFAULT NOW(),
    confidence DOUBLE PRECISION NOT NULL,
    class_name TEXT DEFAULT 'Pothole',
    bbox_x1 INTEGER,
    bbox_y1 INTEGER,
    bbox_x2 INTEGER,
    bbox_y2 INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    gps_timestamp TIMESTAMPTZ,
    gps_accuracy DOUBLE PRECISION,
    timestamp_difference_ms INTEGER,
    gps_match_status TEXT,
    evidence_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## How to Run the Project

### 1. Start Node.js Server
```powershell
cd drishtiyana/server
npm start
```

### 2. Start Python Edge AI Service
```powershell
cd drishtiyana/edge_ai
python edge_service.py
```

Open in your laptop browser:
👉 **`http://localhost:3000/viewer`**

---

## Testing Mode 1: Live Bus Sensor & Edge AI Processing

1. On laptop, ensure **`[ 🟢 LIVE BUS SENSOR ]`** is selected.
2. On phone (same Wi-Fi), open `https://<YOUR_LAPTOP_IP>:3001/mobile` and tap **"START BUS SENSOR"**.
3. Live camera and real-time GPS update on the laptop monitor and GIS map.
4. On laptop monitor, click **`[ ⚡ START EDGE PROCESSING ]`**:
   - The live video stream continues smoothly at full 30 FPS without stutter or interruption.
   - Offscreen canvas captures frames at 5 FPS and sends them to the Python Edge AI service.
   - Preprocessing applies automatic brightness correction, CLAHE, and sharpening.
   - Pretrained YOLOv8 (`best.pt`) detects road potholes and filters with confidence $\ge 0.80$.
   - Redis retains the best-scoring candidate within a 30-second TTL window.
   - The detected frame's video timestamp is correlated with nearest GPS telemetry ($\le 2000\text{ ms}$).
   - The verified evidence frame and structured event are dispatched to the backend and displayed in the **Latest Edge Event Evidence** panel!
5. Click **`[ ⏹ STOP EDGE PROCESSING ]`**:
   - AI processing halts immediately while live WebRTC video and GPS tracking continue running uninterrupted.

---

## Testing Mode 2: File Upload (Prerecorded Video + GPS)

1. On laptop (`http://localhost:3000/viewer`), click **`[ 📁 UPLOAD FILES ]`**.
2. **Choose Video File**: Select any `.mp4`, `.avi`, `.mov`, or `.webm` video file.
3. **Choose GPS File**: Select `drishtiyana/sample_data/pothole_test_01.json` or `drishtiyana/sample_data/pothole_test_01.csv`.
4. The status will update to **`Status: READY FOR PROCESSING`**.
5. Click **"UPLOAD & START PROCESSING"**.
6. Watch the progress bar advance through upload, validation, and Supabase storage.
7. Once loaded, the playback dashboard appears:
   - Play or scrub the video timeline.
   - Observe **`VIDEO TIME`** and **`GPS TIME`** updating in sync.
   - The bus marker moves along the route on the Leaflet GIS map synchronously with the video playback!
   - Telemetry cards display current **`LATITUDE`**, **`LONGITUDE`**, **`SPEED`**, and **`SYNC DELTA`**.
