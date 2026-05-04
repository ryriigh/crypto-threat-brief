import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"

const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"
const MODEL = "gpt-4o-mini" // Free via GitHub Models

/**
 * Generate AI threat intelligence brief using GitHub Models
 */
async function generateBrief(marketData) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.warn("GITHUB_TOKEN not set — generating template brief without AI")
    return generateTemplateBrief(marketData)
  }

  const systemPrompt = `You are a crypto market threat intelligence analyst. You produce concise,
data-driven weekly briefings that help readers understand market risks, potential manipulation
signals, and notable anomalies. Your tone is professional, evidence-based, and conservative —
you distinguish genuine concerns from noise.

Rules:
1. Every claim must cite specific data values from the provided market data.
2. Focus on actionable intelligence: what should readers watch out for this week?
3. Structure your brief with clear sections: Executive Summary, Market Overview, Threat Signals, Watchlist.
4. If the data is mostly normal, say so. Do not manufacture drama.
5. Use markdown formatting. Keep the brief under 1500 words.
6. Include specific coin names, price changes, and volume figures.`

  const userPrompt = `Generate a weekly Crypto Threat Intelligence Brief based on this market data.

Global Market Stats:
${JSON.stringify(marketData.global, null, 2)}

Anomalies Detected (${marketData.metadata.anomalies_detected} total, ${marketData.metadata.high_severity} high severity):
${JSON.stringify(marketData.anomalies.slice(0, 15), null, 2)}

Trending Coins:
${JSON.stringify(marketData.trending, null, 2)}

Top 10 Coins (price & 24h change):
${JSON.stringify(marketData.top_coins.slice(0, 10).map(c => ({
    name: c.name, symbol: c.symbol, price: c.price,
    change_1h: c.price_change_1h, change_24h: c.price_change_24h, change_7d: c.price_change_7d,
    volume_24h: c.volume_24h, market_cap: c.market_cap
  })), null, 2)}

Data generated at: ${marketData.generated_at}
Previous data: ${marketData.previous_generated_at || "none (first run)"}

Write the brief now.`

  console.log("Generating AI brief via GitHub Models...")

  const response = await fetch(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    const text = await response.text()
    console.warn(`GitHub Models API error (${response.status}): ${text.slice(0, 200)}`)
    console.warn("Falling back to template brief")
    return generateTemplateBrief(marketData)
  }

  const result = await response.json()
  const brief = result.choices?.[0]?.message?.content

  if (!brief) {
    console.warn("No content in AI response, using template")
    return generateTemplateBrief(marketData)
  }

  console.log(`AI brief generated (${brief.length} chars)`)
  return brief
}

/**
 * Fallback: generate a structured brief without AI
 */
function generateTemplateBrief(data) {
  const { global, anomalies, trending, top_coins, metadata } = data
  const date = new Date().toISOString().split("T")[0]

  let brief = `# Crypto Threat Intelligence Brief\n**${date}**\n\n`

  brief += `## Executive Summary\n\n`
  if (global) {
    brief += `Total crypto market cap: $${(global.total_market_cap_usd / 1e12).toFixed(2)}T `
    brief += `(${global.market_cap_change_24h > 0 ? "+" : ""}${global.market_cap_change_24h?.toFixed(2)}% 24h). `
    brief += `BTC dominance: ${global.btc_dominance?.toFixed(1)}%. `
    brief += `24h volume: $${(global.total_volume_24h_usd / 1e9).toFixed(1)}B.\n\n`
  }
  brief += `**${metadata.anomalies_detected} anomalies detected** across ${metadata.total_coins_analyzed} coins `
  brief += `(${metadata.high_severity} high severity, ${metadata.medium_severity} medium).\n\n`

  brief += `## Threat Signals\n\n`
  if (anomalies.length === 0) {
    brief += `No significant anomalies detected this period. Markets appear to be operating within normal parameters.\n\n`
  } else {
    for (const a of anomalies.slice(0, 10)) {
      brief += `### ${a.coin} (${a.symbol.toUpperCase()}) — $${a.price}\n`
      for (const issue of a.issues) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🟢"
        if (issue.type === "extreme_1h_move") {
          brief += `${icon} **Extreme 1h move**: ${issue.value > 0 ? "+" : ""}${issue.value.toFixed(2)}%\n`
        } else if (issue.type === "extreme_24h_move") {
          brief += `${icon} **Extreme 24h move**: ${issue.value > 0 ? "+" : ""}${issue.value.toFixed(2)}%\n`
        } else if (issue.type === "high_volume_ratio") {
          brief += `${icon} **High volume/mcap ratio**: ${issue.value.toFixed(2)}x (potential wash trading signal)\n`
        } else if (issue.type === "near_ath") {
          brief += `${icon} **Near ATH**: ${issue.value.toFixed(1)}% from all-time high\n`
        }
      }
      brief += `\n`
    }
  }

  if (trending.length > 0) {
    brief += `## Trending Watchlist\n\n`
    brief += `These coins are currently trending — increased attention can correlate with pump-and-dump schemes:\n\n`
    for (const t of trending) {
      brief += `- **${t.name}** (${t.symbol.toUpperCase()}) — Rank #${t.market_cap_rank || "unranked"}\n`
    }
    brief += `\n`
  }

  brief += `## Top 10 Market Snapshot\n\n`
  brief += `| Coin | Price | 24h Change | 7d Change | Volume |\n`
  brief += `|------|-------|------------|-----------|--------|\n`
  for (const c of top_coins.slice(0, 10)) {
    const ch24 = c.price_change_24h != null ? `${c.price_change_24h > 0 ? "+" : ""}${c.price_change_24h.toFixed(2)}%` : "N/A"
    const ch7d = c.price_change_7d != null ? `${c.price_change_7d > 0 ? "+" : ""}${c.price_change_7d.toFixed(2)}%` : "N/A"
    const vol = c.volume_24h > 1e9 ? `$${(c.volume_24h / 1e9).toFixed(1)}B` : `$${(c.volume_24h / 1e6).toFixed(0)}M`
    brief += `| ${c.name} | $${c.price.toLocaleString()} | ${ch24} | ${ch7d} | ${vol} |\n`
  }

  brief += `\n---\n*Generated by [CryptoThreatBrief](https://github.com/ryriigh/crypto-threat-brief) using DN Institute methodology.*\n`

  return brief
}

/**
 * Build the static HTML page
 */
function buildHTML(brief, marketData) {
  const date = new Date().toISOString().split("T")[0]
  const anomalyCount = marketData.metadata.anomalies_detected
  const highCount = marketData.metadata.high_severity

  // Convert markdown to basic HTML
  let htmlContent = brief
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  // Handle markdown tables
  htmlContent = htmlContent.replace(
    /\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g,
    (match, header, rows) => {
      const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('')
      const bodyRows = rows.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`
    }
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CryptoThreatBrief - Weekly Crypto Threat Intelligence</title>
  <meta name="description" content="AI-powered weekly crypto market threat intelligence. Anomaly detection, manipulation signals, and risk analysis.">
  <style>
    :root {
      --bg: #0a0e17;
      --surface: #111827;
      --border: #1f2937;
      --text: #e5e7eb;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
      --danger: #ef4444;
      --warning: #f59e0b;
      --success: #10b981;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem; }
    header {
      text-align: center;
      padding: 3rem 0 2rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
    }
    header h1 {
      font-size: 2rem;
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    header .subtitle { color: var(--text-muted); margin-top: 0.5rem; }
    .stats {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1.5rem;
      text-align: center;
    }
    .stat .value { font-size: 1.5rem; font-weight: bold; }
    .stat .label { font-size: 0.8rem; color: var(--text-muted); }
    .stat.danger .value { color: var(--danger); }
    .stat.warning .value { color: var(--warning); }
    .stat.info .value { color: var(--accent); }
    .brief {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      margin-top: 2rem;
    }
    .brief h1, .brief h2, .brief h3 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .brief h2 { color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .brief h3 { color: var(--text); }
    .brief p { margin-bottom: 0.75rem; }
    .brief table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.9rem;
    }
    .brief th, .brief td {
      padding: 0.5rem;
      border: 1px solid var(--border);
      text-align: left;
    }
    .brief th { background: var(--bg); color: var(--accent); }
    .brief td { background: var(--surface); }
    footer {
      text-align: center;
      padding: 2rem 0;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
      margin-top: 3rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    @media (max-width: 600px) {
      .stats { flex-direction: column; align-items: center; }
      .brief { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>CryptoThreatBrief</h1>
      <p class="subtitle">AI-Powered Crypto Market Threat Intelligence</p>
      <div class="stats">
        <div class="stat danger">
          <div class="value">${highCount}</div>
          <div class="label">High Severity</div>
        </div>
        <div class="stat warning">
          <div class="value">${anomalyCount}</div>
          <div class="label">Anomalies</div>
        </div>
        <div class="stat info">
          <div class="value">${marketData.metadata.total_coins_analyzed}</div>
          <div class="label">Coins Analyzed</div>
        </div>
      </div>
    </header>
    <main class="brief">
      ${htmlContent}
    </main>
    <footer>
      <p>Updated: ${date} | Built with <a href="https://github.com/1712n/product-kit-template">DN Institute Product Kit</a> + <a href="https://docs.github.com/en/github-models">GitHub Models</a></p>
      <p>Data from <a href="https://www.coingecko.com/">CoinGecko</a> | Analysis methodology inspired by <a href="https://dn.institute/">DN Institute</a></p>
    </footer>
  </div>
</body>
</html>`
}

async function main() {
  try {
    const raw = await readFile("data/market-data.json", "utf8")
    const marketData = JSON.parse(raw)

    const brief = await generateBrief(marketData)

    // Save markdown brief
    await mkdir("data", { recursive: true })
    await writeFile("data/brief.md", brief)
    console.log("Brief saved to data/brief.md")

    // Build HTML
    const html = buildHTML(brief, marketData)
    await writeFile("index.html", html)
    console.log("Site built: index.html")

    // Save brief history
    const historyFile = "data/brief-history.json"
    let history = []
    try {
      const prev = await readFile(historyFile, "utf8")
      history = JSON.parse(prev)
    } catch {}
    history.unshift({
      date: new Date().toISOString(),
      anomalies: marketData.metadata.anomalies_detected,
      high_severity: marketData.metadata.high_severity,
      brief_length: brief.length
    })
    history = history.slice(0, 52) // Keep 1 year of weekly history
    await writeFile(historyFile, JSON.stringify(history, null, 2))

  } catch (error) {
    console.error("Brief generation failed:", error.message)
    process.exit(1)
  }
}

main()
