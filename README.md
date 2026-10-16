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

1. Product details and the provided regular and subscription per-kg rates load from `products.json`. Pack sizes are 1, 2, 5 and 10 kg, and both flows let customers select the number of packs. The Worker validates subscription rates server-side; matching Razorpay plans must still be configured before accepting payments.
2. Actual packaging images supplied in this conversation have been added for the listed products. Some images show multiple pack sizes together, and the exact pack-specific front/back pairing should be reviewed before launch. The supplied logo image is used as-is in the shared header, footer, homepage art and as the favicon.
3. The contact form opens the visitor's email app; it does not send/store the message.
4. The product page's “Enquire / Buy” action prepares an email. A one-time checkout flow is not included in this starter.
5. The subscription Worker requires valid Razorpay credentials and matching plan IDs. Razorpay plans have fixed billing amounts/periods; the included Worker intentionally rejects a product combination unless its total exactly matches the configured plan. Arbitrary product combinations require a deliberate plan strategy and careful testing.
6. The starter stores no local customer/order database. Subscription details are submitted to Razorpay notes, but verify Razorpay's current limits, fields, dashboard visibility and retention before relying on them for fulfilment. The subscription object is not a complete order-management system.
7. Configure and test subscription intervals and recurring-payment method eligibility for your Razorpay account. The starter's frequency selector is a UI; the Worker must be configured with matching plans and billing behaviour.
8. The webhook receiver, payment-status reconciliation, subscription cancellation/change management, inventory, shipping calculation, tax calculation, one-time checkout, email/SMS notifications and fulfilment tooling are not implemented.
9. Replace sample legal/contact text with your verified business details and policies. The legal pages are draft templates, not legal advice.

## Local preview

You can open `index.html` directly, but a local HTTP server gives a more realistic preview because pages use root-relative paths.

Using Python from the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy the frontend to Cloudflare Pages

1. Put this folder in a Git repository.
2. Create a Cloudflare Pages project connected to that repository.
3. Use the project root as the build directory. No build command is needed for this static starter.
4. Add your actual domain and test every page on mobile and desktop.
5. Update `products.json` when product information, prices or image paths change. Changes will appear across the pages after Cloudflare Pages republishes the site. Keep the product image files in the repository and verify their paths.

## Configure the Worker

1. In `worker/wrangler.toml`, set `ALLOWED_ORIGIN` to the exact production origin (scheme and hostname, no path).
2. Install Wrangler if needed and authenticate with Cloudflare.
3. From the `worker` directory, set secrets:
   ```bash
   npx wrangler secret put RAZORPAY_KEY_ID
   npx wrangler secret put RAZORPAY_KEY_SECRET
   ```
4. Configure plan IDs only after you create and verify matching plans in Razorpay.
5. Deploy from the `worker` directory:
   ```bash
   npx wrangler deploy
   ```
6. Set `workerBaseUrl` in `js/script.js` to the deployed Worker origin.
7. Test with Razorpay test-mode credentials first. Do not switch to live mode until the amount, billing interval, customer details, notes, redirects and cancellation path have been verified end to end.

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
