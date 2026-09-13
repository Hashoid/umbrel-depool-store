# The app in umbrelOS — what these shots are, and what they are NOT

Answer for uniMaster (2026-09-13). The bar was: the app must OPEN to a real
page on umbrelOS, not to the JSON `app_proxy` used to land on.

## The proof line

- **URL the app opens to:** `http://umbrel.local:2000/?origin=…&app=depool-node&path=/`
  — umbrelOS's own proxy for the app, which lands on control's page
  (`control:28700/`, the `app_proxy` target). Opened here as a user opens it:
  the dashboard at `http://umbrel.local:8082/`, then the app.
- **Screenshots:** `v0.2.5-umbrelos-app-proxy.png` (the page itself, taken
  through the proxy) and `v0.2.5-umbrelos-dashboard.png` (the umbrelOS
  dashboard with Depool Node installed). Both from app **0.2.5**, the
  published images — pulled from ghcr by umbrelOS in this rig.
- Console errors: none, on both pages.

What the page carries, from the shot: the node's own status (chain, peers,
share relay, lightning payouts), **"Point your miner here — `umbrel.local:23333`"**,
the worker-name/password line, the coinbase-payout line, and the
**`hashoid.io/mine`** claim link.

## WHAT THIS DOES NOT CLAIM

**The chain is not real.** This rig is a dev-only community store
(`lstgms9/umbrel-btc-rig`, public, unlisted) whose app deliberately uses the id
`bitcoin` and runs a **regtest** bitcoind. It proves the app_proxy/umbreld path
— install, dependency resolution, the page opening inside umbrelOS — and
nothing about mainnet. The app's dependency here is a real Bitcoin Node app on
regtest, not the depool chain.

## The id trick: it does NOT work — one line

**Installing app id `bitcoin` resolved to the OFFICIAL Bitcoin Node app, not
the rig's** — umbrelOS resolves a dependency by app id over registry order and
the official store wins; `appStore.removeRepository` on the default store
answers "Cannot remove default repository", so no store can be put ahead of it.

The working fallback (what the shots above use): the **official** Bitcoin Node
app as the dependency, set to regtest through its own
`${APP_DATA_DIR}/data/app/settings.json` = `{"chain":"regtest"}`, with the
depool app's `exports.sh` mapping the app-exposed network name to CLN's
(`APP_BITCOIN_NETWORK=regtest` → `CLN_NET=regtest`).

## Found by this rig (and fixed)

Running the published app inside umbrelOS is what caught these — neither was
visible from the dev stack:

1. **The app followed a hardcoded mainnet** — CLN refused to start
   (`our Bitcoin backend is running on 'regtest', but we expect 'main'`).
   Fixed in 0.2.4: the app's `exports.sh` publishes the network of the node it
   was actually wired to.
2. **control spoke HTTP at CLN's unix socket** — CLN answers raw
   newline-delimited JSON-RPC 2.0, so every socket call died as
   "Expected HTTP/"; and `newaddr` takes **positional** arguments, not the
   fork's named form. That rail is the only one a box has on umbrelOS (no
   Docker socket), so the payout address was never minted and the lined daemon
   crash-looped on `SELF_PAYOUT_ADDR`. Fixed in 0.2.5 (mod-btc `1fd100f`),
   gate in `stack-control-test` (60/60): a fake CLN on a real unix socket.

Verified on the published 0.2.5 in this rig: the crash-loop is gone (sharechaind
up, `boot: bitcoin on … payout bcrt1qkzv8… (POOL: closes windows)`) and control
read CLN over the socket (`lnSats`/`lnChannels` went null → 0).
