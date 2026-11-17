# Publishing checklist

Owner: **fanyzp** only. All listings, npm, and registry entries use this identity.
Never use a real name in any listing, package, or registry field.

Current release: `unofficial-instagram-mcp@0.3.0`
Registry name: `io.github.fanyzp/unofficial-instagram-mcp`

## Files prepared for publishing

| File | Purpose |
| --- | --- |
| `package.json` | `private` removed, `mcpName` added, repository/homepage/keywords added, `files` whitelist added |
| `server.json` | Official MCP Registry manifest (schema 2025-12-11) |
| `smithery.yaml` | Smithery stdio start command + config schema (CDP_URL, IG_DRY_RUN) |
| `glama.json` | Glama maintainer claim (`fanyzp`) |
| `.github/workflows/publish-mcp-registry.yml` | Manual-only (`workflow_dispatch`) registry publish via GitHub OIDC. No auto build, per owner rule. |

## Order of operations — do not reorder

The Official Registry verifies that the npm package already exists and that its
`mcpName` matches `server.json` `name`. Publishing the registry entry before npm
will fail validation.

1. **Verify locally**
   ```bash
   npm run check
   npm test
   npm pack --dry-run
   ```
   Check the pack list: `src/`, `bin/`, `config/`, `skills/`, `README.md`,
   `LICENSE`, `.env.example`, `server.json`, `smithery.yaml`, `glama.json`
   must be present. `.env` and `node_modules/` must not be present.

2. **Commit and push to GitHub** (`fanyzp/unofficial-instagram-mcp`)
   Conventional Commits, for example:
   `feat(registry): add MCP Registry, Smithery and Glama publishing files`
   Wait for owner QC of a screenshot/diff before committing, per owner rule.

   Also set GitHub repository topics in Settings:
   `mcp`, `mcp-server`, `model-context-protocol`, `instagram`, `ai-agent`, `playwright`

3. **Publish to npm** (owner logs in himself; never share the token in chat)
   ```bash
   npm login
   npm publish --access public
   npm view unofficial-instagram-mcp
   ```

4. **Publish to the Official MCP Registry**
   Option A, local:
   ```bash
   # install mcp-publisher from the registry GitHub releases, then:
   mcp-publisher login github
   mcp-publisher publish
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.fanyzp/unofficial-instagram-mcp"
   ```
   Option B, GitHub Actions: run the manual workflow
   `Publish to MCP Registry` (workflow_dispatch only).

5. **Smithery** — https://smithery.ai/new
   Sign in as fanyzp, submit the GitHub repository URL. Smithery reads
   `smithery.yaml` and `package.json`. Fill name, description, homepage and
   GitHub in Settings to raise the quality score. This server is local stdio
   only; do not claim a remote/hosted endpoint.

6. **Glama** — https://glama.ai/mcp/servers
   Glama auto-indexes from GitHub topics and the Official Registry, usually
   within a day. Search for the repo, then claim the listing (the
   `glama.json` maintainer file supports the claim).

7. **Free directories that auto-sync or take a free form**
   - PulseMCP: auto-ingests the Official Registry; verify the listing appeared.
   - mcp.directory: auto-imports from the Registry, or use `/submit`.
   - mcpservers.org: free form at `/submit`.
   - LobeHub MCP Marketplace: auto-indexes; verify and claim.
   - awesome-mcp-servers (GitHub): open a PR adding the server under the
     Social / Instagram category with the one-line description from `server.json`.

8. **Skip for now (paid, low return)**
   - mcp.so paid listing and MCP Market paid listing. Revisit only if free
     channels already bring steady installs.

## Positioning — use this wording everywhere

Do not position this as another Graph API wrapper.

> Unofficial Instagram MCP for personal accounts. Works through a Chrome
> window you already signed in to, so there is no Meta API token, no app
> review, and no password stored. 36 tools: DMs with a live watcher,
> profiles, posts, comments, stories and notifications, plus CLI and TUI.

Differentiators to keep in every listing:
- Personal account works (competitors using the official Graph API require
  Business/Creator accounts)
- No password asked for or stored; the user signs in manually in Chrome
- DM watcher (`dm_watch` / `dm_events`) pushes new-message events
- Dry-run by default (`IG_DRY_RUN=true`)
- One-command agent install for 16 harnesses plus an Agent Skill

## Known limits to state honestly in listings

- Local stdio only. It cannot be hosted as a remote server because it needs
  the user's own signed-in Chrome over CDP (`http://127.0.0.1:9222`).
- `story_create`, `story_create_poll` and `story_delete` are limited by
  Instagram Web itself (see `docs/VERIFICATION.md`): 31 of the original 34
  tools passed live testing, plus the 2 watcher tools verified separately.
