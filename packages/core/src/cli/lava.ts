/**
 * The lava renderer — the wizards' presentation, as one adapter behind the output
 * seam (ADR-0001: Node-native; the charm.land palette, not its Go).
 *
 * The spike verdict this module embodies: clack and ink could not sit *inside* the
 * wizard loop. Their prompts own the terminal — raw mode, cursor surgery, direct
 * stdin reads — which is exactly what the injected `AnswerStream` exists to prevent:
 * the guards test every wizard in-process by scripting that stream, and a component
 * that bypasses it cannot be guard-tested at all. So the renderer went one seam
 * out: it decorates the bytes the wizards already emit, line-semantically, and
 * switches itself off unless a real, interactive, colour-honouring terminal is on
 * the other side. No dependency, no layout engine — and every wizard guard passes
 * byte-identical, because `colorize(_, false)` is the identity.
 *
 * The rules are line-shaped, never word-shaped: ANSI codes wrap whole lines, so the
 * text a guard asserts (`wrote CLAUDE.md`, `Nothing was written.`) stays contiguous
 * inside the styled line. `--yes`, `--json`, piped stdin and `NO_COLOR` all mean
 * plain bytes — a machine parsing wizard output must never parse around escape
 * sequences.
 */

/** Where the lava gradient starts and ends, in truecolor. */
const LAVA_FROM = [124, 45, 18] as const; // deep ember
const LAVA_TO = [245, 158, 11] as const; // amber

const CODE = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  amber: '\x1b[33m',
} as const;

function truecolor([r, g, b]: readonly number[]): string {
  return `\x1b[38;2;${String(r)};${String(g)};${String(b)}m`;
}

/**
 * Style one block of wizard output. `on === false` returns the text untouched —
 * the property every guard's byte-identity leans on.
 */
export function colorize(text: string, on: boolean): string {
  if (!on) return text;
  return text
    .split('\n')
    .map((line) => {
      if (line === '') return line;
      if (line.includes('✓') || line.trim().startsWith('Done.')) {
        return `${CODE.green}${line}${CODE.reset}`;
      }
      if (
        line.includes('✗') ||
        line.includes('ORPHAN') ||
        line.includes('MALFORMED') ||
        line.includes('MISSING')
      ) {
        return `${CODE.red}${line}${CODE.reset}`;
      }
      if (line.trim().startsWith('note:')) return `${CODE.amber}${line}${CODE.reset}`;
      if (line.endsWith('> ') || /»/u.test(line)) return `${CODE.bold}${line}${CODE.reset}`;
      return line;
    })
    .join('\n');
}

/**
 * The banner an interactive wizard opens with: the title over a lava gradient bar.
 * Returns plain text when `on` is false.
 */
export function lavaBanner(title: string, on: boolean): string {
  const bar = '━'.repeat(24);
  if (!on) return `${bar}\n  ${title}\n${bar}`;
  const steps = bar.length;
  const painted = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const r = Math.round(LAVA_FROM[0] + (LAVA_TO[0] - LAVA_FROM[0]) * t);
    const g = Math.round(LAVA_FROM[1] + (LAVA_TO[1] - LAVA_FROM[1]) * t);
    const b = Math.round(LAVA_FROM[2] + (LAVA_TO[2] - LAVA_FROM[2]) * t);
    return `${truecolor([r, g, b])}━`;
  }).join('');
  return `${painted}${CODE.reset}\n  ${CODE.bold}${title}${CODE.reset}\n${painted}${CODE.reset}`;
}
