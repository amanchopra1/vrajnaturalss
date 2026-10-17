# Vraj Naturals website starter

A static HTML/CSS/JavaScript storefront starter for Cloudflare Pages, with a separate Cloudflare Worker starter for Razorpay subscription requests. No separate database is included.

## Project structure

- `index.html` — homepage
- `shop.html` — catalogue with category filters and sorting
- `product.html` — product details, selected by `?id=...`
- `subscriptions.html` — recurring order builder and delivery form
- `our-story.html`, `contact.html` — brand and contact pages
- `privacy-policy.html`, `terms.html`, `shipping-returns.html` — draft policy templates
- `css/style.css` — global styles and components
- `css/responsive.css` — responsive rules
- `js/script.js` — shared navigation, catalogue rendering and interactions
- `products.json` — single source of truth for product names, prices, pack descriptions, availability and image paths
- `blogs.html`, `data/blogs.json`, `blogs/` — static journal listing, central article index, and individual article pages
- `js/blogs.js` — fetches and sorts the journal index, renders the featured/recent articles, and applies category filters
- `images/products/` — packaging images supplied for Bajra (front and back), Basmati Rice, Sona Moti Atta, Sharbati Atta, Moong, Daliya and Jau Atta
- `images/` — replaceable image assets
- `worker/src/index.js` — server-side validation and Razorpay API integration starter
- `worker/wrangler.toml` — Cloudflare Worker configuration starter

## Important: this is a starter, not a live store

**Do not accept live payments until configuration and testing are complete.**

1. Product details and the provided regular and subscription per-kg rates load from `products.json`. Pack sizes are 1, 2, 5 and 10 kg, and both flows let customers select the number of packs. Subscriptions offer weekly, fortnightly, monthly, two-month and three-month schedules, with a flat ₹149 delivery fee added to each delivery. The Worker validates subscription rates and the delivery fee server-side, and creates/reuses plans for the selected Razorpay mode.
2. Actual packaging images supplied in this conversation have been added for the listed products. Some images show multiple pack sizes together, and the exact pack-specific front/back pairing should be reviewed before launch. The supplied logo image is used as-is in the shared header, footer, homepage art and as the favicon.
3. The contact form opens the visitor's email app; it does not send/store the message.
4. Shop and product-detail “Buy with Razorpay” actions open a one-time checkout page. The local Worker calculates regular prices and shipping (₹99 up to 2 kg total; ₹149 above 2 kg) server-side. The production checkout remains unavailable until a separately configured production Worker is deployed.
5. The local subscription Worker uses Razorpay Test Mode credentials. It reuses an exact matching plan in that Razorpay mode if available, and creates one when needed. Plan amounts include the ₹149 delivery fee. Live plans and test plans are separate Razorpay resources.
6. The local site stores no customer/order database. The Worker sends orders to a separate Google Orders Sheet before redirecting to Razorpay; webhook events update payment status. Keep the spreadsheet restricted and confirm the Apps Script deployment and notifications before launch.
7. Configure and test subscription intervals and recurring-payment method eligibility for your Razorpay account. The starter's frequency selector is a UI; the Worker must be configured with matching plans and billing behaviour.
8. Subscription checkout records, a Razorpay webhook receiver, payment-event logging, customer status emails, owner notifications and the 24-minute abandoned-checkout reminder are implemented across the Worker and Apps Script. Their end-to-end production operation still depends on deploying the current Apps Script code, configuring the separate production webhook, and completing a real deployment verification.
9. Replace sample legal/contact text with your verified business details and policies. The legal pages are draft templates, not legal advice.

## Local preview

You can open `index.html` directly, but a local HTTP server gives a more realistic preview because pages use root-relative paths.

Using Python from the project folder:

```bash
python3 -m http.server 8000
```

## Local Razorpay Test Mode subscription flow

The subscription form and one-time shop checkout connect to `http://127.0.0.1:8787` only when the site is opened on localhost. Local development defaults to Razorpay Test Mode and rejects keys that do not match the configured mode. Never put Live Mode keys in `worker/.dev.vars`. Wrangler 4 requires Node.js 22 or newer, so the `npm run dev` script invokes a temporary Node 22 runtime without replacing your system Node.

1. Install the Worker development dependency once:

   ```bash
   cd worker
   npm install
   cp .dev.vars.example .dev.vars
   ```

2. Edit `worker/.dev.vars` with your Razorpay Test Mode Key ID and Key Secret. No plan IDs need to be entered: the Worker checks existing Test Mode plans server-side and creates a matching plan if none exists. It matches INR amount, billing period and interval against the selected products plus ₹149 delivery.

3. Run the Worker in terminal 1:

   ```bash
   cd worker
   npm run dev
   ```

4. Run the site in terminal 2 from the project root:

   ```bash
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

5. Open `http://127.0.0.1:8000/subscriptions.html` to test subscription checkout or `http://127.0.0.1:8000/shop.html` to test one-time shop checkout. Check Worker status at `http://127.0.0.1:8787/api/health`. Shop checkout sends product IDs, pack sizes, pack counts and customer details; regular product prices and the ₹99/₹149 delivery fee are recalculated by the Worker. Repeated identical submissions with the same request key are deduplicated in the local Worker process for ten minutes.

Use Razorpay **Test Mode** API Keys from the Razorpay Dashboard (the Key ID begins `rzp_test_`). Set `RAZORPAY_MODE="test"` locally. Plan amount is in paise: subscription product total plus ₹14900; frequency matching is weekly ×1, weekly ×2, monthly ×1, monthly ×2, or monthly ×3. Razorpay plan IDs remain on the server and are never accepted from the browser.

The local idempotency cache is memory-only and resets when Wrangler restarts; the Google Sheet also deduplicates order requests by local request ID. Webhooks require a public HTTPS route. For local Test Mode webhook checks, use a short-lived tunnel to the local Worker and a Razorpay Test Mode webhook secret, then close the tunnel after testing. Never use a public tunnel with Live Mode credentials.

### Private order Sheet, email, and webhook setup

The order integration uses a separate Vraj Naturals Orders Apps Script project and spreadsheet. It does not read or write the Vraj Circle Apps Script or leads spreadsheet.

1. In the separate **Vraj Naturals Orders** Apps Script project, make `Code.gs` match `integrations/google-apps-script/orders.gs`. This file includes its own `doPost` entry point. Do not change the Vraj Circle Apps Script project.
2. Confirm the Google account that owns/runs the web app has Editor access to the Orders spreadsheet. Run `setupOrders()` once and approve Google Sheets and email permissions. It creates the `Orders` and `Payment Events` tabs and a five-minute reminder trigger.
3. In Apps Script **Project Settings → Script properties**, add `ORDERS_API_TOKEN` with a random value of at least 40 characters. Generate one locally with `openssl rand -hex 32`; do not send it in chat or commit it.
4. Deploy the Apps Script as a Web app, executing as the owner. The URL may be publicly reachable, but every order API request must include the matching secret token. Keep the spreadsheet itself Restricted. After each code change, deploy a new version.
5. Put the Apps Script `/exec` URL and the same token into `worker/.dev.vars` as `ORDERS_WEB_APP_URL` and `ORDERS_API_TOKEN`. Add the Razorpay **Test Mode** webhook secret as `RAZORPAY_WEBHOOK_SECRET`. Never commit `.dev.vars`.
6. In Razorpay Test Mode, add a webhook pointing to the Worker route `/api/razorpay/webhook` and subscribe to `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, and `payment.failed`. For local testing, expose port 8787 through a short-lived HTTPS tunnel and use that tunnel URL in Razorpay. Close it after the test.

New checkout rows are recorded before the customer is sent to Razorpay. Verified webhook events update the order and append to `Payment Events`. Customer confirmation/failure messages and owner notifications are sent by the Apps Script account. One abandoned-checkout email is sent only when the customer checked the optional reminder box; the five-minute trigger checks after 24 minutes, so delivery is normally about 24–29 minutes after checkout starts. Mail sending is subject to Google Apps Script quotas and account authorization.

Then open `http://localhost:8000`.

## Deploy the frontend to Cloudflare Pages

1. Put this folder in a Git repository.
2. Create a Cloudflare Pages project connected to that repository.
3. Use the project root as the build directory. No build command is needed for this static starter.
4. Add your actual domain and test every page on mobile and desktop.
5. Update `products.json` when product information, prices or image paths change. Changes will appear across the pages after Cloudflare Pages republishes the site. Keep the product image files in the repository and verify their paths.

## Configure the production Worker

The production Worker is configured as a separate Wrangler `production` environment. It handles only `https://vrajnaturals.com/api/*`, so the static Pages site can call it through its own origin. Production payments default to disabled (`PAYMENTS_ENABLED=false`). Local and production secrets are separate.

Before accepting customer payments, verify that Razorpay has activated the account and the required recurring methods; the current Apps Script deployment is up to date and has authorized Sheet and email access; and a Test Mode subscription, success/failure webhook, sheet row, owner email, customer email, duplicate retry, and abandoned reminder have all been checked. Do not use Live Mode until that checklist is complete.

First, from the `worker` directory, deploy the production Worker while payment processing is disabled:

```bash
npx wrangler deploy --env production
```

Then add production secrets without putting them in source files or chat. Each `wrangler secret put` command prompts for the value and publishes an updated Worker version; payments remain disabled during these steps:

```bash
npx wrangler secret put RAZORPAY_KEY_ID --env production
npx wrangler secret put RAZORPAY_KEY_SECRET --env production
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET --env production
npx wrangler secret put ORDERS_WEB_APP_URL --env production
npx wrangler secret put ORDERS_API_TOKEN --env production
```

The production Razorpay Key ID and Key Secret must both be generated in **Live Mode**. The production webhook secret is a new secret chosen in Razorpay when creating the **Live Mode** webhook. `ORDERS_WEB_APP_URL` must be the latest deployed Orders Apps Script `/exec` URL and `ORDERS_API_TOKEN` must match the token stored in that Apps Script project's Script Properties. Never reuse the Vraj Circle token or its spreadsheet.

The production variables `ALLOWED_ORIGIN=https://vrajnaturals.com`, `RAZORPAY_MODE=live`, and `PAYMENTS_ENABLED=false` are in `worker/wrangler.toml`. After adding secrets, confirm `https://vrajnaturals.com/api/health` reports `mode: live`, `credentialsConfigured: true`, and `paymentsEnabled: false`. After the Live Mode webhook is created with URL `https://vrajnaturals.com/api/razorpay/webhook` and the events selected, set the production variable `PAYMENTS_ENABLED=true` in Cloudflare and deploy that change. Then publish the website update and verify checkout with a controlled real subscription before announcing launch.

## Brand / content items to confirm

- Confirm product names, pack sizes, images and provided rates
- Real handicraft assortment
- Actual customer support email and business/legal name
- Shipping coverage, rates and delivery estimates
- Food labels, ingredients, allergens, shelf life and product claims
- Subscription intervals, recurring amounts, cancellation and failed-payment process
- Privacy, terms and returns policies reviewed for the business and applicable law

## Design direction

Forest green `#173D24`, warm ivory `#FAF8F1`, muted gold `#B68A43`, charcoal `#292D29`, Cormorant Garamond headings and Inter body text.
# GitHub auto-sync

The repository's `post-commit` hook pushes each local commit on the current branch to `origin`. Local edits still need to be committed before they sync. To commit all current changes and push them, run `./auto-sync.sh` from the project folder. The hook handles the push after the commit.
