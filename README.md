# Infrastructure Engine - Railway Deployment
This project is a stable bridge for API execution with a domain-based architecture.

## Deployment on Railway
The project is configured for Railway. Ensure the following environment variables are set:
- `PORT`: 3001 (default)
- `DATABASE_URL`: Your Railway PostgreSQL connection string.

## API Usage
All requests must be sent to `/execute` via POST with a JSON body containing:
- `token`: Authentication token.
- `command`: Format `DOMAIN:action`.
- `payload`: Object containing required parameters.
