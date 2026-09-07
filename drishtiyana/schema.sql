-- ==============================================================================
-- DRISHTIYANA - Supabase PostgreSQL Schema
-- Tables: bus_sessions and gps_locations
-- Supports: LIVE Mode and UPLOAD Mode
-- ==============================================================================

-- 1. Table: bus_sessions
-- Tracks each bus sensing run (Live or Uploaded File)
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

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_bus_sessions_session_id ON bus_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_bus_id ON bus_sessions(bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_source_type ON bus_sessions(source_type);

-- 2. Table: gps_locations
-- Stores high-frequency GPS telemetry collected from mobile phone or uploaded files
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

-- Indexes for rapid temporal and spatial correlation with video timestamps
CREATE INDEX IF NOT EXISTS idx_gps_locations_session_id ON gps_locations(session_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_bus_id ON gps_locations(bus_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_gps_timestamp ON gps_locations(gps_timestamp);
CREATE INDEX IF NOT EXISTS idx_gps_locations_source_type ON gps_locations(source_type);

-- ==============================================================================
-- 3. Table: pothole_events
-- Stores verified Edge AI pothole detections with correlated GPS & evidence image URL
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pothole_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    status TEXT DEFAULT 'NEW',
    category TEXT DEFAULT 'Road & Infrastructure',
    department TEXT DEFAULT 'ROAD MAINTENANCE',
    report_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    report_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pothole_events_session ON pothole_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pothole_events_bus ON pothole_events(bus_id);
CREATE INDEX IF NOT EXISTS idx_pothole_events_created ON pothole_events(created_at);
CREATE INDEX IF NOT EXISTS idx_pothole_events_risk_level ON pothole_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_pothole_events_priority ON pothole_events(priority);
CREATE INDEX IF NOT EXISTS idx_pothole_events_status ON pothole_events(status);
CREATE INDEX IF NOT EXISTS idx_pothole_events_category ON pothole_events(category);
CREATE INDEX IF NOT EXISTS idx_pothole_events_department ON pothole_events(department);
CREATE INDEX IF NOT EXISTS idx_pothole_events_report_status ON pothole_events(report_status);

-- ==============================================================================
-- 4. Table: department_reports
-- Stores structured GIS incident reports dispatched to municipal departments
-- ==============================================================================
CREATE TABLE IF NOT EXISTS department_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    status TEXT DEFAULT 'SENT', -- 'SENT', 'PENDING', 'FAILED'
    report_payload JSONB,
    dispatched_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_department_reports_event_id ON department_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_department_reports_department ON department_reports(department);
CREATE INDEX IF NOT EXISTS idx_department_reports_status ON department_reports(status);

-- ==============================================================================
-- Migration statements if tables already exist:
-- ==============================================================================
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS video_filename TEXT;
ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS candidate_id TEXT;
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS observation_count INTEGER DEFAULT 1;
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS risk_score INTEGER;
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'NEW';
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Road & Infrastructure';
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ROAD MAINTENANCE';
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'PENDING';
ALTER TABLE pothole_events ADD COLUMN IF NOT EXISTS report_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pothole_events_risk_level ON pothole_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_pothole_events_priority ON pothole_events(priority);
CREATE INDEX IF NOT EXISTS idx_pothole_events_status ON pothole_events(status);
CREATE INDEX IF NOT EXISTS idx_pothole_events_category ON pothole_events(category);
CREATE INDEX IF NOT EXISTS idx_pothole_events_department ON pothole_events(department);
CREATE INDEX IF NOT EXISTS idx_pothole_events_report_status ON pothole_events(report_status);

