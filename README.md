This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Node.js](https://nodejs.org/) 18+
- npm

## Getting Started

### 1. Start the database

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on port 5432. Verify it's running:

```bash
docker compose ps
```

### 2. Install dependencies

```bash
npm install
```

### 3. Push the Prisma schema and seed the database

```bash
npx prisma db push
npx prisma db seed
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Stopping and restarting

To stop the database:

```bash
docker compose down
```

To start everything back up after a reboot or break:

```bash
docker compose up -d
npm run dev
```

You do not need to re-run `prisma db push` or `prisma db seed` unless you've deleted the Docker volume. The data persists across restarts.

## Public API

Solo Kanban has a REST API for reading and changing projects, issues, comments,
subtasks, epics and sprints from scripts and other tools.

- **Interactive docs (Swagger UI):** [`/api/docs`](http://localhost:3000/api/docs) — browse every endpoint and run requests with *Try it out*.
- **OpenAPI spec:** `/api/v1/openapi.json`

### Enable it

The API is off until you set at least one key (32+ characters) in `API_KEYS`:

```bash
echo "API_KEYS=\"$(openssl rand -hex 32)\"" >> .env
```

Several comma-separated keys are allowed, so you can rotate a key by adding the
new one before removing the old. On Amplify, add `API_KEYS` as an environment
variable in the app settings.

Send the key with every request, as `Authorization: Bearer <key>` (or
`X-API-Key: <key>`). In Swagger UI, click **Authorize** and paste it.

### Examples

```bash
KEY=...; API=http://localhost:3000/api/v1

# List projects
curl -H "Authorization: Bearer $KEY" $API/projects

# Create an issue in the active sprint
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Fix login redirect","priority":"HIGH","sprintId":"active"}' \
  $API/projects/<projectId>/issues

# Move issue #12 to In Progress
curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"status":"IN_PROGRESS"}' $API/projects/<projectId>/issues/12

# Comment on issue #12
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"body":"Deployed to staging."}' $API/projects/<projectId>/issues/12/comments
```

Issues are addressed by their number within the project (the `#12` shown on
the board). Successful responses are `{ "data": ... }`; errors are
`{ "error": { "code": "...", "message": "..." } }` with a matching HTTP status.
