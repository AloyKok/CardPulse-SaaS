import type { SnkrdunkMarketCandidate } from '../src/types/domain.js';

type SnkrdunkSearchRow = {
  id: number;
  productNumber?: string;
  name?: string;
  minPrice?: number;
  minPriceFormat?: string;
  listingCount?: string;
  offerCount?: string;
  thumbnailUrl?: string;
};

type SnkrdunkConditionPrice = {
  conditionId?: number;
  conditionName?: string;
  minPrice?: number;
  minPriceFormat?: string;
};

export async function handleSnkrdunkMarket(body: { action?: string; cardNumber?: string; sourceUrl?: string; conditionName?: string }) {
  if (body.action === 'search') {
    const cardNumber = String(body.cardNumber || '').trim().toUpperCase();
    if (!cardNumber) return { status: 400, body: { error: 'cardNumber is required' } };
    return { status: 200, body: { candidates: await searchSnkrdunk(cardNumber) } };
  }

  if (body.action === 'refresh') {
    const sourceUrl = normalizeSnkrdunkCardUrl(String(body.sourceUrl || '').trim());
    if (!sourceUrl) return { status: 400, body: { error: 'invalid SNKRDUNK card URL' } };
    return { status: 200, body: { result: await fetchSnkrdunkDetail(sourceUrl, String(body.conditionName || 'A')) } };
  }

  if (body.action === 'conditions') {
    const sourceUrl = normalizeSnkrdunkCardUrl(String(body.sourceUrl || '').trim());
    if (!sourceUrl) return { status: 400, body: { error: 'invalid SNKRDUNK card URL' } };
    return { status: 200, body: { candidates: await fetchSnkrdunkConditionCandidates(sourceUrl) } };
  }

  return { status: 400, body: { error: 'unknown action' } };
}

async function searchSnkrdunk(cardNumber: string): Promise<SnkrdunkMarketCandidate[]> {
  const url = `https://snkrdunk.com/en/v1/trading-cards?keyword=${encodeURIComponent(cardNumber)}&page=1&perPage=50`;
  const response = await fetch(url, { headers: snkrdunkHeaders('application/json') });
  if (!response.ok) throw new Error(`SNKRDUNK returned ${response.status}`);
  const payload = await response.json() as { tradingCards?: SnkrdunkSearchRow[] };
  const rows = payload.tradingCards || [];
  const exact = rows.filter((row) => row.productNumber?.toUpperCase() === cardNumber || row.name?.toUpperCase().includes(`[${cardNumber}]`));
  const candidates = await Promise.all(exact
    .filter((row) => row.minPrice != null)
    .slice(0, 20)
    .map(rowToCandidates));
  return candidates.flat();
}

async function fetchSnkrdunkDetail(sourceUrl: string, conditionName = 'A'): Promise<SnkrdunkMarketCandidate> {
  const candidates = await fetchSnkrdunkConditionCandidates(sourceUrl);
  const normalizedCondition = conditionName.trim().toUpperCase();
  const selected = candidates.find((candidate) => candidate.conditionName?.trim().toUpperCase() === normalizedCondition)
    || candidates.find((candidate) => candidate.conditionName?.trim().toUpperCase() === 'A')
    || candidates[0];
  if (!selected) throw new Error('SNKRDUNK price not found');
  return selected;
}

async function fetchSnkrdunkConditionCandidates(sourceUrl: string): Promise<SnkrdunkMarketCandidate[]> {
  const html = await fetchHtml(sourceUrl);
  const id = externalIdFromUrl(sourceUrl);
  const title = decodeHtml(textFromMatch(html.match(/<meta name="snkrdunk:title" content="([^"]+)"/i)) || textFromMatch(html.match(/<title>([\s\S]*?)<\/title>/i)) || 'SNKRDUNK card');
  const imageUrl = decodeHtml(textFromMatch(html.match(/<meta property="og:image" content="([^"]+)"/i)) || '');
  const dataLayer = parseDataLayer(html);
  const conditionPrices = id ? await fetchConditionPrices(id) : [];
  const cardNumber = textFromMatch(title.match(/\[([A-Z]{1,4}\d{1,2}-\d{3}|P-\d{3}|EB\d{2}-\d{3})\]/i));
  if (conditionPrices.length > 0) {
    return conditionPrices.map((condition) => conditionToCandidate({
      sourceUrl,
      id,
      title,
      cardNumber,
      imageUrl,
      condition,
      currency: dataLayer.currency || 'SGD'
    }));
  }
  if (dataLayer.price == null || Number.isNaN(dataLayer.price)) throw new Error('SNKRDUNK price not found');
  return [conditionToCandidate({
    sourceUrl,
    id,
    title,
    cardNumber,
    imageUrl,
    condition: { conditionName: 'Default', minPrice: dataLayer.price },
    currency: dataLayer.currency || 'SGD'
  })];
}

async function rowToCandidates(row: SnkrdunkSearchRow): Promise<SnkrdunkMarketCandidate[]> {
  const sourceUrl = `https://snkrdunk.com/en/trading-cards/${row.id}`;
  const displayName = row.name || row.productNumber || `SNKRDUNK ${row.id}`;
  const conditionPrices = await fetchConditionPrices(String(row.id));
  if (conditionPrices.length > 0) {
    return conditionPrices.map((condition) => conditionToCandidate({
      sourceUrl,
      id: String(row.id),
      title: displayName,
      cardNumber: row.productNumber || null,
      imageUrl: row.thumbnailUrl || '',
      condition,
      currency: 'SGD'
    }));
  }
  return [conditionToCandidate({
    sourceUrl,
    id: String(row.id),
    title: displayName,
    cardNumber: row.productNumber || null,
    imageUrl: row.thumbnailUrl || '',
    condition: { conditionName: `${row.listingCount || 0} listings`, minPrice: row.minPrice },
    currency: 'SGD'
  })];
}

function conditionToCandidate({
  sourceUrl,
  id,
  title,
  cardNumber,
  imageUrl,
  condition,
  currency
}: {
  sourceUrl: string;
  id: string | null;
  title: string;
  cardNumber: string | null;
  imageUrl: string;
  condition: SnkrdunkConditionPrice;
  currency: 'SGD';
}): SnkrdunkMarketCandidate {
  const conditionName = condition.conditionName || 'Default';
  const price = Number(condition.minPrice || 0);
  return {
    source: 'snkrdunk',
    mode: 'ask',
    sourceUrl,
    externalId: id,
    conditionId: condition.conditionId ?? null,
    conditionName,
    cardNumber,
    rarity: parseRarity(title),
    name: stripKnownSuffix(title),
    displayName: `${title} / ${conditionName}`,
    price,
    currency,
    availability: `${conditionName} condition`,
    imageUrl: imageUrl || null
  };
}

async function fetchConditionPrices(id: string) {
  const response = await fetch(`https://snkrdunk.com/en/v1/trading-cards/${encodeURIComponent(id)}/min-prices-by-conditions`, {
    headers: snkrdunkHeaders('application/json')
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null) as { conditionPrices?: SnkrdunkConditionPrice[] } | null;
  const rows = payload?.conditionPrices || [];
  return rows.filter((row) => row.minPrice != null);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: snkrdunkHeaders('text/html,application/xhtml+xml') });
  if (!response.ok) throw new Error(`SNKRDUNK returned ${response.status}`);
  return await response.text();
}

function snkrdunkHeaders(accept: string) {
  return {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    accept,
    'accept-language': 'en-US,en;q=0.9'
  };
}

function normalizeSnkrdunkCardUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'snkrdunk.com') return null;
    const match = url.pathname.match(/^\/en\/trading-cards\/(\d+)\/?$/i);
    if (!match) return null;
    return `https://snkrdunk.com/en/trading-cards/${match[1]}`;
  } catch {
    return null;
  }
}

function externalIdFromUrl(url: string) {
  return url.match(/\/trading-cards\/(\d+)/i)?.[1] || null;
}

function parseDataLayer(html: string): { price?: number; currency?: 'SGD' } {
  const match = html.match(/dataLayer\.push\((\{[\s\S]*?\})\);/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return {
      price: parsed.price == null ? undefined : Number(parsed.price),
      currency: parsed.currency === 'SGD' ? 'SGD' : undefined
    };
  } catch {
    return {};
  }
}

function parseRarity(value: string) {
  return value.match(/\b(SEC|SR|R|UC|C|L|P|SP)\b/)?.[1] || null;
}

function stripKnownSuffix(value: string) {
  return value.replace(/\s+\|\s+SNKRDUNK$/i, '').trim();
}

function textFromMatch(match?: RegExpMatchArray | null) {
  return match?.[1] ? decodeHtml(stripTags(match[1])).trim() : null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#034;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
