import facts from '@/generated/facts.json';
import { Tabs } from '@/components/ui/Tabs';
import { CopyButton } from '@/components/ui/CopyButton';
import { Frame, FrameBar } from '@/components/ui/Frame';
import { GITHUB } from '@/components/Nav';

/**
 * The install lines — every one a recipe fact read off facts.json, including the
 * manager spellings (npm, pnpm, bun, the one-shot, brew). A spelling typed here was
 * the `.smelt-store` drift shape reborn: invisible to the exact-match scan, wrong
 * the day the package name moved.
 */
const INSTALLS = [
  { id: 'npm', label: 'npm', cmd: facts.recipe.installLibrary },
  { id: 'pnpm', label: 'pnpm', cmd: facts.recipe.installPnpm },
  { id: 'bun', label: 'bun', cmd: facts.recipe.installBun },
  {
    id: 'npx',
    label: 'npx',
    cmd: `${facts.recipe.oneShot} src/server.ts --budget ${facts.recipe.recommendedBudgetBytes} --focus handleRequest`,
  },
  { id: 'brew', label: 'brew', cmd: facts.recipe.brewInstall },
];

function InstallLine({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-iron-dark bg-lift px-4 py-3">
      <span aria-hidden="true" className="select-none font-mono text-[13px] text-iron-light">
        $
      </span>
      <code className="overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-[1.5] text-ash">
        {cmd}
      </code>
      <CopyButton text={cmd} label={`Copy: ${cmd}`} className="ml-auto" />
    </div>
  );
}

/* The real marker from the README's own example — the wire format, verbatim. */
const MARKER = '<<smelt/v1: collapsed 3 sibling functions (2224B) — retrieve("84998967370f38bc")>>';

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b border-iron-dark">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-16 sm:px-6 md:grid-cols-12 md:gap-8 md:py-24">
        <div className="md:col-span-7">
          <h1
            id="hero-title"
            className="max-w-[24ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-ash sm:text-[42px] lg:text-[54px]"
          >
            Shrink what your coding agent sends to a model.{' '}
            <span className="text-slag">Without lying about what it removed.</span>
          </h1>
          <p className="mt-6 max-w-[58ch] text-[15px] leading-[1.6] text-slag md:text-base">
            Structure-aware, reversible context optimization for coding agents. A library, not a
            proxy. Hand smelt a blob and a byte budget; the parts the task needs survive, and
            everything else becomes one line saying what went, how big it was, and a hash to get it
            back.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#agent-prompt"
              className="rounded-[8px] bg-ash px-4 py-2.5 text-sm font-medium text-charcoal transition-colors duration-150 hover:bg-white-hot"
            >
              Set up via your agent
            </a>
            <a
              href={GITHUB}
              className="rounded-[8px] border border-iron-dark px-4 py-2.5 text-sm text-ash transition-colors duration-150 hover:border-iron"
            >
              Read the source
            </a>
            <span className="font-mono text-[13px] text-slag">Apache-2.0 · zero network calls</span>
          </div>
        </div>

        <div className="md:col-span-5">
          <Tabs
            label="Install command by package manager"
            tabs={INSTALLS.map((i) => ({
              id: i.id,
              label: i.label,
              content: <InstallLine cmd={i.cmd} />,
            }))}
          />
          <Frame className="mt-6">
            <FrameBar label="what an elision looks like" meta="the wire format" />
            <div className="overflow-x-auto p-4">
              <pre className="font-mono text-[13px] leading-[1.6]">
                <code>
                  <span className="text-iron-light">{'// '}</span>
                  <span className="text-ember">{MARKER}</span>
                </code>
              </pre>
              <p className="mt-3 max-w-[46ch] font-sans text-[13px] leading-[1.5] text-slag">
                The removed bytes are stored locally, content-addressed. Every retrieval is counted
                — cutting too much shows up as a rising number, not a model that is quietly wrong
                about your code.
              </p>
            </div>
          </Frame>
        </div>
      </div>
    </section>
  );
}
