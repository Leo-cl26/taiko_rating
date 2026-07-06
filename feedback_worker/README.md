# Taiko Rating Feedback Worker

This Worker stores anonymous "too high / too low" votes for neural-network chart data.

## Setup

1. Log in to Cloudflare:

```powershell
npx wrangler login
```

2. Create the D1 database:

```powershell
npx wrangler d1 create taiko-rating-feedback
```

3. Copy the returned `database_id` into `wrangler.toml`.

4. Create the table:

```powershell
npx wrangler d1 execute taiko-rating-feedback --file=./schema.sql --remote
```

5. Deploy:

```powershell
npx wrangler deploy
```

6. Copy the deployed Worker URL into `index.html`:

```html
<script>
  window.TAIKO_FEEDBACK_API_BASE = "https://taiko-rating-feedback.mmtumr.workers.dev";
</script>
```

Current production Worker:

```text
https://taiko-rating-feedback.mmtumr.workers.dev
```
