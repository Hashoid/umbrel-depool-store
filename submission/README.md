# The submission — what is parked here and how it maps to their rules

**NOT SENT. Nothing has been forked, opened or mailed.** This directory is the
artifact Damon reviews; `../docs/SUBMISSION-getumbrel-umbrel-apps.md` is the
plan and the open questions.

```
depool-node/            → copies into the fork as <fork>/depool-node/
  umbrel-app.yml          the manifest, in their field order
  docker-compose.yml      the app's compose (three deliberate edits, below)
  exports.sh              the dependency contract mapping
  data/*/.gitkeep         the bind-mount sources the app needs on first start
PR-BODY.md              → pastes into the PR description
```

## Every requirement, and where it is satisfied

| their rule (source) | where |
|---|---|
| Required manifest fields, in order: `manifestVersion, id, category, name, version, tagline, description, releaseNotes, developer, website, dependencies, repo, support, port, gallery, path, submitter, submission` (`lint-apps.mjs`) | `depool-node/umbrel-app.yml` — all present |
| `category` from the ten-value enum | `bitcoin` |
| `id` matches the directory, lowercase kebab-case | `depool-node`, dir `depool-node/` |
| `releaseNotes: ""` for a new submission (hard error) | `releaseNotes: ""` |
| `gallery: []` for a new submission (warning) | `gallery: []` |
| No committed icon/gallery/screenshot assets | none in `depool-node/`; screenshots and the logo go in the PR body |
| Only `umbrel-app.yml` + `docker-compose.yml` are unconditional; `exports.sh` only when needed | both files, plus the one `exports.sh` this app genuinely needs (the dependency's network mapping) |
| No host Docker socket (hard error); no privileged/host mounts | no socket anywhere; mounts are `${APP_DATA_DIR}/data/...` only |
| Every image `tag@sha256:<manifest-list>`, public, amd64+arm64, no `build:` | all seven services pinned to the v0.2.9 manifest-list digests |
| Bind-mount source dirs committed with `.gitkeep` | `depool-node/data/{cln-payer,cln-payee,miner,relay}/.gitkeep` |
| Do not bind mount `${APP_DATA_DIR}` directly | every mount is a subdirectory of `data/` |
| Raw host ports only where `app_proxy` cannot front, explicit and non-colliding | `23333/tcp` (Stratum) — `28700` is the manifest/app_proxy port |
| Manifest `port` unique across the store | `28700` |
| "Must open to a useful web UI, setup page, or status/connection page … without SSH, CLI, log scraping or file edits" | the app's own page (`proof/v0.2.9-umbrelos-app-proxy.png`) |
| `implements:` only for real drop-in providers | not used — this app consumes `bitcoin`, it does not implement it |
| Lint gate before review | `npm run lint:apps -- depool-node --check-images` — see below |

## The three deliberate edits to the compose (vs the community store's)

1. **The relay's `127.0.0.1:2085` publish is dropped.** Same-app traffic uses
   the compose network; an App Store package should not claim a host port it
   does not need (and the linter checks every literal port).
2. **`REWRITE_LOOPBACK` / `PRIME_HTTP` and the `host.docker.internal`
   `extra_hosts` entry are dropped.** They exist so our own rigs can reach a
   service on the *host's* loopback (the pool prime's mining history); on a
   user's box there is nothing there, and the wallet page reads the node's own
   history instead.
3. **The control comment no longer says its status is `docker compose ps`.**
   That was retired on 2026-09-13: liveness reads each service directly (node
   RPC, CLN socket, the daemon's `/data/status.json`, a WS handshake at the
   configured relay). A comment promising docker in a package that must never
   have the socket is exactly what a reviewer would flag.

## Before the PR is opened

```sh
git clone https://github.com/getumbrel/umbrel-apps && cd umbrel-apps
cp -r <this>/submission/depool-node .            # the app dir only
npm run lint:apps -- depool-node --check-images  # their gate, network on
git diff --check
```

Then: fork → branch → commit `depool-node/` → open the PR with `PR-BODY.md`
and the two screenshots attached → set `submission:` to the PR URL (or leave
the repo URL and say so in the body — their own `bitcoin` package carries a
commit URL).
