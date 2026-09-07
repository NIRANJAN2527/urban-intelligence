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

CREATE INDEX IF NOT EXISTS idx_pothole_events_session ON pothole_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pothole_events_bus ON pothole_events(bus_id);
CREATE INDEX IF NOT EXISTS idx_pothole_events_created ON pothole_events(created_at);

-- ==============================================================================
-- Migration statements if tables already exist:
-- ==============================================================================
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';
ALTER TABLE bus_sessions ADD COLUMN IF NOT EXISTS video_filename TEXT;
ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'LIVE';

