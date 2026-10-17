/**
 * The Vraj Circle lead capture endpoint for Google Apps Script.
 * Deploy as a Web App that executes as the spreadsheet owner.
 * It writes to a private Sheet and sends owner-only notifications; it never
 * sends marketing messages to subscribers.
 */
const LEADS_SHEET_NAME = "Vraj Naturals - Customer Leads";
const LEADS_TAB_NAME = "Leads";
const OWNER_NOTIFICATION = "info@vrajnaturals.com";
const CONSENT_VERSION = "v1.0";
const MARKETING_CONSENT_TEXT = "I agree to receive occasional updates and offers from Vraj Naturals by email and WhatsApp. I can opt out at any time.";
const LEAD_HEADERS = [
  "Submission ID", "Full name", "Email address", "Mobile number",
  "Email marketing consent", "WhatsApp marketing consent",
  "Consent timestamp (UTC)", "Consent wording/version", "Submission timestamp (UTC)",
  "Source page", "Lead status", "Consent withdrawal timestamp (UTC)"
];

/** Run once as the owner to create and initialize the private spreadsheet. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("LEADS_SPREADSHEET_ID");
  const spreadsheet = existingId ? SpreadsheetApp.openById(existingId) : SpreadsheetApp.create(LEADS_SHEET_NAME);
  props.setProperty("LEADS_SPREADSHEET_ID", spreadsheet.getId());
  let sheet = spreadsheet.getSheetByName(LEADS_TAB_NAME);
  if (!sheet) {
    const first = spreadsheet.getSheets()[0];
    if (first && first.getLastRow() === 0 && first.getName() === "Sheet1") {
      first.setName(LEADS_TAB_NAME);
      sheet = first;
    } else sheet = spreadsheet.insertSheet(LEADS_TAB_NAME);
  }
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]);
  sheet.setFrozenRows(1);
  console.log("Private lead spreadsheet created/initialized: " + spreadsheet.getUrl());
  return spreadsheet.getUrl();
}

/**
 * Owner-run helper for a preference withdrawal request received by email.
 * channel must be "email", "whatsapp", or "all". The original consent row
 * is retained; this appends a dated withdrawal event for the newest lead row.
 */
function recordConsentWithdrawal(emailAddress, channel) {
  const email = String(emailAddress || "").trim().toLowerCase();
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!["email", "whatsapp", "all"].includes(normalizedChannel)) throw new Error('Channel must be "email", "whatsapp", or "all".');
  const id = PropertiesService.getScriptProperties().getProperty("LEADS_SPREADSHEET_ID");
  if (!id) throw new Error("Run setup() first.");
  const sheet = SpreadsheetApp.openById(id).getSheetByName(LEADS_TAB_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No lead records were found.");
  const rows = sheet.getRange(2, 1, lastRow - 1, LEAD_HEADERS.length).getValues();
  let latest = null;
  for (const row of rows) if (String(row[2]).replace(/^'/, "").toLowerCase() === email) latest = row;
  if (!latest) throw new Error("No lead record matches that email address.");
  const now = new Date().toISOString();
  const emailConsent = normalizedChannel === "email" || normalizedChannel === "all" ? "No" : latest[4];
  const whatsappConsent = normalizedChannel === "whatsapp" || normalizedChannel === "all" ? "No" : latest[5];
  const label = normalizedChannel === "all" ? "email and WhatsApp" : normalizedChannel;
  sheet.appendRow([
    Utilities.getUuid(), latest[1], latest[2], latest[3], emailConsent, whatsappConsent,
    now, JSON.stringify({ version: CONSENT_VERSION, event: "withdrawal", channel: normalizedChannel }),
    now, "/preferences", "Consent withdrawn — " + label, now
  ]);
  console.log("Consent withdrawal recorded for " + email + " (" + normalizedChannel + ").");
}

function doPost(e) {
  let requestId = "";
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw || raw.length > 8000) return resultPage_({ saved: false, error: "Invalid signup request.", requestId });
    let payload;
    try { payload = JSON.parse(raw); }
    catch (_) { return resultPage_({ saved: false, error: "Invalid signup request.", requestId }); }
    requestId = String(payload.requestId || "");
    let lead;
    try { lead = normalizeLead_(payload); }
    catch (validationError) { return resultPage_({ saved: false, error: validationError.message, requestId }); }
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("LEADS_SPREADSHEET_ID");
    if (!spreadsheetId) return resultPage_({ saved: false, error: "Signup is temporarily unavailable. Please email info@vrajnaturals.com.", requestId });

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return resultPage_({ saved: false, error: "Please wait a moment and try again.", requestId });
    try {
      const cache = CacheService.getScriptCache();
      const signature = digest_([lead.email, lead.mobile, lead.emailConsent, lead.whatsappConsent].join("|"));
      if (cache.get("duplicate_" + signature)) return resultPage_({ saved: true, duplicate: true, requestId });
      if (cache.get("global_submit_cooldown")) return resultPage_({ saved: false, error: "Please wait a moment before trying again.", requestId });

      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheetByName(LEADS_TAB_NAME);
      if (!sheet) throw new Error("Lead sheet tab is missing; run setup().");
      const now = new Date();
      const timestamp = now.toISOString();
      const submissionId = Utilities.getUuid();
      const consentWording = JSON.stringify({ version: CONSENT_VERSION, email: MARKETING_CONSENT_TEXT, whatsapp: MARKETING_CONSENT_TEXT });
      const status = lead.emailConsent ? "Captured" : "Captured — no marketing consent";
      sheet.appendRow([
        submissionId, sheetText_(lead.fullName), sheetText_(lead.email), sheetText_(lead.mobile),
        lead.emailConsent ? "Yes" : "No", lead.whatsappConsent ? "Yes" : "No",
        timestamp, consentWording, timestamp, sheetText_(lead.sourcePage), status, ""
      ]);
      SpreadsheetApp.flush();
      try {
        cache.put("duplicate_" + signature, "1", 21600);
        cache.put("global_submit_cooldown", "1", 2);
      } catch (cacheError) {
        console.error("Lead saved; best-effort rate-limit cache was unavailable: " + cacheError.message);
      }

      let notificationSent = true;
      try {
        const body = [
          "A new valid lead was saved to the Vraj Naturals - Customer Leads spreadsheet.",
          "",
          "Subscriber name: " + lead.fullName,
          "Email address: " + lead.email,
          "Mobile number: " + (lead.mobile || "Not provided"),
          "Email marketing consent: " + (lead.emailConsent ? "Yes" : "No"),
          "WhatsApp marketing consent: " + (lead.whatsappConsent ? "Yes" : "No"),
          "Submission date and time (UTC): " + timestamp,
          "Source page: " + lead.sourcePage,
          "Submission ID: " + submissionId
        ].join("\n");
        MailApp.sendEmail({
          to: OWNER_NOTIFICATION,
          subject: "New Vraj Naturals Lead - The Vraj Circle",
          body
        });
      } catch (mailError) {
        notificationSent = false;
        console.error("Lead saved but owner notification failed: " + mailError.message);
      }
      return resultPage_({ saved: true, notificationSent, requestId });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("Vraj Circle lead capture error: " + error.message);
    return resultPage_({ saved: false, error: "We couldn't save your signup. Please try again or email info@vrajnaturals.com.", requestId });
  }
}

function normalizeLead_(payload) {
  const requestId = String(payload.requestId || "");
  if (!/^[A-Za-z0-9-]{16,80}$/.test(requestId)) throw new Error("Please refresh the page and try again.");
  const fullName = String(payload.fullName || "").trim().replace(/\s+/g, " ");
  const email = String(payload.email || "").trim().toLowerCase();
  if (String(payload.website || "").trim()) throw new Error("Invalid signup request.");
  const startedAt = Number(payload.startedAt || 0);
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || elapsed < 2500 || elapsed > 86400000) throw new Error("Please refresh and try again.");
  if (!fullName || fullName.length > 100) throw new Error("Enter a valid name.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const mobile = normalizePhone_(payload.mobile);
  const marketingConsent = payload.emailConsent === true && payload.whatsappConsent === true;
  const emailConsent = marketingConsent;
  const whatsappConsent = marketingConsent;
  const source = String(payload.sourcePage || "").split(/[?#]/)[0];
  const sourcePage = source.startsWith("/") && source.length < 200 ? source : "Unknown";
  return { requestId, fullName, email, mobile, emailConsent, whatsappConsent, sourcePage };
}

function normalizePhone_(value) {
  const raw = String(value || "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) throw new Error("Enter a valid mobile number with its country code.");
  const digits = raw.slice(1);
  if (/^(\d)\1+$/.test(digits)) throw new Error("Enter a valid mobile number with its country code.");
  if (raw.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(raw)) throw new Error("Enter a valid Indian mobile number.");
  return raw;
}

function digest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function sheetText_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "\'" + text : text;
}

function resultPage_(result) {
  const message = JSON.stringify({ type: "vraj-circle-result", ...result }).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><head><meta charset='utf-8'></head><body><script>window.top.postMessage(" + message + ", '*');</script></body></html>";
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
