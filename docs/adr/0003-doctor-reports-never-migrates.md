# Doctor reports; setup repairs; nothing migrates silently

`smelt doctor` only reads InstalledState — binary version, the smelt version stamped
into each hook marker block, the config version, the MCP registration, orphans — and
prints the exact repair command when something is behind. It never edits a file. Repair
is always the idempotent `smelt setup`, and a config version mismatch stays a loud
refusal: no silent migration, one writer, and "is this machine current?" stays
answerable from pure shell.
