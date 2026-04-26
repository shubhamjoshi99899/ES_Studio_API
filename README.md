# Social Studio Analytics

A SaaS-grade social media analytics platform designed to aggregate, analyze, and visualize cross-channel performance (Meta/Instagram). Built with a focus on deep data accuracy, smart caching, and seamless background processing.

## 🚀 Features

* **Cross-Channel Dashboards:** Sprout Social / Measure Studio style UI with unified Page Insights and Grid-based Post Insights.
* **Workspace-Aware Auth:** Cookie-based JWT auth with email/password login, Google OAuth, email verification, and workspace-scoped sessions.
* **Smart Background Syncing:** Uses Redis-backed Bull Queues to safely download 90+ days of historical data while respecting Meta's strict rate limits.
* **On-the-Fly Gap Detection:** Dynamically detects missing days in the database and seamlessly fetches the gap data in the background without interrupting the user experience.
* **Resilient Error Handling:** Graceful fallbacks for missing permissions (e.g., dynamically dropping from `promotable_posts` to `published_posts`), and auto-reducing payload sizes if a viral post triggers a Meta timeout.
* **Data Integrity:** Explicit separation of Page Impressions, Reach, and Daily Video Views vs Post-Level metrics to ensure 100% accurate time-series graphs.

## 🛠️ Tech Stack

* **Frontend:** Next.js (React), Tailwind CSS, Lucide Icons, Recharts (for data visualization). The frontend app is not contained in this repository.
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
1. Navigate to this repository root.
2. Run `npm install`.
3. Create a `.env` file with your Postgres, Redis, auth, and integration credentials.
4. Run `npm run start:dev` to launch the NestJS server.

### Frontend Setup
The frontend referenced by this backend is a separate application. At minimum, it should implement these routes to match the current auth redirects:

- `/signup`
- `/login`
- `/verify-email`
- `/onboarding`
- `/dashboard`

Expected onboarding route behavior:

- no auth cookie: redirect to `/signup`
- auth cookie with `workspaceId = null`: allow `/onboarding`
- auth cookie with `workspaceId` set: redirect to `/dashboard`

## 🧠 Architecture Notes
* **AnalyticsSnapshots:** Time-series database table that holds true daily aggregated metrics. Ensures the dashboard loads instantly without recalculating historical posts.
* **Smart Batching:** The Meta API wrapper smartly batches metrics. If a specific Facebook page type doesn't support a specific metric, the batch fails safely, logs a warning, and continues fetching the rest of the data.
