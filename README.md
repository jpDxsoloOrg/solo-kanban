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
