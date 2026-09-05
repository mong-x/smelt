import type { HarnessInstallContext, HarnessProfile } from './profile.ts';
import { instructionSnippet } from './snippet.ts';

/**
 * KiloCode — ADVISORY tier. Instructions only, and honest about it.
 *
 * No first-class hook API (Kilo-Org/kilocode#5827), so nothing here is enforced: what
 * ships is a rules file this harness owns whole — the shared snippet plus the two
 * manual enforcement legs the snippet has no room for. `remove` deletes it.
 */
function kilocodeRulesSource(ctx: HarnessInstallContext): string {
  return `${instructionSnippet(ctx.thresholdBytes, ctx.budgetBytes, ctx.writtenBy)}
<!-- smelt:hooks v1 advisory notes -->

KiloCode has no first-class hook API (Kilo-Org/kilocode#5827), so nothing above is
enforced — it is advisory. Two manual legs make it harder to bypass:

1. Permissions: in your KiloCode per-tool permission config, set raw-read/execute
   tools to "ask" so oversized reads surface for review instead of passing silently.
2. MCP: expose smelt through an MCP server and prefer its tools; a resident server
   also keeps smelt's grammar cache warm across calls.
`;
}

export const kilocode: HarnessProfile = {
  id: 'kilocode',
  name: 'KiloCode',
  tier: 'advisory',
  detect: ['.kilocode'],
  detectHome: ['.config/kilo'],
  instructionFile: '.kilocode/rules/smelt.md',
  instructions: kilocodeRulesSource,
  caveats: [
    'no first-class hooks (Kilo-Org/kilocode#5827): enforcement is permissions config + MCP, both manual',
  ],
  install: [],
};
