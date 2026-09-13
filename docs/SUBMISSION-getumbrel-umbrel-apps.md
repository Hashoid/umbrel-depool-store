# Depool Node → getumbrel/umbrel-apps — SUBMISSION DRAFT

**STATUS: DRAFT. NOT SENT. Nothing has been forked, opened or mailed.**
This file is the complete plan for Damon to approve, amend, or bin. Every rule
quoted below was verified against the live repo on 2026-09-13 (commit-era:
the agent-first rewrite of 2026-06-18); the skill files it cites are the
current canon.

---

## 1 · What actually goes outward

One **new top-level directory** in a fork of `getumbrel/umbrel-apps`, one
branch, one PR against `master` — **materialised and parked at
`submission/`** (see `submission/README.md` for the rule-by-rule map):

```
submission/depool-node/     → copies into the fork as depool-node/
  umbrel-app.yml
  docker-compose.yml
  exports.sh
  data/cln-payer/.gitkeep
  data/cln-payee/.gitkeep
  data/miner/.gitkeep
  data/relay/.gitkeep
submission/PR-BODY.md       → pastes into the PR description
```

`tests/validate.js` now gates that artifact: required manifest fields, `gallery: []`
+ `releaseNotes: ""`, no committed image assets, no `icon`, no docker socket,
no `build:`, the same services and pinned images as the app we actually ship,
and committed `.gitkeep` sources — 111/111.

PR title (their template): **`Add Depool Node`**

**What does NOT go in the PR** (these are warnings in their linter):

- no `1.jpg`, no `depool-node.svg` — "Do not commit App Store screenshots,
  gallery assets, or icon/logo assets; include them in the PR body instead"
- no `README.md` — 0 of 391 official app dirs have one, and it is in neither
  required list (it would be dead weight, not a courtesy)
- no `*.regtest.yml` overlay — that is our rig, not the store app

---

## 2 · The manifest, as it would land

Adapted from our community-store manifest. Three deliberate changes, all
required for a NEW official submission:

| field | ours (community store) | the PR | why |
|---|---|---|---|
| `gallery` | `[1.jpg]` | `[]` | "Use `gallery: []` for new packages. The Umbrel team adds gallery images before merge" |
| `releaseNotes` | full text | `""` | "`releaseNotes` must be set to an empty string for new app submissions" (linter hard-error) |
| image assets | `1.jpg`, `depool-node.svg` committed | not committed | Umbrel hosts final assets; logo goes in the PR body |

```yaml
manifestVersion: 1
id: depool-node
category: bitcoin
name: Depool Node
version: 0.2.9
tagline: Mine with your own node — no pool in the middle
description: >-
  ... (kept from ours; first-run setup first, per "Put important first-run
  setup or security notes near the top of description")
releaseNotes: ""

developer: Depool
website: https://depool.org
dependencies:
  - bitcoin
repo: https://github.com/Hashoid/umbrel-depool-store
support: https://depool.org

port: 28700
gallery: []
path: ""

submitter: Depool
submission: <PR URL — see §7>
```

Notes on the fields a reviewer will actually check:

- `port: 28700` is the **app_proxy** host port and must be unique across all
  391 apps — 28700 is in the free range we already hold; the app's internal
  listen port is not the same number and is not pinned by the manifest.
- `dependencies: [bitcoin]` — correct per the skill: "The dependency value
  remains the app ID being depended on". Our compose consumes the exact
  `APP_BITCOIN_*` contract published by `bitcoin/exports.sh`
  (`NODE_IP`, `RPC_PORT`, `RPC_USER`, `RPC_PASS`, `DATA_DIR`, `NETWORK`, …).
- `version` — Depool has no upstream release train; the package version IS
  0.2.9. The skill allows the short commit SHA "if upstream has no release
  version" — Damon/uniMaster call: package version (our choice) or the
  depool commit SHA the images were built from.

---

## 3 · Compose and exports — what the reviewer inspects

Our `docker-compose.yml` already satisfies every machine-enforced rule; the
PR must still **call these out** because they are the interesting ones:

- **No Docker socket.** "Do not mount the Docker socket; it gives the
  container host-level Docker control" is a hard linter error. Ours mounts
  only `${APP_DATA_DIR}/data/...` — control was rebuilt precisely so its
  liveness and rails never need `docker` (2026-09-13, `1fd100f`/`6284390`).
- **Every image pinned** `tag@sha256:<manifest-list>` and **multi-arch**
  (amd64 + arm64), no `build:` in the package. All seven services.
- **One raw host port**: `23333` for the Stratum endpoint (a non-HTTP
  protocol — exactly the case where raw ports are allowed). Plus the
  relay's `127.0.0.1:2085` binding. The skill asks for these to be called
  out in the PR when the linter flags them.
- **Persistence** under `${APP_DATA_DIR}/data/...` with committed `.gitkeep`
  scaffolding (not a bare `${APP_DATA_DIR}` mount, which is a linter error).
- `restart: on-failure` on long-running services; the one-shot bootstrap is
  the only service without it.

`exports.sh` (ours, unchanged in shape) does one job: translate the dependency
node's network into the names our own services speak
(`APP_BITCOIN_NETWORK` → `CLN_NET`/`DEPOOL_CHAIN_NETWORK`), using
`EXPORTS_APP_*` for our own paths as the skill requires.

---

## 4 · The description a reviewer reads

Our current description, re-ordered so the first-run facts are first, and
with the claim link stated as a step rather than a footnote:

> Mine Bitcoin with your own node, no pool in the middle. This app runs a
> Stratum endpoint for your ASIC, the depool sharechain daemon, a local share
> relay, and the Lightning wallet your payouts land in.
>
> IT USES YOUR BITCOIN NODE. This app has no chain of its own: it requires
> the Bitcoin Node app and reads block templates from it (getblocktemplate),
> so there is no second copy of the blockchain and nothing to sync twice. A
> pruned node is fine — mining only needs the tip.
>
> SET-UP. Install Bitcoin Node first (Umbrel asks you to), then open this app.
> Its page shows the node's live status and the exact pool URL to type into
> your ASIC — this box's address on port 23333. Claim the box on the Mine page
> at hashoid.io. Your shares are signed by this node, and payouts settle over
> Lightning to your own wallet.

Tagline: `Mine with your own node — no pool in the middle` (no length limit
exists; the store card clamps to two lines, so this stays short on purpose).

---

## 5 · The screenshot the reviewer must see

Their rule: screenshots live in the **PR body**, and the app "must open to a
useful web UI, setup page, or status/connection page … without SSH, CLI
access, log scraping, or manual file edits".

Attachment for the PR body, from the umbrelOS rig (published images, not a
mock): `proof/v0.2.9-umbrelos-app-proxy.png` — the app open through
umbrelOS's own app_proxy, showing:

- the node's live status (chain height, peers, share relay, Lightning),
- **"Point your miner here — umbrel.local:23333"** with the three steps,
- the box's own npub and the **hashoid.io/mine** claim link.

A second attachment is the honest one and should go in too:
`proof/v0.2.9-umbrelos-cln-silent.png` — the same page with a source really
silent, reading **unknown** rather than claiming a failure. It shows the page
does not lie about the box.

Logo reference for the PR body: `depool-node.svg` (source file, not
committed) — "include screenshots and a logo reference. Umbrel will create
the final App Store gallery assets." Final assets are 16:10 (2160x1350 on
`bitcoin`, 2880x1800 on `immich`) — observed from their gallery, not a
written rule.

---

## 6 · The gate we run before asking anyone to review

Their CI (`lint-apps.mjs`, network on):

```sh
npm run lint:apps -- depool-node --check-images
git diff --check
```

It enforces: the top-level path is an app package, every required manifest
field, the ten-value `category` enum, the `id` charset, port range +
uniqueness, `releaseNotes: ""` for new apps, `gallery: []` warning, images
public + tag@digest + multi-arch, and no Docker socket.

Ours, already green (run it again in the fork before the PR):

```sh
node tests/validate.js          # 101/101 — pins, no docker.sock, no bitcoind, network mapping
```

Plus, to say so honestly in the PR: the app was installed and opened **inside
umbrelOS** through `app_proxy`, on the published images, with the readings in
§5 (and the dependency path exercised against both a regtest and a mainnet
node).

---

## 7 · Open questions — answer before this is sent

1. **`submission:` is chicken-and-egg** — it wants the PR URL, which does not
   exist until the PR does. Their own `bitcoin/umbrel-app.yml` passes with a
   *commit* URL. Proposed: open the PR with our commit URL, then amend to the
   PR URL (or leave the commit URL and explain in the body).
2. **`version`**: package version `0.2.9`, or the short commit SHA of the
   depool tree the images were built from?
3. **`submitter`**: what name should appear in the store metadata — "Depool",
   "Hashoid", or a person?
4. **The relay**: the daemon publishes to `wss://relay.hashoid.io/ws/` — an
   external service of ours. It is the product (that is what makes the box
   part of the pool), but a reviewer may read it as an external dependency.
   Proposed wording for the PR body: state it plainly, with the /ws/ door and
   the fact that an unreachable relay reads UNKNOWN, never a false claim.
5. **The claim step**: `hashoid.io/mine` is how a box becomes a miner with
   payouts. Worth stating in the PR body as a required first-run step, in the
   same breath as the setup notes.
6. **Host ports to declare**: 23333 (Stratum, raw) and 127.0.0.1:2085 (relay,
   loopback-only). Confirm we keep both in the submission compose.

Nothing here goes anywhere until Damon says go.
