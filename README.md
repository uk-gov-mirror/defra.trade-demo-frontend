# trade-demo-frontend

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-demo-frontend&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-demo-frontend)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-demo-frontend&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-demo-frontend)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_trade-demo-frontend&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_trade-demo-frontend)

---

Node.js/Hapi.js frontend demonstrating CDP platform integration with a Java Spring Boot backend.

**What it demonstrates:**

- Direct service-to-service communication with Java backend
- CDP trace ID propagation (x-cdp-request-id)
- Server-side session management (Redis)
- GOV.UK Design System multi-step forms
- CRUD operations with client-side search

## Quick Start

### Prerequisites

- Node.js >= v22
- Docker and Docker Compose
- Backend repository: `../trade-demo-backend` (MongoDB) or `../trade-demo-postgres-backend` (PostgreSQL)

### Start the Application

```bash
# Start all backend services (Redis, DEFRA ID stub, LocalStack, MongoDB, Backend)
make start

# Access the frontend at http://localhost:3000
```

This starts:

- **Docker**: Redis, DEFRA ID stub, LocalStack, MongoDB, Backend (Java on port 8085)
- **Native**: Frontend with hot reload (port 3000)

### Register Test User

Before you can log in, register a test user with the DEFRA ID stub:

```bash
make register-user
```

This creates a test user (email: test@example.com) in the stub. You can now visit http://localhost:3000/dashboard and log in.

**Note**: The stub uses in-memory storage, so you'll need to re-run this command if you restart the Docker services.

### Other Commands

```bash
make debug       # Start in debug mode (Node.js debugger on port 9229)
make stop        # Stop all services and remove volumes
make logs        # Show logs from running services
make ps          # Show service status
make test        # Run tests
make help        # Show all commands
```

## Development Workflow

### Local Development (without Docker)

If you prefer to run the backend outside Docker:

```bash
# Start just Redis for sessions
docker compose up -d

# Start your chosen backend from its repository
cd ../trade-demo-backend && npm run dev           # MongoDB
cd ../trade-demo-postgres-backend && mvn spring-boot:run  # PostgreSQL

# Start frontend
npm install
npm run dev  # Runs on http://localhost:3000
```

The frontend expects backend at `http://localhost:8085` by default. Override with `BACKEND_API_URL` environment variable if needed.

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:config   # Run just src/config/config.test.js
npm run lint          # Lint JS and SCSS
npm run format        # Auto-fix formatting
```

#### Running tests in IntelliJ IDEA/WebStorm

- Open the root folder in the IDE.
- IntelliJ detects Vitest automatically from vitest.config.js.
- Option A: Use the NPM tool window and run the script: test:config.
- Option B: Right‑click the test file src/config/config.test.js and choose “Run 'config.test.js'”.
  - If the context menu shows Jest instead of Vitest, go to Settings > Languages & Frameworks > JavaScript > Testing and select Vitest as the test runner.
- For watch/debug: Right‑click the file and choose Debug, or run: npm run test:watch.

## Testing Authentication

The application uses DEFRA Customer Identity Service (DEFRA ID) for authentication via OAuth2/OIDC. Protected routes (like `/dashboard`) require users to log in.

### Quick Start

```bash
# Start all services
make start

# Register a test user (required before first login)
make register-user

# Access: http://localhost:3000/dashboard
```

### Browser Testing

#### Complete Authentication Flow

**Step 1: Register Test User**

```bash
make register-user
# Creates test user: test@example.com
```

**Step 2: Access Protected Route**

```
Navigate to: http://localhost:3000/dashboard
Expected: Redirect to DEFRA ID stub authorization page
```

**Step 3: Authenticate**

```
On DEFRA ID stub page:
  - User is automatically authenticated (pre-registered)
  - Redirects back to http://localhost:3000/auth/callback
  - Then redirects to http://localhost:3000/
```

**Step 4: View Dashboard**

```
Navigate to: http://localhost:3000/dashboard
Expected: See dashboard with:
  - "You are logged in as: test@example.com"
  - Display name
  - Contact ID
```

**Step 5: Verify Session Persistence**

```
Navigate between pages - no re-authentication required
Check DevTools → Application → Cookies:
  - 'session' cookie present (Yar session)
  - Contains encrypted session data
```

**Step 6: Logout**

```
Click "Sign out" → Redirects to DEFRA ID → Redirects to homepage
Try accessing /dashboard → Redirects to /auth/login
```

### curl Testing

#### Test 1: Unauthenticated Access

```bash
curl -v http://localhost:3000/dashboard
# Expected: 302 redirect to /auth/login
```

#### Test 2: OAuth2 Authorization Request

```bash
curl -v http://localhost:3000/auth/login 2>&1 | grep -i "location:"
# Expected: Location points to DEFRA ID stub with:
#   - redirect_uri=http://localhost:3000/auth/callback
#   - client_id=test-client
#   - response_type=code
#   - serviceId=test-service (DEFRA-specific requirement)
#   - scope=openid profile email offline_access
```

#### Test 3: Register User via API

```bash
# Register a test user
make register-user

# Verify user exists
curl http://localhost:3200/cdp-defra-id-stub/API/register/86a7607c-a1e7-41e5-a0b6-a41680d05a2a
# Expected: User details JSON
```

#### Test 4: Complete OAuth2 Flow

```bash
# Get authorization URL
AUTH_URL=$(curl -s -D - http://localhost:3000/auth/login | grep -i "location:" | cut -d' ' -f2 | tr -d '\r')

# Extract state parameter
STATE=$(echo "$AUTH_URL" | grep -oP 'state=\K[^&]+')

# Simulate callback (requires stub cooperation)
curl -c cookies.txt -L "http://localhost:3000/auth/callback?code=test-code&state=$STATE"

# Access dashboard with cookie
curl -b cookies.txt http://localhost:3000/dashboard
# Expected: 200 OK with dashboard HTML
```

#### Test 4: Session Inspection (Redis)

```bash
# Connect to Redis
docker compose exec redis redis-cli

# List sessions
KEYS session:*

# View session data
GET "session:abc123..."
# Expected JSON with: contactId, email, displayName, accessToken, etc.
```

### Authentication Flow Architecture

```
Unauthenticated User Flow:
┌─────────────────────────────────────────────────────────────────┐
│ User → /dashboard → No session? → Redirect to /auth/login       │
│                                          ↓                       │
│                                    Bell intercepts              │
│                                          ↓                       │
│                               Redirect to DEFRA ID stub         │
│                                          ↓                       │
│                               User authenticates                │
│                                          ↓                       │
│                    Stub redirects to /auth/callback?code=...    │
│                                          ↓                       │
│                               Bell exchanges code for tokens    │
│                                          ↓                       │
│                    Callback creates session in Redis            │
│                                          ↓                       │
│                         Set 'yar' cookie with session ID        │
│                                          ↓                       │
│                               Redirect to homepage              │
│                                          ↓                       │
│                            User navigates to /dashboard         │
│                                          ↓                       │
│                  Session validated → Dashboard renders          │
└─────────────────────────────────────────────────────────────────┘

Authenticated User (subsequent requests):
┌─────────────────────────────────────────────────────────────────┐
│ User → /dashboard → Has 'yar' cookie?                           │
│                           ↓                                      │
│                  session-cookie strategy validates              │
│                           ↓                                      │
│                  Lookup session in Redis                        │
│                           ↓                                      │
│                  Session valid? → Dashboard renders             │
└─────────────────────────────────────────────────────────────────┘
```

### Troubleshooting

**Login redirects but fails:**

```bash
# Check stub is running
curl http://localhost:3939/cdp-defra-id-stub/.well-known/openid-configuration

# Check logs
docker compose logs defra-id-stub
```

**Session not persisting:**

```bash
# Verify Redis
docker compose ps redis
docker compose exec redis redis-cli ping  # Expected: PONG

# Check for sessions
docker compose exec redis redis-cli KEYS "session:*"
```

**"Unknown authentication strategy" error:**

- Auth strategies must be registered BEFORE routes
- Check src/server/server.js initialization order

### Architecture: Native Frontend + Docker Infrastructure

The frontend service is NOT in `compose.yml` because it cannot run under emulation.
Docker Compose is used only for infrastructure because the CDP node-development
base image is not multi-arch, it will not run on Apple Silicon.

Consequently, we need to run the frontend natively on the host machine.

| Component      | Where                   | Why                                                        |
| -------------- | ----------------------- | ---------------------------------------------------------- |
| **Frontend**   | Native (Mac arm64)      | Avoids emulation issues, fast hot reload                   |
| webpack + sass | Native (Mac arm64)      | Requires native arm64 binaries, 4s builds vs infinite hang |
| Redis          | Docker (amd64 emulated) | Simple service, stable under emulation                     |
| Database       | Docker (amd64 emulated) | MongoDB or PostgreSQL, stable under emulation              |
| Backend (Java) | Docker (amd64 emulated) | JVM bytecode, stable under emulation                       |
| LocalStack     | Docker (amd64 emulated) | AWS services emulation                                     |

## CDP CI/CD:

CDP's GitHub Actions don't build inside Docker either:

```yaml
# CDP's actual pattern (simplified)
- run: npm ci # ← Runs on GitHub amd64 runner (host)
- run: npm run build # ← Builds on host, not in Docker
- run: docker build . # ← Copies pre-built assets
  env: set +e # ← Ignore Docker build errors
```

## Troubleshooting

### Docker Compose won't start

```bash
# Check backend repos exist
ls ../trade-demo-backend          # MongoDB backend
ls ../trade-demo-postgres-backend # PostgreSQL backend

# View service status
docker compose ps

# Check logs (example for MongoDB stack)
docker compose logs -f redis
docker compose logs -f mongodb
docker compose logs -f trade-demo-backend

# Or for PostgreSQL stack
docker compose logs -f postgres
docker compose logs -f trade-demo-postgres-backend

# Clean restart
make down && make mongo     # or make postgres
```

### Frontend won't start

If `npm run dev` fails to start:

```bash
# Check if webpack build assets exist
ls .public/

# Rebuild frontend assets
npm run build:frontend

# Check for port conflicts
lsof -i :3000

# Try starting again
make mongo     # or make postgres
```

## Useful Docker Commands

```bash
# Start backend stacks
docker compose --profile mongo up -d           # MongoDB backend stack
docker compose --profile postgres up -d        # PostgreSQL backend stack

# View service logs
docker compose logs -f                         # All running services
docker compose logs -f trade-demo-backend      # MongoDB backend
docker compose logs -f trade-demo-postgres-backend  # PostgreSQL backend
docker compose logs -f redis                   # Redis only

# Rebuild specific service
docker compose --profile mongo up --build trade-demo-backend
docker compose --profile postgres up --build trade-demo-postgres-backend

# Access container shells
docker compose exec trade-demo-backend sh               # MongoDB backend
docker compose exec trade-demo-postgres-backend sh      # PostgreSQL backend
docker compose exec mongodb mongosh                     # MongoDB shell
docker compose exec postgres psql -U postgres -d trade_demo_postgres_backend  # PostgreSQL shell

# Stop and remove everything including volumes
docker compose --profile mongo --profile postgres down -v
```

## Environment Variables

### Required

- `SESSION_COOKIE_PASSWORD` - Min 32 characters
- `BACKEND_API_URL` - Backend service URL

### Optional

- `PORT` - Server port (default: 3000)
- `SESSION_CACHE_ENGINE` - `redis` or `memory` (default: memory in dev)
- `REDIS_HOST` - Redis server (default: 127.0.0.1)
- `LOG_LEVEL` - Logging level (default: info)

### Example `.env`

```bash
SESSION_COOKIE_PASSWORD=the-password-must-be-at-least-32-characters-long
BACKEND_API_URL=http://trade-demo-backend:8085
SESSION_CACHE_ENGINE=memory
LOG_LEVEL=debug
```

## Architecture

### Backend Integration

Direct HTTP communication with backend service (no API gateway). The frontend works with either MongoDB or PostgreSQL backend - both expose identical REST APIs:

```javascript
import { exampleApi } from '../common/helpers/api-client.js'

const traceId = request.headers['x-cdp-request-id']
const examples = await exampleApi.findAll(traceId)
```

**Local development:**

- Backend (either): `http://localhost:8085`
- Set via `BACKEND_API_URL` environment variable

### Session Management

Server-side sessions with `@hapi/yar`:

- Redis in production (CDP auto-provisioned)
- Memory cache for local dev
- 4-hour timeout
- Only encrypted session ID sent to browser

```javascript
import {
  setSessionValue,
  getSessionValue,
  clearSessionValue
} from '../common/helpers/session-helpers.js'

setSessionValue(request, 'example.name', 'Test')
const name = getSessionValue(request, 'example.name')
clearSessionValue(request, 'example')
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
