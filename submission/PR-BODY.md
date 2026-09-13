# PR body — `Add Depool Node` (DRAFT, do not post)

Target: `getumbrel/umbrel-apps`, branch `master`, one new top-level dir
`depool-node/`. Title: **`Add Depool Node`** (their template's first form).

---

## Type

New app

## App

App ID: `depool-node`
Upstream project: https://github.com/Hashoid/umbrel-depool-store (Depool — https://depool.org)
Version: 0.2.9

## Summary

Depool Node turns an Umbrel into its own Bitcoin mining pool. It runs a
Stratum endpoint for the user's ASIC, a share daemon that builds block
templates from the user's node and submits real blocks to it, and a local
share relay — the box is the pool, so there is no pool wallet between the
miner and the coinbase.

The app has no chain of its own: it depends on the **Bitcoin Node** app and
reads templates over RPC (`getblocktemplate`), so nothing is synced twice and
a pruned node is fine. Payouts go to the address the node declares, straight
from the block's coinbase; the Lightning wallet shown on the page is the
box's own.

## Verification

Umbrel testing performed: installed and opened through umbrelOS's own
`app_proxy` on a local umbrelOS test environment, on the published images
(public ghcr manifests, pulled by umbrelOS during install), with the
dependency satisfied by the Bitcoin Node app running regtest.

Environment tested:
- [x] Local umbrelOS test environment
- [ ] Umbrel device

Architecture tested:
- [x] amd64
- [x] arm64

Known lint warnings or caveats: none expected; the raw Stratum port (below)
is deliberate and is the one thing to look at behind `--check-images`.

**Screenshots attached** (from that umbrelOS run, app 0.2.9 — the published
images, not a mock):

1. The app open through umbrelOS's proxy — the node's live status (chain
   height, peers, share relay, Lightning), **"Point your miner here —
   umbrel.local:23333"**, the box's own identity, and the hashoid.io/mine
   claim link.
2. The same page with a source genuinely silent — the header reads
   **unknown** and the row shows no value rather than claiming a failure.
   Included deliberately: the page is built not to lie about the box.

**Logo reference**: the app's existing square icon (kept in the community
store repo, not committed here) — Umbrel creates the final assets.

## Notes

- **Dependency**: `bitcoin`. The app consumes the canonical `APP_BITCOIN_*`
  contract (`NODE_IP`, `RPC_PORT`, `RPC_USER`, `RPC_PASS`, `NETWORK`, …) and
  maps the node's network into its own services' vocabulary in `exports.sh`
  (mainnet is `bitcoin` to Core and `bitcoin` to CLN; other networks pass
  through). Tested against a regtest node and a mainnet node.
- **Host ports**: `23333/tcp` is the Stratum endpoint — a raw protocol port
  that cannot sit behind `app_proxy`; it is the port the page tells the user
  to type into their ASIC. Everything else is reached over the compose
  network. (`28700` in the manifest is the `app_proxy` port, not a
  container port.)
- **No Docker socket**, no `privileged`, no host mounts beyond
  `${APP_DATA_DIR}/data/...`: the app talks to the dependency node over RPC
  and to its own Lightning node over a unix socket inside the app.
- **Default credentials**: none — there is no login; Umbrel's own app auth
  fronts the page.
- **First-run behaviour**: the page opens immediately and shows what the box
  is doing, including when a service is still coming up (`unknown` is a
  first-class reading — a silent source is never reported as a failure).
- **External service**: the box publishes its shares to the project's relay
  (`wss://relay.hashoid.io/ws/`) and the user claims the box at
  `hashoid.io/mine` if they want payouts tracked to an account. Mining works
  without an account; the claim is what ties the box to a user.
