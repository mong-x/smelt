import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Guards import through @guard so the mutation runner can aim them at a broken copy
// of src. See scripts/mutate.mjs.
import { SETUP_RECIPE, SETUP_STEPS } from '@guard/setup/recipe';

import type { GuardMutation } from './_mutations.ts';
import { guardRoot, packageRoot, repoRoot } from './_source.ts';

/**
 * SKILL-PACK GUARD — the published skill teaches only what the recipe and the MCP
 * server say, and it is the generator's output, byte for byte.
 *
 * The skill (ADR-0002) is the teaching channel for agents that never ran the hooks
 * installer — which means it is also the place retyped commands would drift the
 * quietest: nobody's verify breaks when a README-quality document goes stale. So the
 * skill is not hand-written at all. `scripts/generate-skill.mjs` renders it from the
 * built SetupRecipe, and this guard:
 *
 *   1. regenerates and compares — a hand edit to the committed SKILL.md is a red
 *      verify, the same discipline THIRD-PARTY.md is under;
 *   2. pins the four MCP tool names to the server's own source — a tool the server
 *      does not register is a command an agent loops on;
 *   3. walks the recipe's steps into the text — every command the recipe carries,
 *      the skill teaches;
 *   4. holds the prose to Law 4: no percentages, no rates, no savings — the only
 *      number in the skill is the recipe's budget.
 */

const GENERATOR = join(repoRoot(), 'scripts/generate-skill.mjs');
const SKILL = 'skills/smelt/SKILL.md';
const MCP_SRC = join(repoRoot(), 'packages/mcp/src');

/**
 * The committed skill — from the mutation runner's scratch root when it made one
 * (which is when `guardRoot()` stops being this package's own root), else the real
 * repository. The same arrangement every artifact-pinning guard reads through.
 */
function committedSkill(): string {
  const root = guardRoot() === packageRoot() ? repoRoot() : guardRoot();
  return readFileSync(join(root, SKILL), 'utf8');
}

/** The generator's current output — the real script, as a subprocess. */
function generated(): string {
  const run = spawnSync(process.execPath, [GENERATOR, '--print'], { encoding: 'utf8' });
  expect(
    run.status,
    `scripts/generate-skill.mjs failed. It reads the built @smeltjs/core, so the ` +
      `package must be built first (\`pnpm build\`):\n${run.stderr}`,
  ).toBe(0);
  return run.stdout;
}

describe('the SkillPack is the generator\u2019s output and states only package facts', () => {
  it('regenerating leaves the committed skill byte-identical', () => {
    expect(
      committedSkill(),
      'the committed SKILL.md is not the generator\u2019s output — run `pnpm generate:skill` and commit the result, never edit the skill by hand',
    ).toBe(generated());
  });

  it('teaches every command the recipe carries, none beside them', () => {
    const text = committedSkill();
    for (const step of SETUP_STEPS) {
      expect(
        text.includes(step.command),
        `the skill never teaches the recipe's ${step.id} step (${step.command})`,
      ).toBe(true);
    }
    expect(text).toContain(SETUP_RECIPE.install.oneShot);
  });

  it('names only MCP tools the server actually registers', () => {
    const text = committedSkill();
    const names = [...text.matchAll(/`(smelt_file|repo_map|smelt_retrieve|smelt_stats)`/gu)].map(
      (match) => match[1]!,
    );
    expect(names.length, 'the skill names no MCP tools at all').toBeGreaterThan(0);
    for (const name of new Set(names)) {
      const inServer = spawnSync('grep', ['-r', name, MCP_SRC], { encoding: 'utf8' });
      expect(
        inServer.status,
        `the skill teaches \`${name}\`, which packages/mcp/src never registers`,
      ).toBe(0);
    }
  });

  it('states no saving: Law 4 holds for prose, not just for the README', () => {
    const text = committedSkill();
    expect(
      /%\s|(?:token|cost|size)\s+(?:reduction|saving)|saves?\s+(?:up to|\d)/iu.exec(text)?.[0],
      `the skill states a saving smelt has not measured: "${/.*(%|(?:token|cost|size)\s+(?:reduction|saving)).*/iu.exec(text)?.[0]?.trim()}" — mechanisms only, like every other surface`,
    ).toBeUndefined();
  });

  it('teaches the retrieve contract in both spellings a marker implies', () => {
    const text = committedSkill();
    expect(text).toContain('retrieve("hash")');
    expect(text).toContain('smelt retrieve <hash>');
  });
});

/**
 * The breaks this guard must catch. `pnpm mutate` applies each one and asserts this
 * file goes red — see `test/guards/_mutations.ts`.
 */
export const MUTATIONS: GuardMutation[] = [
  {
    kind: 'artifact',
    id: 'skill-edited-by-hand',
    file: 'skills/smelt/SKILL.md',
    find: '## Retrieving what was cut',
    replace: '## Retrieving what was cut (up to 94% fewer tokens)',
    why: 'the original pitch\u2019s unmeasured 94% landing in the teaching artifact — the exact Law 4 failure, in the one file an agent reads as instructions rather than as marketing',
  },
  {
    kind: 'artifact',
    id: 'skill-generator-invents-a-tool',
    file: 'scripts/generate-skill.mjs',
    find: 'smelt_file',
    replace: 'smelt_fyle',
    why: 'the generator teaching a tool the server does not register — an agent would loop on a command that cannot succeed, and only the tool-name pin to the server\u2019s own source can see it',
  },
];
