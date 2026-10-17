# The Vraj Circle: setup and launch

The site now contains the popup, footer entry point, consent handling, and a Google Apps Script endpoint source file. **The lead form is not connected until the steps below are completed.** With the endpoint URL unset, the page shows a clear unavailable message and never displays a false success.

## Create the private lead spreadsheet

1. Sign in to the Google account that should own the lead data and notifications.
2. Open [script.google.com](https://script.google.com/) and create a new standalone Apps Script project named **The Vraj Circle**.
3. Copy `integrations/google-apps-script/vraj-circle.gs` into the Apps Script editor, replacing the starter file.
4. Select and run `setup()` once. Review and grant the requested Sheets permission. The script creates **Vraj Naturals - Customer Leads**, adds the `Leads` tab and header row, and logs its spreadsheet URL.
5. Open the spreadsheet and keep its sharing restricted to the owner and specifically authorised staff. Do not enable link sharing or publish it.
6. Run `setup()` only once unless the stored spreadsheet ID is intentionally being changed. The ID is stored in Apps Script Script Properties, not in the website.

## Deploy the form endpoint

1. In Apps Script, choose **Deploy → New deployment → Web app**.
2. Set **Execute as** to your account. The website visitor must not need a Google account to submit the public signup form. Choose the least-public access option Google offers that still permits anonymous submissions; this commonly appears as **Anyone**. The spreadsheet itself stays private.
3. Deploy and approve the requested Sheets and email permissions. Copy the deployed URL ending in `/exec`.
4. Add that URL to `APPS_SCRIPT_URL` in `js/vraj-circle.js`. Keep the URL private enough to avoid unnecessary exposure, but note that a public form endpoint cannot be treated as a secret.
5. Save and deploy the website through your normal process. Submit a test using an address and phone number you control, verify the row in the private sheet, then verify the email sent to **info@vrajnaturals.com**. Test the unchecked and checked marketing option, duplicate, and invalid-mobile submissions. Remove the test record afterward if appropriate.

### Publish endpoint code updates

When `integrations/google-apps-script/vraj-circle.gs` changes, copy the complete updated file into the Apps Script editor and save it. Then open **Deploy → Manage deployments**, edit the existing web app deployment, select **New version**, and deploy. Keep the same `/exec` URL; the site is already configured to use it. The latest site code expects a request ID in the response and a required, country-validated mobile number, so update the Apps Script deployment before testing the revised form.

The browser submits a standard form to a hidden iframe; the Apps Script response reports only whether the record was saved. It does not return subscriber information to the public page. The owner notification is sent only after the row is appended. If sending the email fails after a row is saved, the record remains saved, the error is logged in Apps Script, and the visitor is not told that saving failed.

## Data and consent handling

Each accepted submission records a server-generated ID, name, normalized lowercase email, required international mobile number, one optional marketing choice for both email and WhatsApp, UTC consent and submission timestamps, the consent wording/version, source path, lead status, and an initially blank withdrawal timestamp. The country picker defaults to India (+91); the visitor can choose another country. The marketing checkbox starts unchecked. This endpoint sends no marketing messages.

The endpoint rejects invalid requests and a filled honeypot, checks that the form was not submitted instantly, serializes writes with a script lock, throttles rapid requests, and suppresses identical submissions for up to six hours using Apps Script cache. Cache-based duplicate/rate controls are best-effort and may expire early. The public endpoint can still receive automated traffic; review the sheet and Apps Script execution logs. For stronger bot protection, add Cloudflare Turnstile and a server-side verification route before advertising the form widely.

Visitors can request an update or withdrawal by emailing `info@vrajnaturals.com` using the link in the form. Until a self-service preference tool is added, the owner must action those requests in the private sheet and record the withdrawal timestamp/status. In the Apps Script editor, create a temporary wrapper such as `function processWithdrawal(){ recordConsentWithdrawal("customer@example.com", "email"); }`, replace the example address and channel with the request, and run that wrapper. Use channel `email`, `whatsapp`, or `all`; the helper appends a withdrawal event while preserving the original consent record. Remove the temporary wrapper after processing. Staff should use the newest event for that address when preparing any consent-based audience.

Google Apps Script and Gmail/MailApp have account-specific quotas and may require account-owner consent. If the deployment is blocked by Workspace policy, or if quotas and public endpoint abuse become a concern, do not work around it by exposing credentials in browser code; use a server-side integration with a verified anti-bot check.

## Before launch

- Confirm the Google account owner, authorised spreadsheet users, and a retention/deletion schedule.
- Verify the deployed endpoint from the actual production website and the exact production browser origin.
- Verify the Apps Script deployment remains active after code changes; create a new deployment version when required.
- Confirm Google permits public web app access for this account and that email quotas meet expected lead volume.
- Review the privacy notice and withdrawal process with the responsible business/legal adviser.
