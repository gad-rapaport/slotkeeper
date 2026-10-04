-- Slotkeeper schema. The double-booking guarantee lives in reservations_no_overlap below.

CREATE EXTENSION IF NOT EXISTS citext;
-- btree_gist lets the exclusion constraint combine "same resource" (=) with "overlapping period" (&&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE resource_kind AS ENUM ('room', 'desk', 'equipment');
CREATE TYPE reservation_kind AS ENUM ('booking', 'maintenance');
CREATE TYPE reservation_status AS ENUM ('active', 'cancelled');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  full_name     text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
  role          user_role NOT NULL,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash    bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE sites (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name     text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 80),
  -- IANA zone; every wall-clock rule (opening hours, day boundaries) is evaluated in this zone.
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 3 AND 64)
);

-- Opening hours in the site's local wall-clock time. ISO weekday: 1 = Monday ... 7 = Sunday.
CREATE TABLE opening_hours (
  site_id uuid NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens   time NOT NULL,
  closes  time NOT NULL,
  PRIMARY KEY (site_id, weekday),
  CHECK (opens < closes)
);

CREATE TABLE resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites (id) ON DELETE RESTRICT,
  kind         resource_kind NOT NULL,
  name         text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description  text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  capacity     smallint CHECK (capacity IS NULL OR capacity > 0),
  slot_minutes smallint NOT NULL DEFAULT 15 CHECK (slot_minutes IN (5, 10, 15, 30, 60)),
  min_minutes  smallint NOT NULL DEFAULT 15,
  max_minutes  smallint NOT NULL DEFAULT 240,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (site_id, name),
  CHECK (min_minutes >= slot_minutes AND min_minutes <= max_minutes AND max_minutes <= 1440)
);
CREATE INDEX resources_site_kind_idx ON resources (site_id, kind) WHERE is_active;

-- Bookings and maintenance blocks share one table so that one constraint keeps them apart from each other.
CREATE TABLE reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
  kind         reservation_kind NOT NULL,
  status       reservation_status NOT NULL DEFAULT 'active',
  -- Half-open interval [start, end): a booking ending at 10:00 does not overlap one starting at 10:00.
  period       tstzrange NOT NULL CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period)),
  title        text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  user_id      uuid REFERENCES users (id) ON DELETE RESTRICT,
  created_by   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK ((kind = 'booking') = (user_id IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  -- The core guarantee: no two active reservations of the same resource overlap, whatever the application
  -- does and however many requests race. Cancelled rows are ignored, so a freed slot can be rebooked.
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (resource_id WITH =, period WITH &&)
    WHERE (status = 'active')
);
-- "My bookings" and per-user limits.
CREATE INDEX reservations_user_period_idx ON reservations (user_id, lower(period)) WHERE status = 'active';
-- Availability reads by resource and time use the GiST index created by the exclusion constraint.

-- Responses of successful creates, keyed per user, so a retried POST returns the original result.
CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key             text NOT NULL CHECK (length(key) BETWEEN 8 AND 100),
  request_sha256  text NOT NULL,
  response_status smallint NOT NULL,
  response_body   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

CREATE TABLE activity_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations (id) ON DELETE SET NULL,
  action         text NOT NULL,
  summary        text NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_actor_idx ON activity_log (actor_id, id DESC);
CREATE INDEX activity_log_reservation_idx ON activity_log (reservation_id, id DESC);
