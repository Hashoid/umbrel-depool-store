# depool — Umbrel community app store

The depool node as a one-click Umbrel app. The whole UX is one line:

> **Umbrel → Settings → (∔) Add store → paste `https://github.com/Hashoid/umbrel-depool-store` → Install "Depool Node"**

Then:

1. Wait for the node's first sync — full validation of real Bitcoin on a
   pruned chain (~10GB kept, a few days on a Pi). The app's page shows live
   height + peers while it works.
2. Point your ASIC at the Umbrel box's LAN address, **port 23333** (3333 is
   taken by another app in the official store's host-port space).
3. Open **hashoid.io → Mine** — the box shows up unclaimed; name it. It pairs
   through the exact same claim-first flow as a bare-metal install
   (`stack/install.sh`): the box heartbeats the tenant AND registers at enrol,
   mints its npub and its payout address from its own wallet, and payouts
   settle over Lightning.

## v0.3.0 — two containers, the three-piece product

The depool box IS one program: the rig door (stratum), the bead line, the
block builder, the status page and the claim/hello wire are listeners in ONE
process (`modules/mod-depool/box/box.js`). v0.2.x shipped the old shape as six
containers (stratum + sharechaind + control + relay + cln-payer + cln-payee);
three of those images could no longer be built from any source in the tree —
`stack/stratum`, `stack/sharechaind` and `stack/control` all died in the
2026-09-18 whittle — and the ASIC port was published by the dead one. v0.3.0 is
what the plain-Linux box bundle runs:

| piece | what it is |
|---|---|
| your Bitcoin Node (dependency app) | the template source (`getblocktemplate`) for the ASIC's shares, and the Lightning settlement chain. No second copy of the chain is ever downloaded by this app |
| `depool-box` | the box program with the modules tree baked in — ASIC on 23333, page on 28700 (the umbrelOS Open button), beads on the pool relay, blocks submitted straight back to the network |
| `depool-cln` | the miner's wallet: the payout address is minted from it at boot (`listfunds` → `newaddr`) and a BOLT12 offer is published from it, so the provider can pay this box over Lightning |

The claim wire is why v0.3.0 exists: the box registers at enrol
(`POST /api/btc/rigs/hello`) with an `APP_SEED`-derived identity and its
wallet's payout address. Before it, a store box could heartbeat but never be
claimed.

## Mainnet-first

The app mines **real Bitcoin** — the spec reframe (2026-08-31): depool is a
payout-coordination protocol for any SHA-256 Bitcoin, mainnet-first; there is
no depool chain and no fork as product. Concretely:

- **One chain, not two.** The chain is the dependency app's node — both the
  template source (template sovereignty, spec §7.1) and the Lightning
  settlement chain (CLN on the same node).
- **`NETWORK: bitcoin`, `CHAIN_KIND: sha256d`.** The network tag names the
  chain being mined (spec default). No `bip110-blake2b`, no `-regtest`, no
  fork language anywhere user-facing — `tests/validate.js` enforces that.
- **No bootstrap one-shot.** Nothing to fund on mainnet: the user deposits
  real sats when they want the payout rail loaded.

## What the app wraps

`depool-node/docker-compose.yml` wraps the EXISTING stack — the same service
definitions the plain-Linux install runs (`mod-btc/stack/docker-compose.yml`
and `mod-depool/box/`) — flattened, because umbrelOS runs one compose file
with no overlay mechanism. The deltas are only the Umbrel bits:

| Delta | Why |
|---|---|
| images `ghcr.io/hashoid/depool-*` (pinned tag + manifest digest) | umbrelOS pulls, never builds. Multi-arch (amd64 + arm64) |
| volumes → `${APP_DATA_DIR}/data/...` | umbrelOS validates app data lives under `APP_DATA_DIR/data`; uninstall/backup behave |
| `/modules` baked into `depool-box` | an Umbrel box has no platform checkout; CI assembles the SAME tree the tenant bundle ships (`routes.js /stack/bundle`) and copies it onto the canon box image |
| `HARDWARE_ID: hw-umbrel-${APP_SEED}` | umbrelOS exports `APP_SEED` into app compose — deterministic per install, so claim-first pairing works untouched |
| `STATUS_HOST: 0.0.0.0` | the page is reached through umbrelOS's `app_proxy`, which is another container — a loopback bind would be invisible to it. Bare metal keeps it on loopback |
| `CLN_NET` from the app's `exports.sh` | the wallet follows the NODE's network (umbrelOS sources our exports after the dependency's), so a regtest node does not make CLN refuse to start |

## The regtest overlay (dev only)

`depool-node/docker-compose.regtest.yml` ADDS the two services the app takes
from elsewhere — the chain (on Umbrel: the Bitcoin Node dependency app) and the
relay (the app publishes to the pool relay; a throwaway regtest lane must not)
— and retargets the box's rails at them: stock `bitcoind -regtest`, the local
relay under a throwaway network tag, the wallet on regtest. `tests/harness.sh
regtest` drives it. umbrelOS never sees this file and the live `bitcoin` cohort
is never touched.

## What is different on Umbrel (by design)

- **Start / stop / power belong to the umbrelOS UI** — the box has no docker
  socket (umbrelOS forbids mounting it) and no lifecycle endpoints.
- **No `build:` anywhere.** Everything arrives as pinned registry images.
- **The ASIC port is the only LAN-exposed one** (`0.0.0.0:23333`); the page is
  reached through the app proxy on 28700.

## Releasing new images

**CI is the pipeline** (the dev box's fine-grained PAT cannot write ghcr
packages; the workflow's GITHUB_TOKEN can): GitHub → Hashoid/umbrel-depool-store
→ Actions → **release** → Run workflow with the version. Since v0.2.0 there is
no images tarball dependency — buildx builds `linux/amd64` **and**
`linux/arm64` FROM SOURCE (qemu emulates the Pi; strfry's arm64 compile is the
slow step), pushes manifest lists, rewrites the compose pins and commits
`images-lock.json` (manifest-list digests). Inputs: the public tenant bundle
(`ORIGIN/api/btc/stack/bundle`) + this repo's `release/` Dockerfiles.
`depool-relay` is built for the regtest overlay; `bitcoin/bitcoin:29` is
referenced upstream directly (already multi-arch).

**Visibility:** packages pushed by the workflow came out **public** — verified
with an anonymous manifest pull (v0.1.0, 2026-09-05). If a future release lands
private, flip it at github.com/Hashoid?tab=packages → Package settings →
Change visibility.

## Layout

```
umbrel-app-store.yml      store manifest (id: depool)
depool-node/              the app (id must start with the store id)
  umbrel-app.yml          listing shown in the umbrelOS UI
  docker-compose.yml      the wrap — mainnet, see above
  docker-compose.regtest.yml  dev overlay (harness only; umbrelOS never sees it)
  depool-node.svg         app icon
  1.jpg                   gallery shot
release/                  image pipeline (runs in CI)
  Dockerfile.box-umbrel        the canon box image + the baked modules tree
  Dockerfile.cln-umbrel        CLN + env-driven bitcoin-cli wrapper
  images-lock.json        pushed manifest-list digests, the pin source of truth
tests/validate.js         structure gate: node tests/validate.js
tests/harness.sh          dev harness: mainnet leg (default) + regtest leg
submission/               the parked copy for getumbrel/umbrel-apps
```

## Verified how

No Umbrel box in the fleet, so the harness is **dev (Debian) + Docker
simulating umbrelOS's compose conventions** (`tests/harness.sh`): project name
= the app id, `APP_DATA_DIR`/`APP_SEED`/`DEVICE_HOSTNAME` exported as umbreld's
app-script does, images by pinned ghcr tag, one compose file.

- **mainnet leg** (the shipped app, as-is): real mainnet IBD (height grows,
  real peers), the box's page answers on 28700 with live node facts, the rig
  door answers `mining.subscribe` on the LAN port, the wallet socket is reached
  on the node's network dir.
- **regtest leg** (same services + overlay): the box boots on the regtest
  rails, mints its payout address from its own wallet, mints its npub and
  publishes on the throwaway tag.

umbreld's own validation rules (data under `APP_DATA_DIR/data`, `APP_SEED` +
`DEVICE_HOSTNAME` injection, `--project-name <app id>`) were read from
umbreld's source and are enforced by `tests/validate.js`.
Not yet exercised: umbrelOS's app-store installer itself (needs a real
umbrelOS box or VM).
