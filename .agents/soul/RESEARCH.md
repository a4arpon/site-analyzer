# RESEARCH — modern SEO / AI search / agent commerce (2026)

Persisted deep-web research. Sources dated 2025-06 → 2026-07. Used to steer webalyzer's rule taxonomy + crawler design.

## 1. How AI search engines source data (the new crawlers)
- **Perplexity** — real-time web retrieval every query; mandatory inline citations; times out on pages >2.5s; cannot render JS; favours 2,000+ word comprehensive guides, FAQ schema (can double citation), fresh content (30-day window), self-contained citable sentences with stats. Bots: `PerplexityBot` (crawl), `Perplexity-User` (search).
- **ChatGPT / OpenAI** — training data static between updates, but Bing-powered retrieval layer surfaces new content for commercial queries. Pre-training authority bias: newer brands can't optimize in via on-site changes alone; need third-party mentions (.edu/.gov/Wikipedia/pubs). Bots: `GPTBot` (training), `OAI-SearchBot`, `ChatGPT-User`.
- **Gemini / Google AI Overviews** — draws from existing Google index + AI extraction layer. AI Overviews ship on ~13–50%+ of queries. Strong traditional SEO is foundation; adds extractability (self-contained passages, no "as mentioned above"), E-E-A-T, FAQ/HowTo schema. Fresh stats w/ dates + source attribution.
- **Claude / Anthropic** — `ClaudeBot` (training), `Claude-User` (retrieval), `Claude-SearchBot`. Entity-first writing, schema (Organization/Article/FAQ/Product).
- **Grok** — real-time X data; fastest, best for breaking news.
- **Market matured into specialists** (2026): Perplexity=citations, Claude=synthesis, Gemini=freshness, ChatGPT=reasoning, Grok=speed. No single winner.

## 2. GEO / AEO fundamentals (what gets cited)
- **GEO** (Princeton-coined) = optimizing for RAG retrieval so LLMs cite you. Citation Frequency, Brand Visibility, AI Share-of-Voice replace CTR as KPIs.
- Princeton study: specific **statistics improve citation ~40%**; keyword stuffing performed *below baseline*.
- Highest-leverage content: original data, case studies, pricing pages, comparison tables, FAQ schema, verifiable stats with source+date.
- Structured content: TL;DR blocks, question-form H2/H3, semantic HTML (`<article>/<section>`), separate facts from boilerplate ("fragment-ready").
- **Google official (May 2026)**: AEO/GEO "is still SEO." No special file (llms.txt/schema/chunking) *guarantees* citation. Use schema for rich-result eligibility, clear headings for readers — not as AI magic levers. Don't manufacture fake mentions.
- AI agents may interact via accessibility tree / DOM / visual render (Project Mariner style). Universal Commerce Protocol emerging.

## 3. The AI crawler / robots / llms.txt layer
- Allow AI bots in `robots.txt` or opt out of the answer layer: `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`.
- `robots.txt` = RFC 9309 (advisory, not access control). Root only. `Sitemap:` directive points to XML sitemap.
- **llms.txt** (proposed standard, huggingface-style): markdown file at `/llms.txt` = curated map of key content so LLMs don't crawl entire site. Two flavours: `llms.txt` (concise link map) + `llms-full.txt` (aggregated text). Google Lighthouse added llms.txt check (May 2026). Google says NOT required for visibility — but future-proofing.
- Common failure: accidentally `Disallow: /` for AI bots; forgetting subdomains; blocking render resources.

## 4. Crawler architecture (Screaming Frog-class) — for our build
- **URL frontier** = brain: priority queue + politeness + freshness scheduling. Bloom filters for mem-efficient URL dedup.
- **Politeness**: min 0.1s between requests; per-host crawl delay; identify crawler in UA w/ contact; monitor HTTP codes; adaptive backoff on stress.
- **Parsing**: extract content (strip boilerplate via readability, JSON-LD, OG tags, language, content fingerprint for dup detection) + links (resolve relative→absolute, normalize, filter non-HTML).
- **Sitemap discovery**: try `/sitemap.xml`, `/sitemap_index.xml`, parse `robots.txt` `Sitemap:`; follow sitemap indexes recursively; handle large (millions of URLs).
- **JS rendering**: expensive — hybrid (static fetch first; render if body <1KB or missing expected markers). Dynamic rendering service (Rendertron-style) as option.
- **Failure handling**: 4xx=permanent (drop), 5xx=transient (retry+backoff), timeouts=retry then deprioritize, spider traps=limit depth + detect repetitive URL patterns.
- **Scale refs**: ~385 pages/s = 1B/mo; DNS caching needed; raw HTML store + extracted store + metadata KV.

## 5. Agentic commerce (where this is heading)
- Protocols: **MCP** (Anthropic, tool/data access — "MCP for tool integration"), **UCP** (Google, Universal Commerce Protocol — agent discovery→checkout→orders), **A2A** (agent-to-agent), **ACP** (Stripe-led agentic commerce). Consensus: "MCP for tools, A2A for agents, UCP+AP2 for commerce."
- Zero-click commerce real: Walmart/ChatGPT checkout stumbled (3x worse conversion, Mar 2026) — identity/consent/liability is the bottleneck, not tech.
- MCP servers shipping from Microsoft Dynamics 365 Commerce, Shopify Agentic Storefronts, Adobe Commerce — agents query inventory/price/checkout directly instead of scraping.
- Implication for webalyzer: future "agent-readiness" rules should check MCP/UCP exposability, structured product data, machine-readable checkout, not just HTML.

## 6. Business framing (what "modern business" means here)
- Visibility = ranked pages AND synthesized answers. Track both.
- Brand must be consistent across owned site + external (Wikipedia, G2, Reddit, YouTube, directories) — entity authority.
- Local: Google Business Profile + ratings (ChatGPT recommends 4.3★ avg; filters lower-rated).
- Measurements shifting: rankings → AI visibility / share-of-answer / branded mentions in responses / citation clicks.
