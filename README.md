# Climatrace - Climate Hazard Trend Analyzer

Explore historical climate hazards with maps, trend charts, and CSV/PDF exports. Heatwave is selected by default.

## Requirements

- Node.js 20.19+ or 22.12+ and npm
- Python 3.12
- Internet access for weather data and maps
- Docker Desktop for the optional Docker setup

Run commands from the project root. Examples use Windows PowerShell.

## Installation

```powershell
npm ci
npm run locations
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

The backend defaults to TinyDB for single-process local development. On macOS/Linux, use `.venv/bin/python` instead of `.\.venv\Scripts\python.exe`.

## Ports and configuration

Edit the root `.env` to change ports:

```dotenv
PORT=8000
DEV_PORT=5173
MONGO_PORT=27017
VITE_API_URL=
```

`PORT` controls the API and Docker app port. `DEV_PORT` controls the local frontend. Vite proxies `/api` to `PORT`, so both remain aligned. Keep `VITE_API_URL` empty for local development and a combined Docker app.

Database settings live in `backend/.env`. For an existing MongoDB instance, set `DB_BACKEND=mongodb` and `MONGODB_URI` to its connection string. Real `.env` files are ignored by Git.

## Run locally

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m backend
```

In a second terminal:

```powershell
npm run dev
```

With default ports, open http://127.0.0.1:5173. API documentation is at http://127.0.0.1:8000/docs and health status at http://127.0.0.1:8000/api/health.

## Docker

```powershell
docker compose up -d --build
```

Open http://127.0.0.1:8000, or the `PORT` chosen in `.env`. Docker builds the frontend and runs FastAPI with MongoDB and a persistent database volume. Change `MONGO_PORT` if a local database already uses port 27017. Compose sets its own database connection; it does not read `backend/.env` for container settings.

```powershell
docker compose down
```

## Production deployment: Netlify + FastAPI

The React frontend runs on Netlify. The Python API runs on Render, with MongoDB Atlas for persistent storage. Netlify Functions support JavaScript, TypeScript, and Go; this FastAPI backend requires a Python/container host. See the [Netlify Functions documentation](https://www.netlify.com/platform/core/functions/).

### 1. Database

Create a MongoDB Atlas database and database user. Allow connections from the API host using its outbound addresses. Copy the connection string into the backend host's secret `MONGODB_URI` setting.

### 2. FastAPI backend on Render

Connect the GitHub repository to Render and create a Blueprint using `render.yaml`. It builds the Docker image and runs the app on `0.0.0.0` using `PORT` (configured as 10000).

Set these backend environment variables:

```dotenv
DB_BACKEND=mongodb
MONGODB_URI=<your MongoDB Atlas connection string>
MONGODB_DATABASE=climatrace
PORT=10000
CORS_ORIGINS=https://<your-site>.netlify.app
```

Render's hostname is automatically allowed by the app. Add custom API domains to `ALLOWED_HOSTS` if needed. Confirm `https://<your-api>.onrender.com/api/health` is healthy before connecting the frontend. See [Render Docker deployment](https://render.com/docs/docker).

### 3. React frontend on Netlify

Import the GitHub repository into Netlify. `netlify.toml` supplies the build command and `dist` publish directory. Set this environment variable in Netlify before building:

```dotenv
VITE_API_URL=https://<your-api>.onrender.com
```

Use the API origin without `/api`. The deployment check rejects a missing or local API URL. Netlify serves the frontend over HTTPS; `PORT` is a backend setting, not a Netlify site port. See [Netlify build settings](https://docs.netlify.com/build/configure-builds/overview/).

After Netlify assigns the site URL, update the backend's `CORS_ORIGINS` to that exact origin and redeploy the backend. Changing `VITE_API_URL` requires rebuilding the frontend. Keep database credentials only on the backend host.

### 4. Verify production

Run a real heatwave analysis, inspect charts and event pagination, and download CSV/PDF results. Confirm repeated analyses reuse stored data. A frontend deployment alone is not a working production application.

## Production build locally

```powershell
npm run build
.\.venv\Scripts\python.exe -m backend
```

Open the API port to use the built frontend and API together.

## Development checks

Pytest is only needed for development checks, not for running the production app.

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest backend/tests -q --basetemp .cache/pytest -p no:cacheprovider
npm run build
npx playwright install chromium
npm test
```

## Troubleshooting

- **Locations missing:** run `npm run locations`.
- **API unavailable:** check that the backend is running and `PORT` matches the frontend proxy.
- **Port occupied:** change `PORT`, `DEV_PORT`, or `MONGO_PORT` in `.env` and restart the affected services.
- **MongoDB unavailable:** verify the connection string and database network access.
- **Netlify API errors:** check `VITE_API_URL`, backend health, and the exact Netlify origin in `CORS_ORIGINS`.
