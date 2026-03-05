# Social Studio Analytics

A SaaS-grade social media analytics platform designed to aggregate, analyze, and visualize cross-channel performance (Meta/Instagram). Built with a focus on deep data accuracy, smart caching, and seamless background processing.

## 🚀 Features

* **Cross-Channel Dashboards:** Sprout Social / Measure Studio style UI with unified Page Insights and Grid-based Post Insights.
* **Smart Background Syncing:** Uses Redis-backed Bull Queues to safely download 90+ days of historical data while respecting Meta's strict rate limits.
* **On-the-Fly Gap Detection:** Dynamically detects missing days in the database and seamlessly fetches the gap data in the background without interrupting the user experience.
* **Resilient Error Handling:** Graceful fallbacks for missing permissions (e.g., dynamically dropping from `promotable_posts` to `published_posts`), and auto-reducing payload sizes if a viral post triggers a Meta timeout.
* **Data Integrity:** Explicit separation of Page Impressions, Reach, and Daily Video Views vs Post-Level metrics to ensure 100% accurate time-series graphs.

## 🛠️ Tech Stack

* **Frontend:** Next.js (React), Tailwind CSS, Lucide Icons, Recharts (for data visualization).
* **Backend:** NestJS, TypeScript, TypeORM.
* **Database:** PostgreSQL (Relational Data), Redis (Message Broker for queues).
* **Integrations:** Meta Graph API v18.0 (Facebook Pages, Instagram Professional).

## 📦 Getting Started

### Prerequisites
* Node.js (v18+)
* PostgreSQL running locally or in the cloud.
* Redis server running locally or in the cloud (for Bull queues).
* A Meta Developer App with `public_profile, pages_show_list, pages_read_engagement, read_insights, instagram_manage_insights` permissions.

### Backend Setup
1. Navigate to the `/backend` directory.
2. Run `npm install`.
3. Create a `.env` file with your Postgres, Redis, and Meta App credentials.
4. Run `npm run start:dev` to launch the NestJS server.

### Frontend Setup
1. Navigate to the `/frontend` directory.
2. Run `npm install`.
3. Create a `.env.local` file with `NEXT_PUBLIC_META_APP_ID`.
4. Run `npm run dev` to start the Next.js client on `localhost:3000`.

## 🧠 Architecture Notes
* **AnalyticsSnapshots:** Time-series database table that holds true daily aggregated metrics. Ensures the dashboard loads instantly without recalculating historical posts.
* **Smart Batching:** The Meta API wrapper smartly batches metrics. If a specific Facebook page type doesn't support a specific metric, the batch fails safely, logs a warning, and continues fetching the rest of the data.