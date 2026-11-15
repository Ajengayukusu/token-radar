# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Ajengayukusu/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Ajengayukusu/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar: a token launch radar that prices pre-token DeFi protocols with a comparables model built from the snapshot itself — each category's multiple is the median market-cap/TVL of that category's traded protocols, shrunk toward the global median — then ranks a screened board of launch candidates and gives every row a concrete, costed farming plan. Built for make.fun's "Build the best token launch radar" bounty.

## Run it

```sh
node main.ts --input <snapshot.json>
```

The program reads the snapshot (or `/input/snapshot.json` in the grader's container), writes the ranked `board.json`, the dashboard dataset `data.js`, copies `dashboard/` and `screenshots/` into the output directory (`/output`, or `$MAKEFUN_OUTPUT_DIR`), and writes `dossier.json` via the vendored make.fun library. The run is deterministic: the same snapshot produces byte-identical output.

## How the model works

- **Implied value** = TVL × category multiple × growth × maturity × breadth. The category multiple is the snapshot's own median mcap/TVL for traded protocols in that category, shrunk toward the global median by sample size and clamped; growth uses the clamped 7-day TVL change; maturity accrues over five years of tokenless operation; breadth adds a small premium per extra chain. Every multiplier is rounded before use, so the dashboard recomputes each row's implied value to the dollar, and each row carries a confidence grade (A–D) from its comparable count.
- **The board** holds the full watchlist plus early protocols that pass the watchlist's own screen (pre-token, not a CEX, not a wrapped/staked/exchange asset, not a bridge/liquid-staking/restaking category) — 198 rows on the practice snapshot, each with a six-step farm plan generated from its category playbook, with per-chain gas costs, TVL-scaled capital and age-scaled run length.
- **The dashboard** is a dark instrument panel: sortable ranked table, search, category/chain/minimum-implied filters, Watchlist/Early/Live segments, a per-protocol detail drawer showing the model waterfall and the comparables behind the multiple, the full model panel, and a panel accounting for every protocol the screen leaves out.

---

<sub>Entered on [make.fun](https://make.fun/?ref=50v8qgc6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
