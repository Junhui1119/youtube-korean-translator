# gstack

For all web browsing, use the `/browse` skill from gstack. Never use the `mcp__claude-in-chrome__*` tools.

Available gstack skills:

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

# codegraph

`codegraph` — code intelligence and knowledge graph for any codebase. Installed at `~/.local/bin/codegraph` (standalone bundle in `~/.codegraph`).

Common commands:

- `codegraph init [path]` — initialize CodeGraph in a project and build the initial index
- `codegraph sync [path]` — sync changes since the last index
- `codegraph status [path]` — show index status and statistics
- `codegraph query <search>` — search for symbols in the codebase
- `codegraph explore <query...>` — relevant symbols' source + call paths in one shot
- `codegraph node <name>` — one symbol's source + caller/callee trail
- `codegraph callers <symbol>` — find all functions/methods that call a symbol
- `codegraph upgrade` — upgrade in place

# specify (GitHub Spec Kit)

`specify` — Spec-Driven Development toolkit. Installed via `uv` (`uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@<version>`).

Common commands:

- `specify init` — initialize a new Specify project
- `specify check` — check that all required tools are installed
- `specify version` — display version and system information
- `specify self` — manage/upgrade the specify CLI itself
- `specify workflow` — manage and run automation workflows
