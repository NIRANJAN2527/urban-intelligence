# DRISHTIYANA - Mobile Sensing & Edge Monitoring System (SIH 2026)

## Features Implemented:
- **Feature 1**: Peer-to-peer live camera streaming from Mobile Phone to Laptop Edge Monitor via WebRTC over local Wi-Fi.
- **Feature 2**: Real-time high-precision GPS telemetry (`watchPosition`), synchronized UTC ISO-8601 timestamps correlating video and location, and Supabase PostgreSQL persistence.

---

## Project Structure

```
drishtiyana/
│
├── schema.sql              # Supabase SQL for bus_sessions and gps_locations
│
├── server/
│   ├── .env.example        # Supabase environment variables template
│   ├── .env                # Local configuration (never committed to git)
│   ├── package.json        # Express, Socket.IO, @supabase/supabase-js, dotenv
│   ├── server.js           # Signaling, GPS ingestion API, and session management
│   ├── supabase.js         # Safe backend Supabase client module
│   ├── test-signaling.js   # Automated WebRTC test suite
│   └── test-gps-pipeline.js# Automated GPS & timestamp test suite
│
├── public/
│   ├── mobile.html         # Phone Bus Sensing Unit UI
│   ├── mobile.js           # Camera capture, GPS watchPosition, and session sync
│   ├── viewer.html         # Laptop Edge Monitor Station UI
│   ├── viewer.js           # WebRTC receiver, GPS telemetry display, and clock ticker
│   └── style.css           # High-tech dark-mode dashboard styling
│
└── README.md
```

---

## Supabase Database Setup

### 1. Tables Required
1. `bus_sessions`
2. `gps_locations`

### 2. SQL to Run in Supabase SQL Editor
Open your **Supabase Dashboard &rarr; SQL Editor &rarr; New Query**, paste the contents of `schema.sql` (or the SQL below), and click **Run**:

```sql
-- 1. Table: bus_sessions
CREATE TABLE IF NOT EXISTS bus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    bus_id TEXT NOT NULL,
    video_started_at TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    session_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_session_id ON bus_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_bus_id ON bus_sessions(bus_id);

-- 2. Table: gps_locations
CREATE TABLE IF NOT EXISTS gps_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
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
```

### 3. Environment Variables (`.env`)
In `drishtiyana/server/.env`:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
```
> [!NOTE]
> Even if you haven't filled in `.env` yet, the system works immediately in local mode. The laptop viewer will display `GPS DB: LOCAL`, and the video and GPS will stream in real time. Once you add your `.env` values, the badge will switch to `GPS DB: SYNCED`.

---

## How to Run and Test

### 1. Start Server
```powershell
cd drishtiyana/server
npm start
```

### 2. Open Laptop Viewer
Go to:
```
http://localhost:3000/viewer
```

### 3. Open Mobile Phone
Connect your phone to the same Wi-Fi and open:
```
https://<YOUR_LAPTOP_IP>:3001/mobile
```
*(Example: `https://192.168.0.124:3001/mobile`)*
- Tap **"Advanced" &rarr; "Proceed to site (unsafe)"**.
- Tap **"START BUS SENSOR"**.
- Allow **Camera** and **Location** permissions.

### 4. Observe Synchronization on Laptop
- Live camera video appears in the monitor screen.
- Telemetry cards update in real-time with Latitude, Longitude, Accuracy, and Speed.
- **VIDEO TIME** and **GPS TIME** display synchronized UTC timestamps.
