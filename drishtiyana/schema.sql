-- ==============================================================================
-- DRISHTIYANA - Feature 2 Supabase PostgreSQL Schema
-- Tables: bus_sessions and gps_locations
-- ==============================================================================

-- 1. Table: bus_sessions
-- Tracks each continuous mobile sensing run for a bus
CREATE TABLE IF NOT EXISTS bus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    bus_id TEXT NOT NULL,
    video_started_at TIMESTAMPTZ,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    session_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for session queries
CREATE INDEX IF NOT EXISTS idx_bus_sessions_session_id ON bus_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_bus_sessions_bus_id ON bus_sessions(bus_id);

-- 2. Table: gps_locations
-- Stores high-frequency GPS telemetry collected from the mobile sensing unit
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

-- Indexes for rapid temporal and spatial correlation with video timestamps
CREATE INDEX IF NOT EXISTS idx_gps_locations_session_id ON gps_locations(session_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_bus_id ON gps_locations(bus_id);
CREATE INDEX IF NOT EXISTS idx_gps_locations_gps_timestamp ON gps_locations(gps_timestamp);
