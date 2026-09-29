-- Spatial search support for disaster_events.
--
-- `cube` provides the geometric types; `earthdistance` builds on it to offer
-- correct spherical (great-circle) distance and index-accelerated radius search
-- on plain latitude/longitude columns. This avoids a PostGIS dependency while
-- still getting real distance math and a usable GiST index.
--
-- Both extensions are optional at runtime: the application checks for their
-- availability and falls back to in-memory distance filtering when they are
-- missing, so this migration must not be treated as a hard requirement.
CREATE EXTENSION IF NOT EXISTS cube;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS earthdistance;--> statement-breakpoint
CREATE INDEX "disaster_events_earth_idx" ON "disaster_events" USING gist (ll_to_earth("latitude", "longitude"));
