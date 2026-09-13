# Depool Node's own exports for its compose. Sourced by umbrelOS AFTER its
# dependencies' exports.sh (see app-script: the app itself is appended to the
# list it sources), so APP_BITCOIN_* is already in scope here.
#
# ⚠ THE APP MUST FOLLOW THE NODE'S NETWORK (found on the rig, 2026-09-13): the
# compose used to say `--network=bitcoin` outright. On a mainnet install that
# is invisible; against ANY other node (the rig's regtest, a testnet one) CLN
# refuses to start — "Wrong network! Our Bitcoin backend is running on
# 'regtest', but we expect 'main'" — and the crash cascades: CLN never mints
# an on-chain address, the control sidecar has none to publish, and the lined
# daemon refuses to boot without one.
#
# CLN names mainnet differently than Core does ("bitcoin", not "mainnet"), so
# the mapping lives here, in one place, where both vocabularies are visible.
case "${APP_BITCOIN_NETWORK:-mainnet}" in
  mainnet) EXPORTED_CLN_NET="bitcoin" ;;
  "")      EXPORTED_CLN_NET="bitcoin" ;;
  *)       EXPORTED_CLN_NET="${APP_BITCOIN_NETWORK}" ;;
esac
export CLN_NET="${EXPORTED_CLN_NET}"
# the network the box is mining on, for control's status and the page
export DEPOOL_CHAIN_NETWORK="${APP_BITCOIN_NETWORK:-mainnet}"
