# Hugo

Hugo is being cleaned into a sober cockpit for a digital assistant experience.

## Current product scope

The active application centers on:

- cabinet administration
- workspaces
- role-based internal and client access
- documents
- tasks and follow-up surfaces
- document upload and secure private download
- audit logging

The current cleanup keeps the existing technical base stable while removing visible legacy product language.

## Environment

Required variables:

- `DATABASE_URL`
- `JWT_SECRET`

Additional environment variables may be required for optional services such as private document storage.

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Build

```bash
npm run build
```
