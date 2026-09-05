import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_FILE_NAME, CONFIG_VERSION } from './config.ts';
import { readInstalledState } from './installed.ts';
import type { InstalledBlock } from './installed.ts';
import { CLI_NAME, EXIT } from './shell.ts';

/**
 * `smelt doctor` — the verdicts over InstalledState. The reading lives in
 * `cli/installed.ts` (one reader, behind the three consumers); this module decides
 * and reports: which blocks are behind the running binary, which pieces are orphans,
 * what the repair is, and what the exit code means. Everything the writers wrote,
 * this verb reads back and compares — and never writes a byte of (ADR-0003).
 *
 * When something is behind, the report ends with the exact repair command —
 * `smelt setup`, per harness where a block is behind — and nothing more happens.
 * The exit code carries the verdict, so the other-machine loop — upgrade, doctor,
 * setup — needs no prose parsing.
 */

export interface DoctorIo {
  readonly output: (text: string) => void;
  /** Where installed state is read: config discovery, instruction files, hook files. */
  readonly cwd: string;
  /** The running binary's version — what "current" is measured against. */
  readonly version: string;
}

export interface DoctorOptions {
  readonly json: boolean;
}

/** One instruction block found on disk, with the release that wrote it. */
export interface DoctorBlock {
  readonly file: string;
  /** The harness profiles whose instruction file this is (often exactly one). */
  readonly harnesses: readonly string[];
  /** The release that wrote it, or `undefined` when it predates stamping. */
  readonly installedBy?: string;
  readonly status: 'current' | 'behind' | 'unversioned';
}

/** The config as doctor saw it. A malformed config is a finding, not a crash. */
export interface DoctorConfig {
  readonly present: boolean;
  readonly malformed?: boolean;
  readonly schemaVersion?: number;
  readonly currentSchema?: boolean;
  readonly budgetBytes?: number;
  readonly store: {
    readonly kind?: 'directory' | 'memory';
    readonly path?: string;
    readonly dirExists?: boolean;
  };
}

/** One MCP registration found (or notably absent) on disk. */
export interface DoctorMcp {
  readonly file: string;
  readonly server: string;
  readonly registered: boolean;
}

/** The machine receipt — `--json`. Everything doctor read, and the verdict. */
export interface DoctorReceipt {
  readonly format: 'smelt.doctor.v1';
  readonly version: string;
  /** True when something is installed and nothing is behind and there are no orphans. */
  readonly current: boolean;
  readonly installed: boolean;
  readonly config: DoctorConfig;
  readonly blocks: readonly DoctorBlock[];
  readonly hookFiles: readonly string[];
  readonly mcp: readonly DoctorMcp[];
  readonly orphans: readonly string[];
  readonly repair: readonly string[];
}

export function runDoctor(options: DoctorOptions, io: DoctorIo): number {
  const say = (text: string): void => {
    if (!options.json) io.output(text);
  };
  const orphans: string[] = [];
  const repair: string[] = [];

  const state = readInstalledState(io.cwd);

  // ── verdict: blocks vs the running binary ──
  const blocks: DoctorBlock[] = state.blocks.map((block) => ({
    file: block.file,
    harnesses: block.harnesses,
    ...(block.installedBy === undefined ? {} : { installedBy: block.installedBy }),
    status: blockStatus(block, io.version),
  }));
  const behindBlocks = blocks.filter((block) => block.status === 'behind');
  for (const block of behindBlocks) {
    repair.push(...block.harnesses.map((id) => `${CLI_NAME} setup --harness ${id}`));
  }

  // ── config detail + the store-directory orphan ──
  let config: DoctorConfig = { present: false, store: {} };
  if (state.config.present) {
    if (state.config.malformed === true || state.config.parsed === undefined) {
      config = { present: true, malformed: true, store: {} };
      orphans.push(
        `${CONFIG_FILE_NAME} is malformed: ${state.config.malformedWhy ?? 'unparseable JSON'}`,
      );
      repair.push(`${CLI_NAME} setup`);
    } else {
      const parsed = state.config.parsed;
      const configPath = state.config.path ?? join(io.cwd, CONFIG_FILE_NAME);
      const dirExists =
        parsed.store?.kind === 'directory'
          ? existsSync(join(dirname(configPath), parsed.store.path))
          : undefined;
      config = {
        present: true,
        schemaVersion: parsed.smeltConfig,
        currentSchema: parsed.smeltConfig === CONFIG_VERSION,
        ...(parsed.defaultBudgetBytes === undefined
          ? {}
          : { budgetBytes: parsed.defaultBudgetBytes }),
        store: {
          ...(parsed.store === undefined ? {} : { kind: parsed.store.kind }),
          ...(parsed.store?.kind === 'directory' ? { path: parsed.store.path } : {}),
          ...(dirExists === undefined ? {} : { dirExists }),
        },
      };
      if (parsed.store?.kind === 'directory' && dirExists === false) {
        orphans.push(
          `the store directory (${parsed.store.path}) does not exist — retrieves across processes would fail`,
        );
        repair.push(`${CLI_NAME} setup`);
      }
    }
  }

  // ── orphans: pieces whose partners are missing ──
  const wired = state.blocks.length > 0 || state.hookFiles.length > 0;
  if (state.mcp.some((one) => one.registered) && !wired) {
    orphans.push(
      'an MCP registration is present but no hooks wiring is — the guard and the retrieval contract travel together',
    );
    repair.push(`${CLI_NAME} setup`);
  }
  if (wired && !state.config.present) {
    orphans.push(
      'hooks are wired but there is no smelt.config.json — the store and budget the hooks promise live there',
    );
    repair.push(`${CLI_NAME} setup`);
  }

  // ── verdict ──
  const installed = wired || state.config.present || state.mcp.some((one) => one.registered);
  const current = installed && behindBlocks.length === 0 && orphans.length === 0;

  say(`${CLI_NAME} doctor — binary ${io.version}, reading ${io.cwd}\n`);
  if (!installed) {
    say(`Nothing of smelt's is installed here. \`${CLI_NAME} setup\` would change that.\n`);
  } else {
    if (config.present) {
      say(
        `  ${CONFIG_FILE_NAME}: ${
          config.malformed === true
            ? 'MALFORMED'
            : `schema ${String(config.schemaVersion)}, budget ${
                config.budgetBytes === undefined ? 'unset' : String(config.budgetBytes)
              }, store ${describeStore(config)}`
        }\n`,
      );
    } else {
      say(`  ${CONFIG_FILE_NAME}: absent\n`);
    }
    for (const block of blocks) {
      say(
        `  ${block.file}: written by ${
          block.installedBy ?? 'a pre-stamping release (unversioned)'
        } [${block.status}] — ${block.harnesses.join(', ')}\n`,
      );
    }
    for (const name of state.hookFiles) say(`  ${name}: wired\n`);
    for (const one of state.mcp) {
      if (one.registered) say(`  ${one.file}: ${one.server} registered\n`);
    }
    for (const orphan of orphans) say(`  ORPHAN: ${orphan}\n`);
    if (behindBlocks.length > 0) {
      say(
        `\nBehind: the running binary is ${io.version}; re-run setup to bring the ` +
          `installed state to it:\n` +
          [...new Set(repair)].map((command) => `  ${command}\n`).join(''),
      );
    } else if (orphans.length > 0) {
      say(`\nRepair:\n${[...new Set(repair)].map((command) => `  ${command}\n`).join('')}`);
    }
    say(
      current
        ? `Current: everything on disk agrees with binary ${io.version}.\n`
        : `Not current — see above. Doctor never writes; ${CLI_NAME} setup is the repair.\n`,
    );
  }

  if (options.json) {
    const receipt: DoctorReceipt = {
      format: 'smelt.doctor.v1',
      version: io.version,
      current,
      installed,
      config,
      blocks,
      hookFiles: [...state.hookFiles],
      mcp: [...state.mcp],
      orphans,
      repair: [...new Set(repair)],
    };
    io.output(JSON.stringify(receipt, null, 2) + '\n');
  }
  return current || !installed ? EXIT.ok : EXIT.refused;
}

/** The verdict over one block: whole-owned files carry no stamp to compare. */
function blockStatus(block: InstalledBlock, binaryVersion: string): DoctorBlock['status'] {
  if (!block.stampable) return 'unversioned';
  return block.installedBy === binaryVersion ? 'current' : 'behind';
}

function describeStore(config: DoctorConfig): string {
  if (config.store.kind === undefined) return 'unset';
  if (config.store.kind === 'memory') return 'memory';
  return `directory at ${config.store.path ?? ''} (${
    config.store.dirExists ? 'present' : 'MISSING'
  })`;
}
