# The smelt formula, as the tap carries it. This file is RENDERED — never edit the
# version or the hash by hand; run `node scripts/render-formula.mjs <version> <sha256>`
# with the release the workflow published. The sha256 is of the exact registry
# tarball bytes, because a formula that hashes anything else vouches for bytes nobody
# served.
class Smelt < Formula
  desc "Structure-aware, reversible context optimization for AI coding agents"
  homepage "https://github.com/smeltjs/smelt"
  url "https://registry.npmjs.org/@smeltjs/core/-/core-0.4.0.tgz"
  sha256 "977df8d3283de81182d4c12363ff31200627405fbfc5ca7a86a2a3fa2cac3a55"
  license "Apache-2.0"

  # smelt is a Node CLI — one runtime dependency, web-tree-sitter, whose grammars
  # ship inside the tarball; no native build, no postinstall download.
  depends_on "node"

  def install
    system "npm", "install", *std_npm_install_args(libexec)
    bin.install_symlink libexec/"bin/smelt"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/smelt --version")
  end
end
