// validate.js — the depool Umbrel app-store structure gate.
//   node tests/validate.js
// Zero-dependency: line-based YAML assertions, no parser. Enforces the
// umbrelOS rules that matter (read from umbreld's source), the v0.2.0
// MAINNET-FIRST contract (no regtest, no fork, network tag "bitcoin"),
// and the regtest overlay's containment (it must never touch the pool
// relay or the live network tag).
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (detail ? ' — ' + detail : '')); }
}

const store = R('umbrel-app-store.yml');
const app = R('depool-node/umbrel-app.yml');
const compose = R('depool-node/docker-compose.yml');
const overlay = R('depool-node/docker-compose.regtest.yml');
const lock = JSON.parse(R('release/images-lock.json'));

// ── store + manifest shape (umbrel community app store contract) ──
t('store declares id: depool', /id:\s*"depool"/.test(store));
const appId = (/\nid:\s*(\S+)/.exec(app) || [])[1];
t('app id starts with the store id (umbrel rule)', appId === 'depool-node', appId);
t('folder name matches the app id', fs.existsSync(path.join(__dirname, '..', appId)));
// ⚠ the VERSION LITERAL is not asserted here on purpose: the release workflow
// rewrites the lock + compose pins from the tag it was dispatched with, so a
// hardcoded "version: 0.2.2" made every bump a red gate for the wrong reason.
// The real contract — the app version IS the tag the images carry — is the
// lock comparison below.
for (const f of ['manifestVersion: 1', 'tagline:', 'description:', 'developer:', 'website:', 'repo:', 'port:', 'category: bitcoin']) {
  t('umbrel-app.yml has ' + f.replace(/:$/, ''), app.includes(f));
}
t('manifest port is the control API (28700)', /port:\s*28700/.test(app));
t('manifest declares a semantic version', /^version:\s*\d+\.\d+\.\d+\s*$/m.test(app), (/^version:.*$/m.exec(app) || [''])[0]);
t('icon exists', fs.existsSync(path.join(__dirname, '..', appId, appId + '.svg')));
t('gallery shot exists', fs.existsSync(path.join(__dirname, '..', appId, '1.jpg')));
t('tagline is the no-pool-in-the-middle line', app.includes('no pool in the middle'));
t('description states the pruned-chain footprint', /pruned/i.test(app));

// ── MAINNET-FIRST: no fork, no regtest, no blake2b anywhere user-facing ──
// scan the LIVE text (comment lines stripped — the header history stays)
const live = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
for (const [name, text] of [['manifest', app], ['app compose', live(compose)]]) {
  t(name + ' never mentions the fork or blake2b', !/blake2b|bip110|forkd/i.test(text));
  t(name + ' never runs regtest', !/-regtest|bcrt1|"regtest"/.test(text));
}
t('description does not sell a separate settlement chain', !/separate .*chain/i.test(app));
t('releaseNotes mention arm64', /arm64/i.test(app));

// ── images: registry we control, every one pinned tag@sha256 (store rule) ──
t('no build: contexts (umbrel pulls, never builds)', !/^(\s*)build:/m.test(compose));
const images = [...compose.matchAll(/^\s+image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
for (const img of images) {
  // the official store's rule: tag AND digest, together, and the digest is the
  // MANIFEST LIST so an arm64 pull resolves through it
  const ok = /^ghcr\.io\/hashoid\/depool-[a-z0-9-]+:v[0-9.]+@sha256:[0-9a-f]{64}$/.test(img);
  t('image allowed + pinned tag@sha256: ' + img, ok);
  const m = /ghcr\.io\/hashoid\/(depool-[a-z0-9-]+):([^@]+)@(sha256:[0-9a-f]{64})/.exec(img);
  if (m) t('image is in the lock: ' + m[1], lock[m[1]] && lock[m[1]].tag === m[2] && lock[m[1]].digest === m[3]);
}
// ⚠ NO CHAIN IMAGE HERE (Damon 2026-09-13): the chain is the user's Bitcoin
// Node app, a DEPENDENCY. Six of ours, no second bitcoin node.
t('six depool image lines, five images, NO bundled bitcoin node',
  images.length === 6 && new Set(images).size === 5 && !/bitcoin\/bitcoin/.test(compose), images.join(' '));

// ── the release workflow must build from sources that still exist ──
// ⚠ v0.2.2 (2026-09-13): the v0.2.1 image never built — the workflow still
// pointed at bundle/stack/sharechaind and bundle/stack/stratum, paths that
// stopped existing when the stack code consolidated into mod-depool
// (2026-09-06). The failure only surfaced when someone asked for a rebuild,
// which is exactly the wrong time to find out. Stack sources live in the
// modules tree now, so that is the only place the workflow may look.
{
  const ci = R('.github/workflows/release.yml');
  const lines = [...ci.matchAll(/bx -f (\S+)/g)].map((m) => m[1]);
  t('the workflow builds the six images', lines.length === 6, lines.join(' '));
  // the bundle's stack/ is mod-btc's stack/ and its modules/ is the module
  // checkouts — both are siblings on a platform checkout, so the workflow's
  // sources can be checked against the trees that produce them. A path that
  // moved (stack/sharechaind did) fails HERE instead of in a release run.
  const MODS = path.join(__dirname, '..', '..');
  for (const p of lines) {
    if (p.startsWith('release/')) {
      t('build source exists in this repo: ' + p, fs.existsSync(path.join(__dirname, '..', p)));
    } else if (/^bundle\/stack\//.test(p)) {
      const src = path.join(MODS, 'mod-btc', p.slice('bundle/'.length));
      t('build source still exists in mod-btc: ' + p, !fs.existsSync(path.join(MODS, 'mod-btc')) || fs.existsSync(src), src + ' is gone — the stack code may have moved to the modules tree');
    } else {
      const src = path.join(MODS, p.slice('bundle/modules/'.length));
      t('build source is in the modules tree: ' + p, /^bundle\/modules\/mod-depool\/stack\//.test(p) && (!fs.existsSync(MODS) || fs.existsSync(src)), src);
    }
  }
}

// ── nofile: every service that can hold a socket carries the raised limit ──
// ⚠ v0.2.2 (2026-09-13): Docker's default soft nofile is 1024, and this stack
// spends one fd per reader. The rehearsal lane's relay hit EMFILE exactly that
// way (69k 'Too many open files' in 24h), dropped readers mid-page, and the
// truncated bead set that produced is what the money side then had to learn to
// refuse. A home box with a few hundred peers gets the same 1024 — so the app
// ships the protection the lane had to learn. soft = hard: nothing to raise at
// runtime, and a container that cannot get it fails loudly at start.
{
  const blocks = compose.split(/\n(?=  [a-z][a-z0-9_-]*:\n)/).slice(1);
  const withImage = blocks.filter((b) => /^\s+image:/m.test(b));
  const named = (b) => b.split(':')[0].trim();
  t('every service with an image carries ulimits (' + withImage.length + ' services)',
    withImage.length === 6,
    withImage.map(named).join(','));
  t('…and every one of them is nofile soft=hard=524288 (not the Docker default 1024)',
    withImage.every((b) => /ulimits:\n\s+nofile:\n\s+soft: 524288\n\s+hard: 524288/.test(b)),
    withImage.filter((b) => !/ulimits:\n\s+nofile:\n\s+soft: 524288\n\s+hard: 524288/.test(b)).map(named).join(','));
  t('the overlay does not silently unset it (it adds a service, never overrides ulimits)',
    !/ulimits/.test(overlay));
}

// ── the app version IS the lock's version (what ships exists on the registry) ─
{
  const appVer = 'v' + (/^version:\s*(\S+)/m.exec(app) || [])[1];
  const lockTags = [...new Set(Object.values(lock).map((l) => l.tag))];
  // ⚠ the app version may run AHEAD of the image tag: the app dir carries
// store-side fixes (the network mapping below) that need no new image. What
// must never happen is a LOCK whose entries disagree — that is a half-released
// app — or an app older than the images it pins.
const semver = (v) => String(v).replace('v', '').split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
t('every lock entry carries the SAME image tag', lockTags.length === 1, lockTags.join(','));
t('the app version is not older than the images it pins (' + appVer + ' >= ' + lockTags[0] + ')',
    cmp(appVer, lockTags[0]) >= 0, 'app ' + appVer + ' vs lock ' + lockTags.join(','));
}
for (const name of Object.keys(lock)) {
  // bootstrap is overlay-only (the mainnet app has no bootstrap service) —
  // its pin lives in the regtest overlay, everything else in the app compose
  const target = name === 'depool-bootstrap' ? overlay : compose;
  t('lock entry pinned: ' + name, new RegExp('ghcr\\.io/hashoid/' + name + ':' + lock[name].tag).test(target));
}
t('lock carries six images', Object.keys(lock).length === 6);

// ── umbreld validation rules (from umbreld app.ts) ──
// every app-data bind stays under ${APP_DATA_DIR}/data; only the docker
// socket may bind outside it
const badBinds = [...compose.matchAll(/^\s+-\s+(\$\{APP_DATA_DIR\}\S*):/gm)]
  .map((m) => m[1]).filter((s) => !s.startsWith('${APP_DATA_DIR}/data/'));
t('no APP_DATA_DIR bind escapes data/ (umbreld rejects)', badBinds.length === 0, badBinds.join(' '));
// ⚠ THE HOST DOCKER SOCKET MUST NOT BE MOUNTED (umbrelOS forbids it: "host
// Docker socket access is effectively host-root access"). Control reaches the
// chain over RPC and CLN over its own socket instead.
t('no host Docker socket anywhere', !/docker\.sock/.test(live(compose)));

// ── THE CHAIN IS THE USER'S BITCOIN NODE (Damon's ruling, 2026-09-13) ──
t('the manifest depends on the bitcoin app', /^dependencies:\n\s+- bitcoin$/m.test(app));
t('no bitcoind service is bundled', !/^  bitcoind:/m.test(compose));
t('every chain rail points at the dependency node contract',
  /CHAIN_RPC:\s*http:\/\/\$\{APP_BITCOIN_NODE_IP\}:\$\{APP_BITCOIN_RPC_PORT\}/.test(compose) &&
  /CHAIN_RPC_USER:\s*\$\{APP_BITCOIN_RPC_USER\}/.test(compose) &&
  /CHAIN_RPC_PASS:\s*\$\{APP_BITCOIN_RPC_PASS\}/.test(compose));
t('the dependency node\'s datadir is mounted read-only (its own contract)',
  /\$\{APP_BITCOIN_DATA_DIR\}:\/home\/bitcoin\/\.bitcoin:ro/.test(compose));
// ⚠ THE NODE'S NETWORK DECIDES CLN'S NETWORK (rig finding, 2026-09-13): the
// compose used to say --network=bitcoin outright, so against a regtest node
// CLN died with "Wrong network! ... we expect 'main'" and everything
// downstream of it (the payout address, the daemon) went with it. The mapping
// lives in the app's own exports.sh, sourced by umbrelOS after the dependency's.
{
  const exp = R('depool-node/exports.sh');
  t('the app ships an exports.sh (umbrelOS sources it after the dependency\'s)', /APP_BITCOIN_NETWORK/.test(exp));
  t('…and it maps the NODE network into the CLN vocabulary (mainnet to bitcoin)',
    /mainnet\)\s*EXPORTED_CLN_NET="bitcoin"/.test(exp) || /mainnet\)\s*EXPORTED_CLN_NET=\"bitcoin\"/.test(exp));
  t('…so CLN is never pinned to one network in the compose',
    /--network=\$\{CLN_NET:-bitcoin\}/.test(compose) && !/--network=bitcoin\b/.test(live(compose)));
}
t('CLN talks to that node (rpc connect, user and password from the contract)',
  /--bitcoin-rpcconnect=\$\{APP_BITCOIN_NODE_IP\}/.test(compose) &&
  /--bitcoin-rpcuser=\$\{APP_BITCOIN_RPC_USER\}/.test(compose));
t('no bootstrap service in the app (mainnet onboarding = user deposits)', !/^  bootstrap:/m.test(compose));

// ── sharechaind: the tenant bundle values with the bitcoin network tag ──
const sc = compose.indexOf('sharechaind:');
const shareBlock = compose.slice(sc, compose.indexOf('control:'));
t('sharechaind is a NODE role (the ASIC does the hashing)', /DEPOOL_GRIND:\s*"0"/.test(shareBlock));
// ⚠ THE BUILDER ROLE AND THE PAYOUT ADDRESS (uniMaster ruling 2026-09-13):
// the daemon closes a window ONLY when LINE_BUILD=1 — without it a box mints
// beads forever and NEVER finds a block, so no payout ever happens; and it
// refuses to boot at all without SELF_PAYOUT_ADDR, which no compose can know
// (it is minted at runtime from the box's own CLN wallet, and the sidecar
// writes it to the shared /data dir — umbrelOS gives it no Docker socket to
// hand a running container a new env, so the file is the only wire here).
t('the daemon IS the builder — it closes windows on this box (LINE_BUILD=1)',
  /LINE_BUILD:\s*"1"/.test(shareBlock));
t('the settlement address is declared and user-overridable', /SELF_PAYOUT_ADDR:\s*\$\{SELF_PAYOUT_ADDR:-\}/.test(shareBlock));
t('…and the sidecar can publish it: the data volume it writes is the daemon\'s /data',
  /\$\{APP_DATA_DIR\}\/data\/miner:\/data/.test(compose));
t('sharechaind publishes to the pool relay', /RELAYS:\s*wss:\/\/relay\.hashoid\.io/.test(shareBlock));
t('sharechaind on the BITCOIN network tag (spec default)', /NETWORK:\s*bitcoin/.test(shareBlock));
t('sharechaind speaks plain sha256d (no fork binding)', /CHAIN_KIND:\s*sha256d/.test(shareBlock));
t('CLN rpc paths follow the network dir (bitcoin by default, else the node network)',
  /CLN_RPC:\s*\/run\/cln\/\$\{CLN_NET:-bitcoin\}\/lightning-rpc/.test(shareBlock));
// ⚠ 3333 is taken in the official store's host-port space (bleskomat-server),
// so the HOST side moves; the container keeps its own listener.
t('stratum is the LAN endpoint on 23333 (host) → 3333 (container)', /0\.0\.0\.0:23333:3333/.test(compose));

const ctl = compose.slice(compose.indexOf('control:'), compose.indexOf('# ── stratum'));
t('control targets umbrelOS\'s compose project (app id)', /COMPOSE_PROJECT_NAME:\s*depool-node/.test(ctl));
t('control heartbeats the tenant', /ORIGIN:\s*https:\/\/hashoid\.io/.test(ctl));
t('claim-first pairing via APP_SEED identity', /HARDWARE_ID:\s*hw-umbrel-\$\{APP_SEED\}/.test(ctl));
t('control reaches the dependency node over RPC, not docker exec',
  /CHAIN_RPC_URL:\s*http:\/\/\$\{APP_BITCOIN_NODE_IP\}:\$\{APP_BITCOIN_RPC_PORT\}/.test(ctl) &&
  /CHAIN_RPC_USER:\s*\$\{APP_BITCOIN_RPC_USER\}/.test(ctl) &&
  !/CHAIN_SVC:\s*bitcoind/.test(ctl));
t('control reads CLN through its own mounted socket', /CLN_NET:\s*\$\{CLN_NET:-bitcoin\}/.test(ctl) &&
  /CLN_PAYER_DIR:\s*\/run\/cln/.test(ctl) && /\/run\/cln:\/run\/cln|data\/cln-payer:\/run\/cln/.test(ctl));
t('control tells the page the ASIC host port (23333 on Umbrel)', /STRATUM_PORT:\s*"23333"/.test(ctl));
t('app_proxy routes the umbrelOS Open button to control', /APP_HOST:\s*depool-node_control_1/.test(compose) && /APP_PORT:\s*"28700"/.test(compose));

// ── the regtest overlay: dev-only, ONE sha256d chain, and CONTAINED ──
t('overlay is the SAME stock bitcoind on regtest (one chain, like the app)', !/forkd-blake2b/.test(overlay) && /-regtest/.test(overlay));
t('overlay keeps the service NAME bitcoind (control\'s CHAIN_SVC still lands)', (overlay.match(/^  bitcoind:/m) || []).length === 1);
t('overlay keeps CHAIN_KIND sha256d (no fork anywhere)', /CHAIN_KIND:\s*sha256d/.test(live(compose)) && !/CHAIN_KIND:\s*blake2b/.test(overlay));
t('overlay has the bootstrap one-shot the app dropped', /^  bootstrap:/m.test(overlay));
t('overlay points regtest shares at the LOCAL relay only', /RELAYS:\s*ws:\/\/relay:7777/.test(overlay));
t('overlay uses a throwaway network tag (never the live "bitcoin" cohort)', /NETWORK:\s*depool-umbrel-regtest/.test(overlay));
t('overlay retargets the control rails to regtest', /CLN_NET:\s*regtest/.test(overlay) && /-rpcport=18443/.test(overlay));
t('overlay pins bootstrap BCLI at the regtest chain with creds', /BOOTSTRAP_BCLI_ARGS:.*-rpcconnect=bitcoind.*-rpcpassword=depool/.test(overlay));

// ── release pipeline: multi-arch, bundle-sourced ──
for (const f of ['Dockerfile.sharechaind-umbrel', 'Dockerfile.control-umbrel', 'Dockerfile.cln-umbrel', 'Dockerfile.bootstrap-umbrel']) {
  t('release has ' + f, fs.existsSync(path.join(__dirname, '..', 'release', f)));
}
const ci = R('.github/workflows/release.yml');
const ciLive = live(ci);
t('CI builds both architectures', /linux\/amd64,linux\/arm64/.test(ciLive));
t('CI pushes manifest lists straight from buildx', /--push/.test(ciLive));
t('CI sources from the tenant bundle (no images tarball)', !/images\.tar\.gz/.test(ciLive) && /api\/btc\/stack\/bundle/.test(ciLive));
// control reads power/mode/role from COMPOSE_DIR/.env — umbrelOS never
// writes one, so the node-role values must ride in the control image
const controlEnv = R('release/control.env');
t('control.env bakes the node role (grind off)', /DEPOOL_GRIND=0/.test(controlEnv));
t('control.env is copied to /depool/.env by its Dockerfile',
  /COPY control\.env \/depool\/\.env/.test(R('release/Dockerfile.control-umbrel')));
t('cln wrapper target is env-driven (one image, mainnet + regtest overlay)',
  /BCLI_CONNECT/.test(R('release/Dockerfile.cln-umbrel')));

// ── the getumbrel/umbrel-apps submission artifact ───────────────────────────
// submission/ is a parked copy for Damon to approve, and the rules it must
// meet are THEIRS (getumbrel/umbrel-apps: lint-apps.mjs + the packaging
// skill), not ours — so it is checked here against the rules that differ from
// a community store: gallery [] and releaseNotes "" for a NEW submission, no
// committed image assets, the same services and pinned images as the app we
// actually ship, and no docker socket / build: (both hard errors there).
{
  const SUB = path.join(__dirname, '..', 'submission', 'depool-node');
  const files = fs.existsSync(SUB) ? fs.readdirSync(SUB) : [];
  t('submission: the app dir exists with the two unconditional files',
    files.includes('umbrel-app.yml') && files.includes('docker-compose.yml'), files.join(','));
  t('submission: no committed image assets (Umbrel hosts final assets; the PR body carries them)',
    !files.some((f) => /\.(jpg|jpeg|png|svg|webp)$/i.test(f)), files.join(','));
  const yml = R('submission/depool-node/umbrel-app.yml');
  const req = ['manifestVersion', 'id', 'category', 'name', 'version', 'tagline', 'description', 'releaseNotes',
    'developer', 'website', 'dependencies', 'repo', 'support', 'port', 'gallery', 'path', 'submitter', 'submission'];
  t('submission: manifest carries every required field',
    req.every((k) => new RegExp('^' + k + ':', 'm').test(yml)), req.filter((k) => !new RegExp('^' + k + ':', 'm').test(yml)).join(','));
  t('submission: gallery is [] and releaseNotes is "" (their rules for a NEW app)',
    /^gallery: \[\]/m.test(yml) && /^releaseNotes: ""/m.test(yml));
  t('submission: id matches the directory', /^id: depool-node$/m.test(yml));
  t('submission: no icon (Umbrel hosts it)', !/^icon:/m.test(yml));
  const subCompose = R('submission/depool-node/docker-compose.yml');
  t('submission: no docker socket and no build: (hard errors in their linter)',
    !/docker\.sock/.test(subCompose) && !/^\s+build:/m.test(subCompose));
  const storeImgs = (R('depool-node/docker-compose.yml').match(/image: \S+/g) || []).sort();
  const subImgs = (subCompose.match(/image: \S+/g) || []).sort();
  t('submission: ships the SAME services and pinned images as the app we run',
    JSON.stringify(storeImgs) === JSON.stringify(subImgs), subImgs.length + ' vs ' + storeImgs.length);
  t('submission: every image carries a tag AND a manifest-list digest',
    subImgs.length > 0 && subImgs.every((i) => /:v[0-9.]+@sha256:[0-9a-f]{64}$/.test(i)));
  t('submission: bind-mount sources are committed (.gitkeep)',
    fs.readdirSync(path.join(SUB, 'data')).every((d) => fs.existsSync(path.join(SUB, 'data', d, '.gitkeep'))));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
