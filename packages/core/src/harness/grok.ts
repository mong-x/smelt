import type { HarnessHookSchema } from '../hooks/shim.ts';

import type { ShimmedHarnessProfile } from './profile.ts';

/**
 * Grok CLI — EXPERIMENTAL tier. Schema, install and removal, end to end.
 *
 * Schema mapped from the capability matrix
 * (docs/research/2026-09-02-harness-capability-matrix.md, Grok CLI row; primary source
 * <https://docs.x.ai/build/features/hooks>), not yet smoke-tested against the real
 * binary. Note the matrix's provenance warning: the official CLI is
 * `xai-org/grok-build` (binary `grok`) — `superagent-ai/grok-cli` is a third-party
 * clone with a different hook surface.
 *
 *  - event: `PreToolUse`; stdin `{ tool_name, tool_input }` (Claude-Code-like tool
 *    names).
 *  - deny: `{ "decision": "deny", "reason": … }` or exit 2. **Deny-only**: the input
 *    is read-only to hooks, so there is no `rewrite` here — under
 *    `hooks.enforcement: "rewrite"` this harness falls back to the deny, whose reason
 *    still carries the exact replacement pipeline.
 */
const HOOKS: HarnessHookSchema = {
  readTools: ['Read', 'read_file', 'ReadFile'],
  bashTools: ['Bash', 'shell', 'run_shell_command'],
  toolNameKeys: ['tool_name'],
  toolInputKeys: ['tool_input'],
  deny: (reason) => ({ decision: 'deny', reason }),
};

export const grok: ShimmedHarnessProfile = {
  id: 'grok',
  name: 'Grok CLI',
  shortName: 'Grok',
  tier: 'experimental',
  detect: ['.grok'],
  detectHome: ['.grok'],
  instructionFile: 'AGENTS.md',
  instructions: 'snippet',
  caveats: [
    'deny-only hooks: input rewrite is not supported, so rewrite mode falls back to deny',
    'MCP registration is manual for Grok (TOML) — packages/mcp/README.md has the snippet; setup does not edit TOML',
  ],
  hooks: HOOKS,
  install: [
    {
      kind: 'json-hooks',
      file: '.grok/hooks.json',
      event: 'PreToolUse',
      matchers: ['Read', 'Bash'],
      entry: 'command-list',
      lifecycle: false,
    },
  ],
};
