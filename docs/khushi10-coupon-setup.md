# KHUSHI10 coupon setup and deployment

The checkout and Worker changes are in this repository, but the existing Google Apps Script web app is deployed separately from GitHub. The Worker reads the coupon row from the existing Orders spreadsheet on every validation and order creation request, so edits to the coupon's value or Active cell take effect without a Worker redeployment.

## Google Sheets and Apps Script

1. Open the existing Vraj Naturals Orders Apps Script project that backs the production `ORDERS_WEB_APP_URL`.
2. Update its `orders.gs` source from this repository's `integrations/google-apps-script/orders.gs`. Preserve the existing script project properties and the current `ORDERS_API_TOKEN`.
3. Run `setupOrders()` as the existing script owner and authorize the requested Sheets scopes. It creates/updates the `Coupons` and `Coupon Orders` tabs and seeds `KHUSHI10` only if that code is not already present. Existing coupon values and Active state are preserved.
4. Deploy a new version of the existing web app, keeping its current URL/access configuration. Do not create a new API token or change the Worker secret binding.
5. Confirm the `Coupons` row shows: `KHUSHI10`, `Percentage`, `10`, `One-time purchases only`, `All eligible products`, `0`, `No cap`, `TRUE`, `Unlimited`, `Unlimited`, `FALSE`.

The Worker uses its private API token to read the coupon. Customers cannot set a discount amount in the browser. Paid one-time orders with a coupon are recorded once in `Coupon Orders`; subscription events are excluded.

## Cloudflare and GitHub

- Merging the code to the Pages production branch deploys the checkout UI through the repository's existing Pages connection.
- The Razorpay Worker is a separate service in this repository. Deploy `worker/` to the existing production Worker after merging, using the account's normal Cloudflare deployment process. Keep the current production bindings and secrets.
- The Google Apps Script deployment above must be completed before enabling the visible coupon. Until the Worker and Apps Script are both updated, coupon validation will fail closed and will not create a discounted Razorpay order.

No subscription pricing, plans, or recurring payment handling are changed by this coupon.
