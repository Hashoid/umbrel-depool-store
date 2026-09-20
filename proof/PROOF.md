# The app in umbrelOS — what these shots are, and what they are NOT

Answer for uniMaster, rebuilt 2026-09-13 for the **liveness ruling** (no docker
in the app's liveness path; unknown rather than "starting…" forever).

## The proof line

- **URL the app opens to:** `http://umbrel.local:2000/?origin=…&app=depool-node&path=/`
  — umbrelOS's own proxy for the app, landing on control's page
  (`control:28700/`, the `app_proxy` target). Opened here as a user opens it:
  the dashboard at `http://umbrel.local:8082/`, then the app.
- **Screenshots** (all from app **0.2.9**, the published images, pulled by
  umbrelOS in this rig):
  - `v0.2.9-umbrelos-app-proxy.png` — the page through the proxy, everything
    genuinely live: header **running**, chain **5 blocks**, share relay
    **connected**, the box's own identity, `umbrel.local:23333`, and the
    `hashoid.io/mine` link.
  - `v0.2.9-umbrelos-cln-silent.png` — the same page with CLN's container
    **really stopped**: header **unknown**, the lightning row `—`, chain and
    relay still green. The box is unreadable, not broken — and the page says
    so instead of crying "not connected".
  - `v0.2.5-umbrelos-*` — the earlier pair, kept for the app_proxy trail.
- Console errors: none, on every page above.

## WHAT THIS DOES NOT CLAIM

**The chain is not real.** This rig is a dev-only community store
(public, unlisted) whose app deliberately uses the id
`bitcoin` and runs a **regtest** bitcoind. It proves the app_proxy/umbreld path
— install, dependency resolution, the page opening inside umbrelOS, and the
page's readings — and nothing about mainnet.

## The id trick: it does NOT work — one line

**Installing app id `bitcoin` resolved to the OFFICIAL Bitcoin Node app, not
the rig's** — umbrelOS resolves a dependency by app id over registry order and
the official store wins; `appStore.removeRepository` on the default store
answers "Cannot remove default repository", so no store can be put ahead of it.

The working fallback (what the shots use): the **official** Bitcoin Node app as
the dependency, set to regtest through its own
`${APP_DATA_DIR}/data/app/settings.json` = `{"chain":"regtest"}`, with the
depool app's `exports.sh` mapping the app-exposed network name to CLN's
(`APP_BITCOIN_NETWORK=regtest` → `CLN_NET=regtest`).

## Found by this rig (and fixed)

Running the published app inside umbrelOS is what caught these — none were
visible from the dev stack:

1. **The app followed a hardcoded mainnet** — CLN refused to start
   (`our Bitcoin backend is running on 'regtest', but we expect 'main'`).
   Fixed in 0.2.4.
2. **control spoke HTTP at CLN's unix socket** — CLN answers raw
   newline-delimited JSON-RPC 2.0, so every socket call died as
   "Expected HTTP/"; and `newaddr` takes **positional** arguments, not the
   fork's named form. That rail is the only one a box has on umbrelOS (no
   Docker socket), so the payout address was never minted and the lined daemon
   crash-looped on `SELF_PAYOUT_ADDR`. Fixed in 0.2.5 (mod-btc `1fd100f`).
3. **The page derived its liveness from `docker compose ps`** — which can
   never answer on umbrelOS, so a real box read "starting…" and "Share relay:
   not connected" forever. Fixed in 0.2.6: each source answers for itself
   (node RPC, CLN socket, the daemon's `/data/status.json`, a WS handshake at
   the relay the daemon is configured with), and the readings are
   three-valued — `null` is UNKNOWN, never "down".
4. **The app's relay URL had no `/ws/`** — `wss://relay.hashoid.io` answers
   HTTP 200 from the site's nginx, not a websocket upgrade (the daemon's own
   client, from inside the box: bare root → "Unexpected server response:
   200", `/ws/` → OPEN). Fixed in 0.2.7, and in every shipped default
   (mod-btc `168ec8b`).
5. **A wrong URL is not a dead relay** — a non-websocket answer now reads
   UNKNOWN, not "not connected" (0.2.8), and the identity row reads the
   daemon's npub instead of claiming "minting…" forever (0.2.9).

Gates: mod-btc `stack-control-test` **75/75** (registered in TEST-MANIFEST),
store `tests/validate.js` **101/101**. Every liveness arm is driven in the gate
with `DOCKER_SOCK` pointed at a path that does not exist — the umbrelOS
condition — so a real box and the rig read the same way.
