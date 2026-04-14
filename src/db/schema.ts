import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'

// Enums shared by hosted Fluct. Kept identical so a future import/export
// path to the hosted version doesn't need schema translation.
export const edgeTypeEnum = pgEnum('edge_type', ['bezier', 'straight'])
export const featureEdgeTypeEnum = pgEnum('feature_edge_type', [
  'page_to_feature',
  'feature_to_sub',
])

// ── AI context shape ────────────────────────────────────────────────────────
// Stored as jsonb on every node table. Written by MCP during bootstrap/sync,
// read by the side panel's read-only AI context tab and by AI agents during
// queries. All fields optional so partial fills are valid.
export type AiContext = {
  sourceFiles?: string[]
  testFiles?: string[]
  stateTouches?: string[]
  runtimeContext?: string[]
  ioContract?: {
    inputs?: string
    outputs?: string
    sideEffects?: string[]
  }
}

// ── Maps ────────────────────────────────────────────────────────────────────
// OSS single-user model: no orgId, no share links, no MCP lock concurrency.
// Users can still have multiple maps (one per project).
export const maps = pgTable('maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  githubRepoOwner: text('github_repo_owner'),
  githubRepoName: text('github_repo_name'),
  version: integer('version').notNull().default(0),
  versionLabel: text('version_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Nodes ───────────────────────────────────────────────────────────────────

export const productNodes = pgTable(
  'product_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    positionX: integer('position_x').notNull().default(0),
    positionY: integer('position_y').notNull().default(0),
    color: text('color'),
    order: integer('order').notNull().default(0),
    role: text('role'),
    description: text('description'),
    status: text('status').notNull().default('planning'),
    aiContext: jsonb('ai_context').$type<AiContext>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_product_nodes_map_id').on(t.mapId)]
)

export const pageNodes = pgTable(
  'page_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    productNodeId: uuid('product_node_id').references(() => productNodes.id, {
      onDelete: 'cascade',
    }),
    parentPageId: uuid('parent_page_id'),
    kind: text('kind').notNull().default('page'),
    name: text('name').notNull(),
    positionX: integer('position_x').notNull().default(0),
    positionY: integer('position_y').notNull().default(0),
    color: text('color'),
    width: integer('width').default(260),
    order: integer('order').notNull().default(0),
    identifier: text('identifier'),
    description: text('description'),
    screenshotUrl: text('screenshot_url'),
    status: text('status').notNull().default('planning'),
    aiContext: jsonb('ai_context').$type<AiContext>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_page_nodes_map_id').on(t.mapId)]
)

export const functionNodes = pgTable(
  'function_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageNodeId: uuid('page_node_id').references(() => pageNodes.id, { onDelete: 'cascade' }),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull().default('page'),
    parentFunctionId: uuid('parent_function_id'),
    name: text('name').notNull(),
    policy: text('policy'),
    positionX: integer('position_x'),
    positionY: integer('position_y'),
    order: integer('order').notNull().default(0),
    identifier: text('identifier'),
    settings: text('settings'),
    screenshotUrl: text('screenshot_url'),
    kind: text('kind').notNull().default('function'),
    endpoint: text('endpoint'),
    status: text('status').notNull().default('planning'),
    aiContext: jsonb('ai_context').$type<AiContext>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_function_nodes_page_node_id').on(t.pageNodeId),
    index('idx_function_nodes_map_id_scope').on(t.mapId, t.scope),
  ]
)

// ── Edges ───────────────────────────────────────────────────────────────────

export const productNodeEdges = pgTable(
  'product_node_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    sourceProductId: uuid('source_product_id')
      .notNull()
      .references(() => productNodes.id, { onDelete: 'cascade' }),
    targetProductId: uuid('target_product_id')
      .notNull()
      .references(() => productNodes.id, { onDelete: 'cascade' }),
    description: text('description'),
    masterId: uuid('master_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_product_node_edges_map_id').on(t.mapId)]
)

export const pageNodeEdges = pgTable(
  'page_node_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => pageNodes.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => pageNodes.id, { onDelete: 'cascade' }),
    description: text('description'),
    masterId: uuid('master_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_page_node_edges_map_id').on(t.mapId)]
)

export const functionEdges = pgTable(
  'function_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    sourceFunctionId: uuid('source_function_id')
      .notNull()
      .references(() => functionNodes.id, { onDelete: 'cascade' }),
    targetFunctionId: uuid('target_function_id')
      .notNull()
      .references(() => functionNodes.id, { onDelete: 'cascade' }),
    description: text('description'),
    masterId: uuid('master_id'),
    edgeType: edgeTypeEnum('edge_type').notNull().default('bezier'),
    animated: boolean('animated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_function_edges_map_id').on(t.mapId)]
)

export const pageFeatureEdges = pgTable(
  'page_feature_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => pageNodes.id, { onDelete: 'cascade' }),
    targetFunctionId: uuid('target_function_id')
      .notNull()
      .references(() => functionNodes.id, { onDelete: 'cascade' }),
    description: text('description'),
    masterId: uuid('master_id'),
    edgeType: edgeTypeEnum('edge_type').notNull().default('bezier'),
    animated: boolean('animated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_page_feature_edges_map_id').on(t.mapId),
    index('idx_page_feature_edges_target').on(t.targetFunctionId),
  ]
)

export const productPageMemberships = pgTable('product_page_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  mapId: uuid('map_id')
    .notNull()
    .references(() => maps.id, { onDelete: 'cascade' }),
  productNodeId: uuid('product_node_id')
    .notNull()
    .references(() => productNodes.id, { onDelete: 'cascade' }),
  pageNodeId: uuid('page_node_id')
    .notNull()
    .references(() => pageNodes.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Scenarios ───────────────────────────────────────────────────────────────

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#3b82f6'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_scenarios_map_id').on(t.mapId)]
)

export const scenarioSteps = pgTable(
  'scenario_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id'),
    nodeType: text('node_type'),
    order: integer('order').notNull(),
    description: text('description'),
    trigger: text('trigger'),
    isAnchor: boolean('is_anchor').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_scenario_steps_scenario_id').on(t.scenarioId)]
)

export const scenarioConnections = pgTable(
  'scenario_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    fromScenarioId: uuid('from_scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    fromStepId: uuid('from_step_id')
      .notNull()
      .references(() => scenarioSteps.id, { onDelete: 'cascade' }),
    toScenarioId: uuid('to_scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    toStepId: uuid('to_step_id'),
    condition: text('condition'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_scenario_connections_map').on(t.mapId),
    index('idx_scenario_connections_from').on(t.fromScenarioId),
    index('idx_scenario_connections_to').on(t.toScenarioId),
  ]
)

// ── Permissions (single-user but still useful for feature gating notes) ────

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#6b7280'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_permissions_map_id').on(t.mapId)]
)

export const nodePermissions = pgTable(
  'node_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id').notNull(),
    nodeType: text('node_type').notNull(),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_node_permissions_permission_id').on(t.permissionId),
    index('idx_node_permissions_node').on(t.nodeId, t.nodeType),
  ]
)

// ── Comments (single-user: authorId kept as text for flexibility) ──────────

export const nodeComments = pgTable('node_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull(),
  mapId: uuid('map_id')
    .notNull()
    .references(() => maps.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().default('local'),
  content: text('content').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Map snapshots (version checkpoints) ─────────────────────────────────────

export const mapSnapshots = pgTable(
  'map_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    versionLabel: text('version_label'),
    graphJson: jsonb('graph_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_map_snapshots_map_version').on(t.mapId, t.version)]
)
