-- ==============================================================================
-- DRISHTIYANA - Supabase Permanent Database Schema
-- Tables: events, work_orders, pothole_events, department_reports, bus_sessions, gps_locations
-- Compatible with: LIVE Mode, UPLOAD Mode, and Admin Command Center
-- ==============================================================================

-- 1. Table: events (PRIMARY PERMANENT EVENT STORAGE TABLE)
-- Stores all finalized detection events from DrishtiYana sensing network
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT DEFAULT 'POTHOLE',
    category TEXT DEFAULT 'Road & Infrastructure',
    confidence DOUBLE PRECISION NOT NULL,
    bus_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    priority TEXT DEFAULT 'MEDIUM',
    risk_score INTEGER DEFAULT 50,
    department TEXT DEFAULT 'ROAD MAINTENANCE',
    status TEXT DEFAULT 'PENDING', -- PENDING -> SENT -> SOLVED
    evidence_image TEXT,
    evidence_reference TEXT,
    evidence_image_url TEXT,
    candidate_id TEXT,
    observation_count INTEGER DEFAULT 1,
    risk_level TEXT DEFAULT 'MEDIUM',
    session_id TEXT,
    camera_id TEXT DEFAULT 'CAM-01',
    frame_id INTEGER,
    video_timestamp TIMESTAMPTZ,
    processing_timestamp TIMESTAMPTZ DEFAULT NOW(),
    class_name TEXT DEFAULT 'Pothole',
    bbox_x1 INTEGER,
    bbox_y1 INTEGER,
    bbox_x2 INTEGER,
    bbox_y2 INTEGER,
    gps_timestamp TIMESTAMPTZ,
    gps_accuracy DOUBLE PRECISION,
    timestamp_difference_ms INTEGER,
    gps_match_status TEXT,
    report_status TEXT DEFAULT 'PENDING', -- PENDING, SENT
    report_id TEXT,
    work_order_id TEXT,
    video_source TEXT,
    source_type TEXT DEFAULT 'LIVE',
    verification_status TEXT DEFAULT 'ACCEPTED',
    verification_method TEXT DEFAULT 'AUTO_ACCEPTED',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_department ON events(department);
CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);
CREATE INDEX IF NOT EXISTS idx_events_risk_level ON events(risk_level);
CREATE INDEX IF NOT EXISTS idx_events_bus_id ON events(bus_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- 2. Table: work_orders (PERSISTENT WORK ORDERS PIPELINE)
CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    work_order_id TEXT UNIQUE NOT NULL,
    event_id TEXT NOT NULL,
    department TEXT NOT NULL,
    category TEXT NOT NULL,
    problem_type TEXT NOT NULL,
    priority TEXT DEFAULT 'MEDIUM',
    risk_level TEXT DEFAULT 'MEDIUM',
    risk_score INTEGER DEFAULT 50,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    evidence_image TEXT,
    status TEXT DEFAULT 'SENT', -- PENDING, SENT, SOLVED
    notes TEXT,
    dispatched_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_work_order_id ON work_orders(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_event_id ON work_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_department ON work_orders(department);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);

-- 3. Table: pothole_events (BACKWARD COMPATIBILITY WITH EXISTING PIPELINE)
CREATE TABLE IF NOT EXISTS pothole_events (
    id TEXT PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    candidate_id TEXT,
    observation_count INTEGER DEFAULT 1,
    risk_score INTEGER,
    risk_level TEXT,
    priority TEXT,
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
    status TEXT DEFAULT 'PENDING',
    category TEXT DEFAULT 'Road & Infrastructure',
    department TEXT DEFAULT 'ROAD MAINTENANCE',
    report_status TEXT DEFAULT 'PENDING',
    report_id TEXT,
    work_order_id TEXT,
    verification_status TEXT DEFAULT 'ACCEPTED',
    verification_method TEXT DEFAULT 'AUTO_ACCEPTED',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pothole_events_event_id ON pothole_events(event_id);
CREATE INDEX IF NOT EXISTS idx_pothole_events_status ON pothole_events(status);
CREATE INDEX IF NOT EXISTS idx_pothole_events_category ON pothole_events(category);
CREATE INDEX IF NOT EXISTS idx_pothole_events_department ON pothole_events(department);

-- 4. Table: department_reports (HISTORICAL DISPATCH LOG)
CREATE TABLE IF NOT EXISTS department_reports (
    id TEXT PRIMARY KEY,
    report_id TEXT UNIQUE NOT NULL,
    event_id TEXT NOT NULL,
    department TEXT NOT NULL,
    category TEXT NOT NULL,
    problem_type TEXT NOT NULL,
    priority TEXT,
    risk_level TEXT,
    risk_score INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    evidence_image_url TEXT,
    status TEXT DEFAULT 'SENT', -- SENT, PENDING, SOLVED
    report_payload JSONB,
    dispatched_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_department_reports_report_id ON department_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_department_reports_event_id ON department_reports(event_id);

-- 5. Table: bus_sessions
CREATE TABLE IF NOT EXISTS bus_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    bus_id TEXT NOT NULL,
    source_type TEXT DEFAULT 'LIVE',
    video_filename TEXT,
    video_started_at TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    session_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bus_sessions_session_id ON bus_sessions(session_id);

-- 6. Table: gps_locations
CREATE TABLE IF NOT EXISTS gps_locations (
    id TEXT PRIMARY KEY,
    bus_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    source_type TEXT DEFAULT 'LIVE',
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

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE PUBLISHABLE / ANON KEY
-- Ensures the Supabase publishable key (anon role) can INSERT, SELECT, and UPDATE
-- ==============================================================================

-- 1. events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on events" ON events;
CREATE POLICY "Allow anon all on events" ON events
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 2. work_orders
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on work_orders" ON work_orders;
CREATE POLICY "Allow anon all on work_orders" ON work_orders
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 3. pothole_events
ALTER TABLE pothole_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on pothole_events" ON pothole_events;
CREATE POLICY "Allow anon all on pothole_events" ON pothole_events
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 4. department_reports
ALTER TABLE department_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on department_reports" ON department_reports;
CREATE POLICY "Allow anon all on department_reports" ON department_reports
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 5. bus_sessions
ALTER TABLE bus_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on bus_sessions" ON bus_sessions;
CREATE POLICY "Allow anon all on bus_sessions" ON bus_sessions
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- 6. gps_locations
ALTER TABLE gps_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on gps_locations" ON gps_locations;
CREATE POLICY "Allow anon all on gps_locations" ON gps_locations
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
