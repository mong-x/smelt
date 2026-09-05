# No Go TUI for the setup surface

The setup experience will not be built with charm.land's Go libraries (Bubble Tea, Huh,
Lip Gloss), tempting as the lava aesthetic made it: smelt stays one Node/TypeScript
process, because the wizards are pure functions over an injected answer stream —
guard-tested and mutation-tested in-process — and a Go TUI would place a second language
and a process seam exactly there, while adding a third artifact to install and update
(which is the very problem this effort exists to remove). The delight is delivered
Node-natively: an ANSI renderer behind the same stream seam, lava palette ported, and the
full lava treatment stays on the site.

## Considered Options

- **Go TUI** (rejected): second toolchain, third install artifact, wizards lose their
  in-process test interface.
- **Node-native renderer** (chosen): one more adapter behind the existing seam.
- **Site-only styling** (fallback): zero CLI change, least delight.
