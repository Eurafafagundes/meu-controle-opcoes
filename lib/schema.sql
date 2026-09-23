CREATE TABLE IF NOT EXISTS op_sessions(token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS op_login_limits(key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS op_records(id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('option','income','holding')), data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz);
CREATE TABLE IF NOT EXISTS op_audit(id bigserial PRIMARY KEY, record_id uuid NOT NULL, action text NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS op_requests(id uuid PRIMARY KEY, result jsonb NOT NULL);
