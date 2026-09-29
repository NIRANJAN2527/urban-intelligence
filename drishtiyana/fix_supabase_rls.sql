-- ==============================================================================
-- DRISHTIYANA - Supabase Row Level Security (RLS) Permission Fix
-- Run this script in: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- PURPOSE:
-- Fixes error: 42501 "new row violates row-level security policy for table 'events'"
-- Allows the Supabase Publishable Key (role: 'anon') to INSERT, SELECT, and UPDATE
-- finalized detection events, work orders, and telemetry data.
-- ==============================================================================

-- 1. Table: events (PRIMARY PERMANENT EVENT STORAGE)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on events" ON events;
CREATE POLICY "Allow anon all on events" ON events
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. Table: work_orders (PERSISTENT WORK ORDERS PIPELINE)
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on work_orders" ON work_orders;
CREATE POLICY "Allow anon all on work_orders" ON work_orders
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Table: pothole_events (LEGACY COMPATIBILITY TABLE)
ALTER TABLE pothole_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on pothole_events" ON pothole_events;
CREATE POLICY "Allow anon all on pothole_events" ON pothole_events
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Table: department_reports (DISPATCH LOG)
ALTER TABLE department_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on department_reports" ON department_reports;
CREATE POLICY "Allow anon all on department_reports" ON department_reports
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Table: bus_sessions (BUS SENSING SESSIONS)
ALTER TABLE bus_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on bus_sessions" ON bus_sessions;
CREATE POLICY "Allow anon all on bus_sessions" ON bus_sessions
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 6. Table: gps_locations (GPS TELEMETRY POINTS)
ALTER TABLE gps_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on gps_locations" ON gps_locations;
CREATE POLICY "Allow anon all on gps_locations" ON gps_locations
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Explicitly notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
