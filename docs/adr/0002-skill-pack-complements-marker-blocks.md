# The skill pack complements the marker block; it does not replace it

Ruling R1 refused `smelt agents init`: smelt never writes an agent's instruction files
uninvited. Publishing an opt-in SkillPack (installed by the agent's owner via
`npx skills add smeltjs/smelt`) is a different act — consent given at install time — so
both channels exist: the marker block, written only when the user runs install, sitting
beside the enforcement hooks that need it; and the skill pack, for agents and evaluators
running without hooks. Both are adapters over one instruction-content seam, guard-pinned
together so they cannot drift.
