# AdmitFlow Backend — Node.js + Express + PostgreSQL

REST API server for the AdmitFlow School CRM.

---

## Project Structure

```
admitflow-backend/
├── src/
│   ├── server.js                   # Express app + route wiring
│   ├── db/
│   │   ├── pool.js                 # PostgreSQL connection pool
│   │   ├── migrate.js              # CREATE TABLE statements
│   │   └── seed.js                 # Demo data (school, admin, leads)
│   ├── middleware/
│   │   ├── auth.js                 # JWT protect + requireAdmin
│   │   └── errorHandler.js        # Global error + 404 handler
│   ├── controllers/
│   │   ├── authController.js       # login, getMe, changePassword
│   │   └── leadsController.js      # full leads CRUD + AI scoring + stats
│   └── routes/
│       ├── auth.js
│       ├── leads.js
│       └── schools.js              # Public school listing
├── .env                            # Environment variables (edit this)
├── package.json
└── README.md
```

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or on Supabase / Railway)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Edit `.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=admitflow
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=any_long_random_string
CLIENT_URL=http://localhost:5173
```

### 4. Create the database

```sql
-- In psql or pgAdmin:
CREATE DATABASE admitflow;
```

### 5. Run migrations (creates all tables)

```bash
npm run db:migrate
```

### 6. Seed demo data

```bash
npm run db:seed
```

This creates:
- School: ABC International School, Madhapur
- Admin login: `admin@school.com` / `Admin@123`
- 8 sample leads with realistic data

### 7. Start the server

```bash
npm run dev      # development (auto-restart with nodemon)
npm start        # production
```

Server runs at: http://localhost:5000

---

## API Reference

### Auth

| Method | Endpoint              | Auth | Description          |
|--------|-----------------------|------|----------------------|
| POST   | /api/auth/login       | No   | Login, get JWT token |
| GET    | /api/auth/me          | Yes  | Get current user     |
| PUT    | /api/auth/password    | Yes  | Change password      |

**Login request:**
```json
POST /api/auth/login
{ "email": "admin@school.com", "password": "Admin@123" }
```

**Login response:**
```json
{ "token": "eyJ...", "user": { "id": 1, "name": "Admin User", "role": "admin", "school_name": "ABC International School" } }
```

---

### Leads

All endpoints (except `/public`) require `Authorization: Bearer <token>` header.

| Method | Endpoint                        | Description               |
|--------|---------------------------------|---------------------------|
| GET    | /api/leads                      | List leads (with filters) |
| GET    | /api/leads/stats                | Dashboard stats           |
| GET    | /api/leads/:id                  | Single lead + history     |
| POST   | /api/leads                      | Create lead               |
| PUT    | /api/leads/:id                  | Update lead               |
| PATCH  | /api/leads/:id/status           | Update status only        |
| DELETE | /api/leads/:id                  | Delete lead               |
| POST   | /api/leads/:id/interactions     | Add note/call log         |
| POST   | /api/leads/public               | Public enquiry form       |

**Query params for GET /api/leads:**
- `status` — New | Contacted | Campus Visit | Admission | Lost
- `ai_label` — Hot | Warm | Cold
- `search` — name, phone, or grade
- `limit` — default 50
- `offset` — default 0

---

### Schools

| Method | Endpoint             | Auth | Description            |
|--------|----------------------|------|------------------------|
| GET    | /api/schools/public  | No   | List schools (landing) |

---

## AI Score Logic

Scores are calculated automatically on lead creation (rule-based, no API key needed):

| Factor                     | Points |
|----------------------------|--------|
| Base score                 | 40     |
| Google Ads source          | +20    |
| Referral source            | +18    |
| WhatsApp source            | +15    |
| Has email                  | +8     |
| High-demand grade          | +12    |
| Has search keyword         | +10    |
| High-intent keyword match  | +10    |

- Score ≥ 75 → **Hot** 🔴
- Score ≥ 55 → **Warm** 🟡
- Score < 55 → **Cold** 🔵

To switch to OpenAI scoring later, replace `calculateAIScore()` in `leadsController.js`.

---

## Connect frontend

In `admitflow/.env`:
```
VITE_API_URL=http://localhost:5000/api
```

Then in `Login.jsx`, use real credentials: `admin@school.com` / `Admin@123`.
The dev bypass button can be removed once the backend is running.