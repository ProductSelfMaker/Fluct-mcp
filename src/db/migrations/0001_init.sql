-- Consolidated schema for Fluct-mcp OSS.
-- Combines the hosted project's migrations 0001–0048 into a single
-- idempotent init. Changes from the hosted schema are minimal: no
-- orgs/members/OAuth/projects (multi-user only), and comments use a
-- text authorId defaulting to "local" instead of a Supabase uuid.

-- PGlite ships with gen_random_uuid() built-in (pgcrypto). No extension needed.

DO $$ BEGIN
  CREATE TYPE edge_type AS ENUM ('bezier', 'straight');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE feature_edge_type AS ENUM ('page_to_feature', 'feature_to_sub');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Maps ──
CREATE TABLE IF NOT EXISTS maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  github_repo_owner text,
  github_repo_name text,
  version integer NOT NULL DEFAULT 0,
  version_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Nodes ──
CREATE TABLE IF NOT EXISTS product_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  color text,
  "order" integer NOT NULL DEFAULT 0,
  role text,
  description text,
  status text NOT NULL DEFAULT 'planning',
  ai_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_nodes_map_id ON product_nodes(map_id);

CREATE TABLE IF NOT EXISTS page_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  product_node_id uuid REFERENCES product_nodes(id) ON DELETE CASCADE,
  parent_page_id uuid,
  kind text NOT NULL DEFAULT 'page',
  name text NOT NULL,
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  color text,
  width integer DEFAULT 260,
  "order" integer NOT NULL DEFAULT 0,
  identifier text,
  description text,
  screenshot_url text,
  status text NOT NULL DEFAULT 'planning',
  ai_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_nodes_map_id ON page_nodes(map_id);

CREATE TABLE IF NOT EXISTS function_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_node_id uuid REFERENCES page_nodes(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'page',
  parent_function_id uuid,
  name text NOT NULL,
  policy text,
  position_x integer,
  position_y integer,
  "order" integer NOT NULL DEFAULT 0,
  identifier text,
  settings text,
  screenshot_url text,
  kind text NOT NULL DEFAULT 'function',
  endpoint text,
  status text NOT NULL DEFAULT 'planning',
  ai_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_function_nodes_page_node_id ON function_nodes(page_node_id);
CREATE INDEX IF NOT EXISTS idx_function_nodes_map_id_scope ON function_nodes(map_id, scope);

-- ── Edges ──
CREATE TABLE IF NOT EXISTS product_node_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_product_id uuid NOT NULL REFERENCES product_nodes(id) ON DELETE CASCADE,
  target_product_id uuid NOT NULL REFERENCES product_nodes(id) ON DELETE CASCADE,
  description text,
  master_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_node_edges_map_id ON product_node_edges(map_id);

CREATE TABLE IF NOT EXISTS page_node_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES page_nodes(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES page_nodes(id) ON DELETE CASCADE,
  description text,
  master_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_node_edges_map_id ON page_node_edges(map_id);

CREATE TABLE IF NOT EXISTS function_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_function_id uuid NOT NULL REFERENCES function_nodes(id) ON DELETE CASCADE,
  target_function_id uuid NOT NULL REFERENCES function_nodes(id) ON DELETE CASCADE,
  description text,
  master_id uuid,
  edge_type edge_type NOT NULL DEFAULT 'bezier',
  animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_function_edges_map_id ON function_edges(map_id);

CREATE TABLE IF NOT EXISTS page_feature_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_page_id uuid NOT NULL REFERENCES page_nodes(id) ON DELETE CASCADE,
  target_function_id uuid NOT NULL REFERENCES function_nodes(id) ON DELETE CASCADE,
  description text,
  master_id uuid,
  edge_type edge_type NOT NULL DEFAULT 'bezier',
  animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_page_id, target_function_id)
);
CREATE INDEX IF NOT EXISTS idx_page_feature_edges_map_id ON page_feature_edges(map_id);
CREATE INDEX IF NOT EXISTS idx_page_feature_edges_target ON page_feature_edges(target_function_id);

CREATE TABLE IF NOT EXISTS product_page_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  product_node_id uuid NOT NULL REFERENCES product_nodes(id) ON DELETE CASCADE,
  page_node_id uuid NOT NULL REFERENCES page_nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Scenarios ──
CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenarios_map_id ON scenarios(map_id);

CREATE TABLE IF NOT EXISTS scenario_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  node_id uuid,
  node_type text,
  "order" integer NOT NULL,
  description text,
  trigger text,
  is_anchor boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenario_steps_scenario_id ON scenario_steps(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_steps_is_anchor ON scenario_steps(is_anchor) WHERE is_anchor = true;

CREATE TABLE IF NOT EXISTS scenario_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  from_scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  from_step_id uuid NOT NULL REFERENCES scenario_steps(id) ON DELETE CASCADE,
  to_scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  to_step_id uuid,
  condition text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenario_connections_map ON scenario_connections(map_id);
CREATE INDEX IF NOT EXISTS idx_scenario_connections_from ON scenario_connections(from_scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_connections_to ON scenario_connections(to_scenario_id);

-- ── Permissions ──
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#6b7280',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permissions_map_id ON permissions(map_id);

CREATE TABLE IF NOT EXISTS node_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_node_permissions_permission_id ON node_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_node_permissions_node ON node_permissions(node_id, node_type);

-- ── Comments ──
CREATE TABLE IF NOT EXISTS node_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL,
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  author_id text NOT NULL DEFAULT 'local',
  content text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Snapshots ──
CREATE TABLE IF NOT EXISTS map_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  version integer NOT NULL,
  version_label text,
  graph_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_snapshots_map_version ON map_snapshots(map_id, version);
