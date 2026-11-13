<div align="center">

# AI Freebie Radar

**A daily-verified index of free AI credits, GPU compute, API tokens and video-generation quotas across 50+ platforms — one page, expired offers removed automatically.**

[![Live demo](https://img.shields.io/badge/Live%20demo-visit-7c5cff)](https://ai-credit-hub-44763.app.workbuddy.host/?sharecode=RIOZLFZCRN)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-2-blue)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Live demo](https://ai-credit-hub-44763.app.workbuddy.host/?sharecode=RIOZLFZCRN) · [Features](#features) · [Quick start](#quick-start) · [中文](README.md)

![Homepage](docs/screenshots/01-home.png)

</div>

---

## The problem

Almost every AI platform is buying users with free credits: video-generation points from Kling and Jimeng, free GPU hours from ModelScope, millions of tokens from LLM providers, server trials from cloud vendors, deployment credits from developer tools.

The offers live on 50+ separate marketing pages and expire without notice. Curated "awesome free AI" lists go stale within weeks, so you end up with a directory of dead links.

## What this does

A scheduled job verifies every listed offer once a day at 09:30 — it re-checks the campaign URL and status, marks expired entries as dead, and removes them from the default view. Each listing shows what you get, how long it lasts, how to claim it, and when it was last verified.

## Features

| Module | Description |
|---|---|
| Five-way filter | Status, keyword, platform, resource type (compute / API / tools / video), platform category |
| Daily sync | Built-in scheduler verifies links and status, delists expired offers |
| SEO ready | Per-offer landing pages at `/a/<id>`, daily digest pages, `sitemap.xml`, JSON-LD, OG cards |
| Submission review | Anyone can submit an offer; approval happens through a tokenized link, no admin login needed |
| Admin console | `/admin?key=<secret>` — pending queue, manual sync, stats |
| Share poster | Client-side Canvas poster at 1080×1440 with QR code |
| Daily digest | Auto-generated digest per sync run, archived by date |
| Zero framework | Native Node.js `http` server and vanilla frontend; 2 production dependencies |

## Quick start

Requires Node.js 18+ and a PostgreSQL database.

```bash
git clone https://github.com/haiying-ai/ai-freebie-radar.git
cd ai-freebie-radar
npm install
cp config.example.json config.json   # fill in database URL, admin key, sync schedule
npm start
```

The server renders offer pages server-side and runs the sync job in-process. See [`config.example.json`](config.example.json) for every option.

## Design notes

- **PostgreSQL with RLS on every table.** All writes go through `SECURITY DEFINER` functions that validate a server-side key, so the browser never holds write permission.
- **Native `http`, no Express.** Offer and digest pages are server-rendered for search engines; the app shell is a single-file SPA with no CDN dependency, so it loads on weak networks.
- **Verification is observable.** Every row stores its last-checked timestamp; the daily digest archive lets anyone confirm the data is actually fresh rather than trusting a badge.

## Scope and disclaimer

This project only aggregates publicly announced free-tier campaigns and links back to their source. It does not operate accounts on anyone's behalf and charges no fees. Offer terms are governed by each platform's own page.

## License

[MIT](LICENSE)
