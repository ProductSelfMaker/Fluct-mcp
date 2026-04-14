import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { buildBootstrapPrompt } from './prompts/bootstrap.ts'
import { buildSyncPrompt } from './prompts/sync.ts'

// Prompt registration — the two high-value MCP prompts that turn a
// fresh repo into a full map (bootstrap_from_repo) or reconcile an
// existing map against code drift (sync_from_repo). Copied verbatim
// from hosted Fluct; both are vendor-neutral and work against local
// filesystems or a GitHub repo via the WebFetch path.

export function registerPrompts(server: McpServer) {
  server.prompt(
    'bootstrap_from_repo',
    'Analyze a repository and build the Fluct service map from scratch: products, pages, features, dependencies, and AI-context metadata. Works with local filesystem or a remote GitHub repo.',
    {
      language: z
        .enum(['ko', 'en'])
        .optional()
        .describe(
          'Output language for description/policy fields. Default: ko. Identifier fields always stay in English/URL form.'
        ),
      scope: z
        .string()
        .optional()
        .describe(
          'Restrict analysis to a single subdirectory (e.g. "app/dashboard"). Useful for splitting large bootstraps.'
        ),
      dry_run: z
        .enum(['true', 'false'])
        .optional()
        .describe(
          'If "true", report a creation plan as markdown without calling any write tools. Default: "false".'
        ),
      github_repo: z
        .string()
        .optional()
        .describe(
          'GitHub repo in "owner/repo" format. When provided, the AI analyzes via GitHub API instead of local code.'
        ),
    },
    ({ language, scope, dry_run, github_repo }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildBootstrapPrompt({
              language: language ?? 'ko',
              scope: scope ?? undefined,
              dryRun: dry_run === 'true',
              githubRepo: github_repo ?? undefined,
            }),
          },
        },
      ],
    })
  )

  server.prompt(
    'sync_from_repo',
    'Re-scan a repository and produce an ADD/UPDATE/REMOVE diff against the existing Fluct service map, including AI-context field drift. Works with local filesystem or a remote GitHub repo.',
    {
      language: z
        .enum(['ko', 'en'])
        .optional()
        .describe('Output language for description fields on newly created / updated nodes.'),
      scope: z
        .string()
        .optional()
        .describe(
          'Restrict re-scanning to a single subdirectory. Nodes outside this scope are treated as out-of-sync-scope and left alone.'
        ),
      dry_run: z
        .enum(['true', 'false'])
        .optional()
        .describe(
          'If "true", print the diff plan only and skip approval — no writes. Default: "false".'
        ),
      github_repo: z
        .string()
        .optional()
        .describe(
          'GitHub repo in "owner/repo" format. When provided, the AI analyzes via GitHub API.'
        ),
    },
    ({ language, scope, dry_run, github_repo }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildSyncPrompt({
              language: language ?? 'ko',
              scope: scope ?? undefined,
              dryRun: dry_run === 'true',
              githubRepo: github_repo ?? undefined,
            }),
          },
        },
      ],
    })
  )
}
