// Launch Radar's model: one sealed DefiLlama snapshot in, one ranked board of pre-token protocols out.
//
// The question the board answers: if a protocol that records no token issued one today, what would
// the market plausibly pay for it, judged only by the snapshot's own figures? The model never looks
// at a protocol's name to score it. It prices a pre-token protocol the way the snapshot's market
// already prices its traded peers:
//
//   1. Comparables. Every protocol whose token already trades (a market cap is recorded) and that
//      is not an exchange gives one observation of the market's exchange rate between locked value
//      and token value: ratio = mcap_usd / tvl_usd. Grouped by category, the median ratio is what
//      the market currently pays for a dollar of TVL in that line of work.
//   2. Shrinkage. A category with two traded names is weak evidence, so each category median is
//      pulled toward the global median in proportion to its sample size (SHRINK_K pseudo-counts),
//      then clamped to a sane band. A category with no traded peer at all uses the global median,
//      and the row says so: its confidence grade is D.
//   3. Adjustments, all from the row's own record: seven-day TVL growth (momentum), the years the
//      protocol has run with no token (maturity), and how many chains it already reaches (breadth).
//
//   implied = round( tvl_usd x category_multiple x growth_mult x maturity_mult x breadth_mult )
//
// The board is the snapshot's watchlist (every slug, always) plus every other protocol that passes
// the watchlist's own screen without its TVL floor: it records no token, is not an exchange, is not
// a versioned pool of another protocol, is not named as a wrapped, staked or exchange product, and
// is not in a category (bridges, liquid staking, restaking) whose TVL is other protocols' assets.
// Protocols whose token already trades are never ranked; the dashboard sets them aside with the
// market caps the snapshot records, as facts rather than estimates.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can re-run the arithmetic. */
export interface ModelConstants {
  /** Pseudo-count pulling each category median toward the global median. */
  shrink_k: number;
  /** The band a category multiple is clamped to after shrinkage. */
  multiple_floor: number;
  multiple_cap: number;
  /** Seven-day growth is clamped to this band before it moves the value. */
  growth_floor_pct: number;
  growth_cap_pct: number;
  /** How strongly a week of growth moves the implied value. */
  growth_weight: number;
  /** Maturity runs from maturity_base (brand new) toward maturity_base + maturity_span (seasoned). */
  maturity_base: number;
  maturity_span: number;
  /** Days over which maturity accrues in full. */
  maturity_days: number;
  /** Each extra chain beyond the first adds this to the value, up to breadth_steps chains. */
  breadth_step: number;
  breadth_steps: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 8,
  multiple_floor: 0.03,
  multiple_cap: 1.25,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  growth_weight: 0.55,
  maturity_base: 0.55,
  maturity_span: 0.5,
  maturity_days: 1825,
  breadth_step: 0.03,
  breadth_steps: 6,
};

/** The model's version label: the dashboard names it and board rows carry it. */
export const MODEL_VERSION = 'launch-radar-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 48;

/** What the traded market pays for TVL in one category, and how much evidence backs the figure. */
export interface CategoryStat {
  category: string;
  /** Traded protocols in the category with both a market cap and a TVL. */
  comps: number;
  /** Their median mcap/TVL ratio, before shrinkage. */
  median_ratio: number | null;
  /** The 25th and 75th percentile ratios, for the detail view's range. */
  p25_ratio: number | null;
  p75_ratio: number | null;
  /** The multiple the model actually uses: shrunk toward the global median and clamped. */
  multiple: number;
  /** A: 10+ comps, B: 5-9, C: 1-4, D: none, priced off the global median. */
  confidence: 'A' | 'B' | 'C' | 'D';
}

/** One protocol's implied value, with every multiplier that produced it. */
export interface Scored {
  implied: number;
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  /** implied_value_usd / tvl_usd: the multiple of TVL the model claims, for the page's sort. */
  implied_multiple: number;
  model: {
    version: string;
    category_multiple: number;
    comp_count: number;
    comp_median_ratio: number | null;
    confidence: 'A' | 'B' | 'C' | 'D';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
  farm_capital_usd: number;
  farm_weeks: number;
}

/** A live-token protocol: it already trades, so the dashboard shows the market's value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  /** mcap_usd / tvl_usd for the row, the observation it contributes to the comparables. */
  ratio: number | null;
}

/** Everything the dashboard renders, written beside it as data.js. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median_ratio: number;
  unknown_age_days: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  screened_out: { versioned: number; exchange: number; wrapped_or_staked: number; cex_category: number; asset_product: number };
  board_implied_total_usd: number;
  categories: CategoryStat[];
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const bySlugOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, or null for an empty one. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A percentile of a non-empty list by linear interpolation, or null for an empty one. */
function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is one version of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that names a wrapped or staked product of an asset that already trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
/** Names that begin with an exchange's name are that exchange's own products. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Categories whose TVL is mostly other protocols' assets rather than a business of their own:
 * bridges hold the assets they move, liquid staking and restaking hold the assets they stake.
 * The watchlist's own definition sets them aside, and so does this screen: WBTC and USDT0 record
 * no token, but each is a wrapped or bridged product of one that already trades, and neither will
 * ever launch a token of its own.
 */
const ASSET_PRODUCT_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Why the screen keeps a pre-token protocol off the board, or null when it may be ranked. */
export function screenReason(p: SnapshotProtocol): 'versioned' | 'exchange' | 'wrapped_or_staked' | 'cex_category' | 'asset_product' | null {
  if (p.category === 'CEX') return 'cex_category';
  if (p.category !== null && ASSET_PRODUCT_CATEGORIES.has(p.category)) return 'asset_product';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_OR_STAKED.test(p.name)) return 'wrapped_or_staked';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange';
  return null;
}

/**
 * The comparables: what the traded market pays for a dollar of TVL, per category and overall.
 * An observation is a protocol with a recorded market cap and a positive TVL; exchanges are left
 * out, because an exchange token's cap prices the exchange's whole business, not its locked value.
 */
export function categoryStats(snapshot: Snapshot, model: ModelConstants = MODEL): { stats: Map<string, CategoryStat>; globalMedian: number } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const r = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    const key = p.category ?? 'Uncategorised';
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [r]);
    else list.push(r);
    all.push(r);
  }
  const globalMedian = median(all) ?? 0.15;
  const stats = new Map<string, CategoryStat>();
  const build = (category: string, list: number[] | undefined): CategoryStat => {
    const n = list?.length ?? 0;
    const med = list === undefined ? null : median(list);
    const shrunk = med === null ? globalMedian : (n * med + model.shrink_k * globalMedian) / (n + model.shrink_k);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    return {
      category,
      comps: n,
      median_ratio: med === null ? null : round4(med),
      p25_ratio: list === undefined ? null : round4(percentile(list, 0.25) ?? 0),
      p75_ratio: list === undefined ? null : round4(percentile(list, 0.75) ?? 0),
      multiple: round4(multiple),
      confidence: n >= 10 ? 'A' : n >= 5 ? 'B' : n >= 1 ? 'C' : 'D',
    };
  };
  for (const [category, list] of ratios) stats.set(category, build(category, list));
  // Every category a board row can carry gets a stat, even one with no traded peer.
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    if (!stats.has(key)) stats.set(key, build(key, undefined));
  }
  return { stats, globalMedian };
}

/** The age the model assumes when DefiLlama reports no listing day: the median age it does report. */
export function unknownAgeDays(snapshot: Snapshot): number {
  const ages: number[] = [];
  for (const p of snapshot.protocols) {
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a !== null) ages.push(a);
  }
  return Math.round(median(ages) ?? 365);
}

/** Score one pre-token protocol: its implied value and every multiplier behind it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  stat: CategoryStat,
  unknownAge: number,
  model: ModelConstants = MODEL,
): Scored {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, rawGrowth));
  // Each multiplier is rounded to 4 places before it is used, so the dashboard can recompute a
  // row's implied value from the printed multipliers and land on the board's number exactly.
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? unknownAge;
  const maturityMult = round4(model.maturity_base + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_span);
  const breadthMult = round4(1 + model.breadth_step * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_steps));
  const implied = Math.max(1, Math.round(p.tvl_usd * stat.multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    category_multiple: stat.multiple,
    growth_pct: growthPct,
    growth_multiplier: growthMult,
    maturity_multiplier: maturityMult,
    breadth_multiplier: breadthMult,
    age_days: age,
  };
}

// ------------------------------------------------------------------ farm plans

/** Rough mainnet-style gas for one transaction on a chain, in dollars: the plan's cost yardstick. */
const GAS_USD: Readonly<Record<string, number>> = {
  Ethereum: 9, Solana: 0.1, Base: 0.25, Arbitrum: 0.4, Optimism: 0.4, Polygon: 0.1,
  Binance: 0.5, BSC: 0.5, Avalanche: 0.6, Linea: 0.4, Scroll: 0.5, 'zkSync Era': 0.4,
  Mantle: 0.3, Tron: 1.2, Bitcoin: 2.5, 'Hyperliquid L1': 0.2, Monad: 0.3, Plasma: 0.3,
};

/** Gas for one transaction on a chain the table does not name: a cautious dollar. */
function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1;
}

/** A dollar figure with no cents, thousands grouped: $1,250. */
function usd(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** The capital one serious farm position needs, scaled to the protocol's own size. */
function capitalFor(tvl: number): number {
  if (tvl >= 2_000_000_000) return 600;
  if (tvl >= 500_000_000) return 350;
  if (tvl >= 100_000_000) return 200;
  if (tvl >= 25_000_000) return 120;
  return 60;
}

/** How many weeks a position should run, from the protocol's age: younger names need a longer record. */
function weeksFor(age: number | null): number {
  if (age === null) return 8;
  if (age < 180) return 10;
  if (age < 365) return 8;
  if (age < 730) return 6;
  return 5;
}

/** The category's core move and its weekly habit, in words a farmer can follow. */
function playbook(p: SnapshotProtocol): { core: string; weekly: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `supply USDC as collateral in ${n}'s main market, then borrow about 40% of it back and re-supply the borrowed amount once, so both sides of the market carry your address`,
      weekly: 'repay and re-borrow a small slice, or add and withdraw a little collateral, so the position never sits frozen for a full week',
      second: 'open the same supply position in a second market of the protocol (a different collateral or chain) at half the size',
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return {
      core: `provide liquidity to ${n}'s busiest stable or blue-chip pair, in a range wide enough that it stays in range for weeks without daily attention`,
      weekly: 'collect the accrued fees and re-deposit them into the same position, and nudge the range only if the price has left it',
      second: 'add a second, smaller position in the protocol\'s next-busiest pair so your activity is not a single pool',
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `bridge USDC through ${n} to its busiest destination chain and put the bridged funds to work in a lending market or DEX there instead of bridging straight back`,
      weekly: 'bridge a small amount in the other direction, alternating routes and destination chains, so the record shows real use rather than one round trip',
      second: 'repeat the route from a second origin chain if you hold funds on one, at half the size',
    };
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('stake')) {
    return {
      core: `stake the chain's native asset through ${n} and hold the liquid receipt token it issues, then deposit that receipt in one lending market or liquidity pool so it keeps working`,
      weekly: 'claim any staking rewards and restake or re-deposit them, and top the stake up by a small amount',
      second: 'stake a second, smaller tranche and leave it untouched as the long-hold position',
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) {
    return {
      core: `deposit USDC as margin on ${n} and run one small hedged pair (a long and a short of similar size on two liquid markets), so volume accrues without a directional bet`,
      weekly: 'roll the hedge, adjust the two legs back to even size, and let the week\'s trading volume and open interest both register',
      second: 'trade a second market pair at half size once the first hedge has run for two weeks',
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `fund an account on ${n} and take positions in its most liquid markets, on both sides across different questions, sized so no single outcome matters`,
      weekly: 'settle finished markets, claim the proceeds and re-deploy them into new questions',
      second: 'add a small position in a longer-dated market and hold it to settlement',
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('farm') || c.includes('basis')) {
    return {
      core: `deposit USDC into ${n}'s main vault or curated market and keep the vault shares in the same wallet for the whole run`,
      weekly: 'claim whatever the vault distributes and re-deposit it, and shift a small slice between two of the protocol\'s vaults if it runs more than one',
      second: 'enter a second vault with a different risk profile at half the size',
    };
  }
  if (c.includes('stable') || c.includes('wrapper')) {
    return {
      core: `mint ${n}'s stable asset with USDC, or deposit USDC for it, then provide the minted asset to its main liquidity pool or lending market`,
      weekly: 'mint or redeem a small amount and re-balance the pool position so both sides of the product see your address',
      second: 'hold part of the position as the plain minted asset, outside any pool, for the full run',
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `complete any eligibility check ${n} asks for, then mint its yield-bearing asset with USDC and hold it in the farming wallet`,
      weekly: 'accrue a redemption or a small additional mint so the holding period and the balance both grow on the record',
      second: 'deposit part of the minted asset wherever the protocol lists it as collateral, if it lists one',
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `buy cover from ${n} on a position you actually hold, and separately stake a small amount into its underwriting pool if it runs one`,
      weekly: 'renew or extend the cover before it lapses so the policy record has no gap',
      second: 'cover a second position at half the size once the first policy has run a month',
    };
  }
  if (c.includes('chain')) {
    return {
      core: `bridge a working balance onto ${n}'s chain and use its native applications: swap on its main DEX, supply to its main lending market, and keep gas money parked there`,
      weekly: 'make several ordinary transactions on the chain (a swap, a supply, a transfer between your own wallets) so the address reads as a resident, not a visitor',
      second: 'hold a small balance of the chain\'s gas asset for the whole run',
    };
  }
  if (c.includes('index')) {
    return {
      core: `mint ${n}'s index token with USDC and hold it, so the wallet carries a balance through every weekly snapshot`,
      weekly: 'mint or redeem a small amount to keep the position active on the record',
      second: 'provide part of the index token to its liquidity pool if it trades on one',
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      core: `open an account with ${n}, complete its verification, fund it with USDC and route ordinary spending or transfers through it`,
      weekly: 'make at least one real payment or transfer each week, and keep a balance rather than emptying the account',
      second: 'hold a standing balance for the whole run so the account reads as active, not opened and abandoned',
    };
  }
  return {
    core: `deposit USDC into ${n}'s main product and use its core feature once (a position, a mint or a trade), keeping the position in the farming wallet`,
    weekly: 'repeat the core action at small size, or claim and re-deposit what the position earned',
    second: 'open the same position at half size through the protocol\'s second market or chain if it has one',
  };
}

/** A step as one string: the action, then its cost and its time, kept inside the gate's 20..600 characters. */
function stepText(action: string, cost: string, time: string): string {
  let s = `${action} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page each week.`;
  return s;
}

/**
 * A protocol's farm plan: six concrete steps derived from its own record (category, chains, TVL,
 * age), each with what it costs and how long it takes. The same plan is written to board.json and
 * shipped in data.js, so the page shows exactly the plan the board carries.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: string[]; capital: number; weeks: number } {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
  const weeks = weeksFor(age);
  const book = playbook(p);
  const gasWord = (n: number): string => (n < 1 ? `about $${n.toFixed(2)}` : `about $${Math.round(n)}`);
  const steps = [
    stepText(
      `Set up one fresh wallet for ${p.name} alone, back its seed phrase up offline, and fund it on ${chain} with ${usd(capital)} of USDC plus the chain's gas token`,
      `${gasWord(gas * 2)} of gas to fund and approve`,
      '10 minutes, once',
    ),
    stepText(
      `Make the core move on ${chain}: ${book.core}`,
      `${usd(capital)} of capital in the position and ${gasWord(gas * 2)} of gas`,
      '20 minutes to set up',
    ),
    p.chains.length > 1
      ? stepText(
          `Extend to ${p.chains[1]}: bridge ${usd(Math.round(capital / 2))} through the protocol's own route or a listed bridge and ${book.second}`,
          `${usd(Math.round(capital / 2))} of capital and ${gasWord(gas + gasFor(p.chains[1]!))} of gas across both chains`,
          '25 minutes',
        )
      : stepText(
          `Deepen rather than wander: ${book.second}`,
          `${usd(Math.round(capital / 2))} more capital and ${gasWord(gas * 2)} of gas`,
          '15 minutes',
        ),
    stepText(
      `Every week for ${weeks} weeks, ${book.weekly}`,
      `${gasWord(gas)} of gas a week, ${gasWord(gas * weeks)} over the run`,
      `10 minutes a week for ${weeks} weeks`,
    ),
    stepText(
      `Hold the main position untouched for the full ${weeks} weeks so it appears in at least ${weeks} weekly snapshots, and check ${p.name}'s own points or rewards page (only from the link the protocol itself publishes) before changing anything`,
      `the ${usd(capital)} stays in the position; checking costs nothing and a real claim never charges a fee`,
      `${weeks} weeks of holding, 5 minutes a check`,
    ),
    stepText(
      `Keep a farm log (wallet, dates, transaction hashes, balances) and plan the exit before you need it: unwind in the reverse order you entered, and never pay a third party to "unlock" a reward`,
      'nothing but the log; unwinding costs the same gas as entering',
      '10 minutes to set up, 20 minutes to unwind',
    ),
  ];
  return { steps, capital, weeks };
}

// ------------------------------------------------------------------ the board

/** The protocols the board ranks: the whole watchlist, plus every screened pre-token protocol below it. */
export function buildBoard(snapshot: Snapshot, stats: Map<string, CategoryStat>, unknownAge: number, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen: SnapshotProtocol[] = [];
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.push(p);
  }
  for (const p of snapshot.protocols) {
    if (watch.has(p.slug) || !isPreToken(p)) continue;
    if (screenReason(p) !== null) continue;
    chosen.push(p);
  }
  const scored = chosen.map((p) => {
    const stat = stats.get(p.category ?? 'Uncategorised')!;
    const s = impliedValue(p, snapshot.as_of, stat, unknownAge, model);
    return { p, stat, s };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || bySlugOrder(a.p.slug, b.p.slug));
  return scored.map(({ p, stat, s }, i) => {
    const plan = farmPlan(p, s.age_days);
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      token_status: 'pre-token' as const,
      watchlist: watch.has(p.slug),
      age_days: s.age_days,
      implied_value_usd: s.implied,
      implied_multiple: p.tvl_usd > 0 ? round4(s.implied / p.tvl_usd) : 0,
      model: {
        version: MODEL_VERSION,
        category_multiple: stat.multiple,
        comp_count: stat.comps,
        comp_median_ratio: stat.median_ratio,
        confidence: stat.confidence,
        growth_pct: s.growth_pct,
        growth_multiplier: s.growth_multiplier,
        maturity_multiplier: s.maturity_multiplier,
        breadth_multiplier: s.breadth_multiplier,
      },
      farm_steps: plan.steps,
      farm_capital_usd: plan.capital,
      farm_weeks: plan.weeks,
    };
  });
}

/** The live-token protocols, by market cap: the market's own values, set aside from the ranking. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || bySlugOrder(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the entry writes: the board for board.json and the dataset for data.js. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { stats, globalMedian } = categoryStats(snapshot, model);
  const unknownAge = unknownAgeDays(snapshot);
  const board = buildBoard(snapshot, stats, unknownAge, model);
  const live = liveRows(snapshot);
  const screened = { versioned: 0, exchange: 0, wrapped_or_staked: 0, cex_category: 0, asset_product: 0 };
  const watch = new Set(snapshot.watchlist);
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || watch.has(p.slug)) continue;
    const reason = screenReason(p);
    if (reason !== null) screened[reason] += 1;
  }
  const categories = [...stats.values()]
    .filter((s) => board.some((r) => (r.category ?? 'Uncategorised') === s.category))
    .sort((a, b) => b.comps - a.comps || bySlugOrder(a.category, b.category));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median_ratio: round4(globalMedian),
    unknown_age_days: unknownAge,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    screened_out: screened,
    board_implied_total_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    categories,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, shared values, steps, caps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set<string>();
  for (const r of board) {
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
    if (!/^\S{1,128}$/.test(r.slug)) return `slug ${r.slug} is not 1..128 characters without whitespace`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outvalues rank ${byRank[i - 1]!.rank}`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
