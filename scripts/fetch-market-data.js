import { writeFile, mkdir, readFile } from "fs/promises"

const COINGECKO_BASE = "https://api.coingecko.com/api/v3"

/**
 * Fetch top crypto market data from CoinGecko (free, no API key needed)
 */
async function fetchMarketData() {
  console.log("Fetching market data from CoinGecko...")

  const response = await fetch(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=1h,24h,7d`
  )

  if (!response.ok) {
    throw new Error(`CoinGecko API failed: ${response.status}`)
  }

  const coins = await response.json()
  console.log(`Fetched data for ${coins.length} coins`)

  return coins.map(coin => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    price: coin.current_price,
    market_cap: coin.market_cap,
    volume_24h: coin.total_volume,
    price_change_1h: coin.price_change_percentage_1h_in_currency,
    price_change_24h: coin.price_change_percentage_24h_in_currency,
    price_change_7d: coin.price_change_percentage_7d_in_currency,
    high_24h: coin.high_24h,
    low_24h: coin.low_24h,
    ath: coin.ath,
    ath_change_percentage: coin.ath_change_percentage,
    sparkline_7d: coin.sparkline_in_7d?.price?.slice(-24) || [], // Last 24 data points
    last_updated: coin.last_updated
  }))
}

/**
 * Fetch trending coins (potential pump signals)
 */
async function fetchTrending() {
  console.log("Fetching trending coins...")
  const response = await fetch(`${COINGECKO_BASE}/search/trending`)
  if (!response.ok) {
    console.warn("Trending fetch failed, skipping")
    return []
  }
  const data = await response.json()
  return (data.coins || []).map(c => ({
    id: c.item.id,
    name: c.item.name,
    symbol: c.item.symbol,
    market_cap_rank: c.item.market_cap_rank,
    score: c.item.score
  }))
}

/**
 * Fetch global market stats
 */
async function fetchGlobalStats() {
  console.log("Fetching global market stats...")
  const response = await fetch(`${COINGECKO_BASE}/global`)
  if (!response.ok) {
    console.warn("Global stats fetch failed, skipping")
    return null
  }
  const data = await response.json()
  const d = data.data
  return {
    total_market_cap_usd: d.total_market_cap?.usd,
    total_volume_24h_usd: d.total_volume?.usd,
    market_cap_change_24h: d.market_cap_change_percentage_24h_usd,
    btc_dominance: d.market_cap_percentage?.btc,
    eth_dominance: d.market_cap_percentage?.eth,
    active_cryptocurrencies: d.active_cryptocurrencies,
    markets: d.markets
  }
}

/**
 * Detect anomalies in market data
 */
function detectAnomalies(coins) {
  const anomalies = []
  const stableSymbols = new Set(["usdt", "usdc", "dai", "busd", "tusd", "usdp", "usdd", "usde", "usd1", "usds", "frax", "lusd", "usyc", "buidl"])

  for (const coin of coins) {
    const issues = []
    const isStableAsset = stableSymbols.has(String(coin.symbol).toLowerCase()) || /usd|dollar/i.test(coin.name)

    // Extreme price movements (potential manipulation)
    if (Math.abs(coin.price_change_1h || 0) > 10) {
      issues.push({
        type: "extreme_1h_move",
        value: coin.price_change_1h,
        severity: Math.abs(coin.price_change_1h) > 20 ? "high" : "medium"
      })
    }

    if (Math.abs(coin.price_change_24h || 0) > 25) {
      issues.push({
        type: "extreme_24h_move",
        value: coin.price_change_24h,
        severity: Math.abs(coin.price_change_24h) > 50 ? "high" : "medium"
      })
    }

    // Volume/market-cap ratio anomaly (potential wash trading signal)
    if (coin.market_cap > 0) {
      const volumeRatio = coin.volume_24h / coin.market_cap
      if (volumeRatio > 0.5) {
        issues.push({
          type: "high_volume_ratio",
          value: volumeRatio,
          severity: volumeRatio > 1.0 ? "high" : "medium"
        })
      }
    }

    // Stable assets should be watched for peg breaks, not ATH proximity.
    if (isStableAsset && coin.price != null) {
      const pegDeviation = Math.abs(coin.price - 1)
      if (pegDeviation > 0.005) {
        issues.push({
          type: "stablecoin_depeg",
          value: pegDeviation,
          severity: pegDeviation > 0.02 ? "high" : "medium"
        })
      }
    }

    // Price near ATH (euphoria/FOMO signal) for non-stable assets.
    if (!isStableAsset && coin.ath_change_percentage > -5) {
      issues.push({
        type: "near_ath",
        value: coin.ath_change_percentage,
        severity: "low"
      })
    }

    if (issues.length > 0) {
      anomalies.push({
        coin: coin.name,
        symbol: coin.symbol,
        price: coin.price,
        issues
      })
    }
  }

  return anomalies.sort((a, b) => {
    const severityScore = s => s === "high" ? 3 : s === "medium" ? 2 : 1
    const maxA = Math.max(...a.issues.map(i => severityScore(i.severity)))
    const maxB = Math.max(...b.issues.map(i => severityScore(i.severity)))
    return maxB - maxA
  })
}

/**
 * Load existing data for historical comparison
 */
async function loadPreviousData() {
  try {
    const raw = await readFile("data/market-data.json", "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function main() {
  try {
    const previousData = await loadPreviousData()

    // Fetch all data sources concurrently
    const [marketData, trending, globalStats] = await Promise.all([
      fetchMarketData(),
      fetchTrending(),
      fetchGlobalStats()
    ])

    const anomalies = detectAnomalies(marketData)

    const output = {
      generated_at: new Date().toISOString(),
      previous_generated_at: previousData?.generated_at || null,
      global: globalStats,
      trending,
      anomalies,
      top_coins: marketData.slice(0, 20),
      metadata: {
        total_coins_analyzed: marketData.length,
        anomalies_detected: anomalies.length,
        high_severity: anomalies.filter(a => a.issues.some(i => i.severity === "high")).length,
        medium_severity: anomalies.filter(a => a.issues.some(i => i.severity === "medium")).length
      }
    }

    await mkdir("data", { recursive: true })
    await writeFile("data/market-data.json", JSON.stringify(output, null, 2))
    console.log(`Saved market data: ${output.metadata.anomalies_detected} anomalies detected (${output.metadata.high_severity} high severity)`)

  } catch (error) {
    console.error("Market data fetch failed:", error.message)
    process.exit(1)
  }
}

main()
