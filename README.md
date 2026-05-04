# 🌰 CryptoThreatBrief

AI-powered weekly crypto market threat intelligence. Detects anomalies, potential manipulation signals, and market risks using real-time data and GitHub Models AI analysis.

**[Live Site](https://ryriigh.github.io/crypto-threat-brief/)** | Built on [DN Institute Product Kit](https://github.com/1712n/product-kit-template)

## What It Does

CryptoThreatBrief is a fully automated crypto threat intelligence product that:

1. **Fetches real-time market data** from CoinGecko (50 top coins by market cap)
2. **Detects anomalies** using rule-based analysis:
   - Extreme price movements (>10% in 1h, >25% in 24h)
   - Suspicious volume/market-cap ratios (>0.5x = potential wash trading)
   - ATH proximity (FOMO/euphoria signals)
   - Trending coin monitoring (pump-and-dump correlation)
3. **Generates AI intelligence briefs** using GitHub Models (GPT-4o-mini)
4. **Deploys automatically** to GitHub Pages every Sunday

## How It Differs From the Template

| Template | CryptoThreatBrief |
|----------|-------------------|
| Single API (CPW) | Multi-source (CoinGecko market + trending + global) |
| Raw data dump | Anomaly detection engine with severity scoring |
| No AI analysis | GitHub Models AI generates threat intelligence briefs |
| No website | Full dark-themed responsive site with threat dashboard |
| JSON output only | HTML site + markdown brief + JSON data + history tracking |

## Architecture

```
CoinGecko ──> fetch-market-data.js ──> market-data.json
                                            │
GitHub Models (GPT-4o-mini) ──> generate-brief.js
                                            │
                                     index.html ──> GitHub Pages
                                     brief.md
                                     history.json
```

## 🌰 Setup

1. **Fork this repo** (or use as template)
2. **Enable GitHub Pages**: Settings > Pages > Source: GitHub Actions
3. **That's it!** The workflow runs automatically. No API keys needed for basic operation.

For AI-enhanced briefs, the workflow automatically uses `GITHUB_TOKEN` with GitHub Models.

## Local Development

```bash
# Fetch data
node scripts/fetch-market-data.js

# Generate brief (set GITHUB_TOKEN for AI features)
export GITHUB_TOKEN=your_token
node scripts/generate-brief.js

# Open the site
open index.html
```

## Data Sources

- **[CoinGecko API](https://www.coingecko.com/)** — Free tier, no API key required
- **[GitHub Models](https://docs.github.com/en/github-models)** — AI analysis via GPT-4o-mini
- **[DN Institute](https://dn.institute/)** — Market health methodology and analysis framework

## 🌰 License

MIT

---

*Built for the [DN Institute Challenge Program](https://github.com/1712n/dn-institute#-challenge-program).*
