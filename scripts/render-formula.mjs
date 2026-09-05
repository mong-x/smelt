#!/usr/bin/env node
/**
 * Renders the Homebrew tap formula for a release — `packaging/homebrew/smelt.rb`,
 * from its `smelt.rb.template` beside it.
 *
 * The formula is data about one release: the registry tarball URL and the sha256 of
 * the exact bytes `pnpm publish` uploaded. Both arrive as arguments; neither is ever
 * guessed, defaulted, or fetched here, because a formula whose hash is "probably
 * right" is worse than no formula — brew would silently install tarball bytes nobody
 * measured. The publish workflow renders this with the version it published and the
 * hash it computed; a maintainer rendering by hand passes the same pair.
 *
 * Refuses and exits 1 when a version is not a bare semver release (a `v` prefix, a
 * range, a tag shape — anything the registry URL would not serve) or the hash is not
 * 64 hex characters.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(here, '..', 'packaging', 'homebrew', 'smelt.rb.template');
const OUT_PATH = join(here, '..', 'packaging', 'homebrew', 'smelt.rb');

const [version, sha256] = process.argv.slice(2);

if (version === undefined || sha256 === undefined) {
  console.error('usage: node scripts/render-formula.mjs <version> <sha256>');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `render-formula: "${version}" is not a bare semver release — the registry URL is ` +
      `built from this string, so "v1.2.3" or a range would render a formula brew ` +
      `cannot fetch`,
  );
  process.exit(1);
}
if (!/^[0-9a-f]{64}$/.test(sha256)) {
  console.error(
    `render-formula: "${sha256}" is not a sha256 hex digest — pass \`shasum -a 256\` of ` +
      `the exact tarball bytes that were published, never a hash of a local rebuild`,
  );
  process.exit(1);
}

const template = readFileSync(TEMPLATE_PATH, 'utf8');
const rendered = template.replaceAll('__VERSION__', version).replaceAll('__SHA256__', sha256);
writeFileSync(OUT_PATH, rendered);
console.log(`render-formula: @smeltjs/core ${version} → packaging/homebrew/smelt.rb`);
