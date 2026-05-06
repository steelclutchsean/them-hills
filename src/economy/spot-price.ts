// Real-time gold spot price service.
//
// Source: CoinGecko's free public API, querying PAXG (Pax Gold) — an ERC-20
// token backed 1:1 with one troy ounce of London-market gold. Its USD price
// tracks the live spot price within a fraction of a percent and the endpoint
// is CORS-enabled, key-less, and rate-limited generously enough that our
// 15-minute refresh cadence stays well under the free-tier ceiling.
//
//   GET https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd
//   → {"pax-gold":{"usd":2671.45}}
//
// Fallback ladder: live → cached (last successful fetch from save state) →
// baseline ($2,500/ozt hardcoded). Game loop never blocks on the network.
//
// When v1+ adds a server proxy, the API key (if we ever switch to a paid
// provider) moves server-side; this module's interface stays identical.

const ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd';
const REFRESH_MS = 15 * 60 * 1000;

// Sanity bounds. Spot is currently around $2.5–3k/ozt; if the API returns
// nonsense (zero, negative, multi-million) we treat the response as failed.
const MIN_PLAUSIBLE_PRICE = 100;
const MAX_PLAUSIBLE_PRICE = 100_000;

export type SpotPriceSource = 'live' | 'cached' | 'baseline';

export interface SpotPriceUpdate {
  price: number;
  source: SpotPriceSource;
  fetchedAt: number;
}

export interface SpotPriceServiceOpts {
  /** Hard fallback if both live and cached are unavailable. */
  baseline: number;
  /** Last successful price from save state, if any. */
  initialCurrent?: number;
  /** Epoch ms when initialCurrent was fetched. */
  initialFetchedAt?: number;
  /** Optional clamp: if set, fetched prices outside this range are pulled in. */
  sessionCap?: { min: number; max: number };
  /** Called whenever the price changes (live fetch or fallback transition). */
  onUpdate?: (update: SpotPriceUpdate) => void;
}

export interface SpotPriceService {
  start(): void;
  stop(): void;
  /** Force an immediate fetch outside the regular cadence. */
  refresh(): Promise<void>;
  current(): number;
  source(): SpotPriceSource;
  lastFetchedAt(): number;
}

export async function fetchSpotPrice(): Promise<number | null> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[spot-price] HTTP ${res.status} from CoinGecko`);
      return null;
    }
    const data = (await res.json()) as { 'pax-gold'?: { usd?: number } };
    const price = data?.['pax-gold']?.usd;
    if (typeof price !== 'number' || price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) {
      console.warn('[spot-price] implausible response', data);
      return null;
    }
    return price;
  } catch (e) {
    console.warn('[spot-price] fetch failed', e);
    return null;
  }
}

export function createSpotPriceService(opts: SpotPriceServiceOpts): SpotPriceService {
  // Initial state is determined by what the save brings in.
  let price = opts.initialCurrent ?? opts.baseline;
  let source: SpotPriceSource =
    opts.initialCurrent !== undefined && opts.initialCurrent !== opts.baseline
      ? 'cached'
      : 'baseline';
  let fetchedAt = opts.initialFetchedAt ?? 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const clampToCap = (p: number): number => {
    if (!opts.sessionCap) return p;
    return Math.max(opts.sessionCap.min, Math.min(opts.sessionCap.max, p));
  };

  const emit = (): void => {
    opts.onUpdate?.({ price, source, fetchedAt });
  };

  async function tick(): Promise<void> {
    const fetched = await fetchSpotPrice();
    if (fetched === null) {
      // Keep current value — degraded mode. If we never had a live fetch and
      // initial was baseline, we stay on baseline silently.
      return;
    }
    price = clampToCap(fetched);
    source = 'live';
    fetchedAt = Date.now();
    emit();
  }

  return {
    start() {
      if (timer !== null) return;
      void tick();
      timer = setInterval(tick, REFRESH_MS);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    refresh: tick,
    current: () => price,
    source: () => source,
    lastFetchedAt: () => fetchedAt,
  };
}
