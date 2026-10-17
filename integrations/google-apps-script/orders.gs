/**
 * Private order ledger and customer email service for Vraj Naturals.
 * Add this file to the existing Apps Script project alongside vraj-circle.gs.
 * The Orders spreadsheet is deliberately separate from Vraj Circle leads.
 */
const ORDERS_SHEET_ID = "1SAlMmmOOQjBfo0seiMzYf_gbo5eFBoZJulfdPt1XNTo";
const ORDERS_TAB = "Orders";
const PAYMENT_EVENTS_TAB = "Payment Events";
const ORDER_OWNER_EMAIL = "info@vrajnaturals.com";
const CUSTOMER_SENDER_EMAIL = "vrajnaturals@gmail.com";
const ORDER_REMINDER_DELAY_MS = 24 * 60 * 1000;
const ORDER_HEADERS = [
  "Order ID", "Local Request ID", "Created At (UTC)", "Updated At (UTC)",
  "Customer Name", "Customer Email", "Customer Phone", "Address Line 1",
  "Address Line 2", "City", "State", "PIN Code", "Country", "Items (JSON)",
  "Products Subtotal (INR)", "Delivery Fee (INR)", "Total (INR)",
  "Frequency", "Order Status", "Payment Status", "Razorpay Subscription/Order ID",
  "Razorpay Plan ID/Order Type", "Latest Payment ID", "Email Reminder Consent",
  "Reminder Sent At (UTC)", "Last Success Email Event ID", "Last Failure Email Event ID",
  "Checkout URL", "Last Event", "Last Failure Reason"
];
const PAYMENT_EVENT_HEADERS = [
  "Event ID", "Received At (UTC)", "Event Type", "Order ID",
  "Razorpay Subscription/Order ID", "Razorpay Payment ID", "Payment Status",
  "Amount (INR)", "Failure Reason", "Processed Result"
];

/** Standalone Web App entry point for the separate Vraj Naturals Orders project. */
function doPost(e) {
  const rawBody = e && e.postData && e.postData.contents;
  if (!rawBody || rawBody.length > 30000) return orderJson_({ ok: false, error: "Invalid request." });
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch (_) { return orderJson_({ ok: false, error: "Invalid JSON request." }); }
  if (payload.kind !== "vraj-order-api") return orderJson_({ ok: false, error: "Unknown request." });
  return handleOrderApi_(payload);
}

/** Run once as the Apps Script owner. Authorizes Sheet and email access. */
function setupOrders() {
  const spreadsheet = SpreadsheetApp.openById(ORDERS_SHEET_ID);
  PropertiesService.getScriptProperties().setProperty("ORDERS_SPREADSHEET_ID", ORDERS_SHEET_ID);
  ensureOrderTab_(spreadsheet, ORDERS_TAB, ORDER_HEADERS);
  ensureOrderTab_(spreadsheet, PAYMENT_EVENTS_TAB, PAYMENT_EVENT_HEADERS);
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(trigger => trigger.getHandlerFunction() === "sendAbandonedCheckoutReminders_")) {
    ScriptApp.newTrigger("sendAbandonedCheckoutReminders_").timeBased().everyMinutes(5).create();
  }
  console.log("Orders sheet initialized: " + spreadsheet.getUrl());
  return spreadsheet.getUrl();
}

function ensureOrderTab_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

/** Called once by the owner after choosing a long random shared token. */
function saveOrdersApiToken(token) {
  const value = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(value)) throw new Error("Use a random token between 40 and 128 characters (letters, numbers, _ or -).");
  PropertiesService.getScriptProperties().setProperty("ORDERS_API_TOKEN", value);
  console.log("Orders API token saved. Do not share it in email or chat.");
}

function handleOrderApi_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty("ORDERS_API_TOKEN");
  if (!expected || !payload.token || !constantTimeEqual_(String(payload.token), expected)) {
    return orderJson_({ ok: false, error: "Unauthorized." });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return orderJson_({ ok: false, error: "Busy; retry shortly." });
  try {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("ORDERS_SPREADSHEET_ID");
    if (!spreadsheetId) return orderJson_({ ok: false, error: "Run setupOrders() first." });
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    if (payload.action === "create-order") return createOrderRow_(spreadsheet, payload.order || {});
    if (payload.action === "checkout-created") return updateCheckoutRow_(spreadsheet, payload);
    if (payload.action === "checkout-failed") return markCheckoutFailed_(spreadsheet, payload);
    if (payload.action === "payment-event") return recordPaymentEvent_(spreadsheet, payload.event || {});
    return orderJson_({ ok: false, error: "Unknown action." });
  } catch (error) {
    console.error("Orders API failure: " + error.message);
    return orderJson_({ ok: false, error: "Order service is temporarily unavailable." });
  } finally {
    lock.releaseLock();
  }
}

function createOrderRow_(spreadsheet, order) {
  const requestId = String(order.localRequestId || "");
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return orderJson_({ ok: false, error: "Invalid local request ID." });
  const sheet = spreadsheet.getSheetByName(ORDERS_TAB);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === requestId) return orderJson_({
      ok: true, orderId: String(rows[i][0]), duplicate: true,
      status: String(rows[i][18] || ""), subscriptionId: String(rows[i][20] || ""),
      planId: String(rows[i][21] || ""), checkoutUrl: String(rows[i][27] || ""),
      total: Number(rows[i][16]) || 0
    });
  }
  const orderId = Utilities.getUuid();
  const now = new Date().toISOString();
  const items = Array.isArray(order.items) ? order.items : [];
  sheet.appendRow([
    orderId, requestId, now, now,
    orderCell_(order.customerName), orderCell_(order.email), orderCell_(order.phone),
    orderCell_(order.address1), orderCell_(order.address2), orderCell_(order.city),
    orderCell_(order.state), orderCell_(order.postalCode), orderCell_(order.country),
    JSON.stringify(items).slice(0, 45000), Number(order.productsSubtotal) || 0,
    Number(order.deliveryFee) || 0, Number(order.total) || 0,
    orderCell_(order.frequency), "Creating checkout", "Not paid", "", "", "",
    order.emailReminderConsent === true ? "Yes" : "No", "", "", "", "", "", ""
  ]);
  SpreadsheetApp.flush();
  return orderJson_({ ok: true, orderId, duplicate: false });
}

function updateCheckoutRow_(spreadsheet, payload) {
  const row = findOrderRow_(spreadsheet, String(payload.orderId || ""));
  if (!row) return orderJson_({ ok: false, error: "Order not found." });
  const sheet = spreadsheet.getSheetByName(ORDERS_TAB);
  const now = new Date().toISOString();
  sheet.getRange(row, 4).setValue(now);
  sheet.getRange(row, 19).setValue("Checkout started");
  sheet.getRange(row, 21, 1, 3).setValues([[
    orderCell_(payload.subscriptionId), orderCell_(payload.planId), ""
  ]]);
  sheet.getRange(row, 28).setValue(orderCell_(payload.checkoutUrl));
  SpreadsheetApp.flush();
  return orderJson_({ ok: true });
}

function markCheckoutFailed_(spreadsheet, payload) {
  const row = findOrderRow_(spreadsheet, String(payload.orderId || ""));
  if (!row) return orderJson_({ ok: false, error: "Order not found." });
  const sheet = spreadsheet.getSheetByName(ORDERS_TAB);
  sheet.getRange(row, 4).setValue(new Date().toISOString());
  sheet.getRange(row, 19).setValue("Checkout creation failed");
  sheet.getRange(row, 30).setValue(orderCell_(payload.reason || "Provider error"));
  return orderJson_({ ok: true });
}

function recordPaymentEvent_(spreadsheet, event) {
  const eventId = String(event.eventId || "");
  const eventType = String(event.eventType || "");
  if (!eventId || eventId.length > 200 || !eventType || eventType.length > 100) return orderJson_({ ok: false, error: "Invalid payment event." });
  const eventsSheet = spreadsheet.getSheetByName(PAYMENT_EVENTS_TAB);
  const priorEvents = eventsSheet.getDataRange().getValues();
  for (let i = 1; i < priorEvents.length; i++) {
    if (String(priorEvents[i][0]) === eventId) return orderJson_({ ok: true, duplicate: true });
  }
  const subscriptionId = String(event.subscriptionId || "");
  const row = findOrderBySubscription_(spreadsheet, subscriptionId);
  const orderSheet = spreadsheet.getSheetByName(ORDERS_TAB);
  const orderId = row ? String(orderSheet.getRange(row, 1).getValue()) : "";
  const now = new Date().toISOString();
  const paymentId = String(event.paymentId || "");
  const paymentStatus = String(event.paymentStatus || "Unknown");
  const failureReason = String(event.failureReason || "").slice(0, 500);
  const result = row ? applyPaymentStatus_(orderSheet, row, event, now) : "Unmatched subscription";
  eventsSheet.appendRow([
    orderCell_(eventId), now, orderCell_(eventType), orderCell_(orderId),
    orderCell_(subscriptionId), orderCell_(paymentId), orderCell_(paymentStatus),
    Number(event.amount) || 0, orderCell_(failureReason), result
  ]);
  SpreadsheetApp.flush();
  return orderJson_({ ok: true, duplicate: false, matched: Boolean(row) });
}

function applyPaymentStatus_(sheet, row, event, now) {
  const eventType = String(event.eventType || "");
  const paymentId = String(event.paymentId || "");
  const failureReason = String(event.failureReason || "").slice(0, 500);
  sheet.getRange(row, 4).setValue(now);
  sheet.getRange(row, 23).setValue(orderCell_(paymentId));
  sheet.getRange(row, 29).setValue(orderCell_(eventType));
  if (["subscription.activated", "subscription.charged", "order.paid", "payment.captured"].includes(eventType)) {
    const oneTimeOrder = String(sheet.getRange(row, 18).getValue() || "") === "One-time order";
    sheet.getRange(row, 19).setValue(oneTimeOrder ? "Order received" : "Active");
    sheet.getRange(row, 20).setValue("Paid");
    const sentId = String(sheet.getRange(row, 26).getValue() || "");
    const emailEventId = String(event.paymentId || event.eventId);
    if (sentId !== emailEventId) {
      let customerEmailSent = false;
      try { customerEmailSent = sendOrderEmail_(sheet, row, "success", event); }
      catch (error) { console.error("Customer success email failed: " + error.message); }
      try { sendOwnerOrderNotice_(sheet, row, oneTimeOrder ? "One-time order payment confirmed" : "Subscription payment confirmed", eventType); }
      catch (error) { console.error("Owner payment notice failed: " + error.message); }
      if (customerEmailSent) sheet.getRange(row, 26).setValue(orderCell_(emailEventId));
    }
    return "Payment success recorded";
  }
  if (eventType === "order.authorized") {
    sheet.getRange(row, 19).setValue("Payment authorised; awaiting capture");
    sheet.getRange(row, 20).setValue("Authorised");
    return "Payment authorisation recorded; awaiting capture";
  }
  if (eventType === "payment.failed") {
    sheet.getRange(row, 20).setValue("Failed");
    sheet.getRange(row, 30).setValue(orderCell_(failureReason));
    const emailEventId = String(event.paymentId || event.eventId);
    if (String(sheet.getRange(row, 27).getValue() || "") !== emailEventId) {
      let customerEmailSent = false;
      try { customerEmailSent = sendOrderEmail_(sheet, row, "failed", event); }
      catch (error) { console.error("Customer failure email failed: " + error.message); }
      const oneTimeOrder = String(sheet.getRange(row, 18).getValue() || "") === "One-time order";
      try { sendOwnerOrderNotice_(sheet, row, oneTimeOrder ? "One-time order payment failed" : "Subscription payment failed", failureReason || eventType); }
      catch (error) { console.error("Owner payment failure notice failed: " + error.message); }
      if (customerEmailSent) sheet.getRange(row, 27).setValue(orderCell_(emailEventId));
    }
    return "Payment failure recorded";
  }
  if (eventType === "subscription.pending") {
    sheet.getRange(row, 19).setValue("Payment pending");
    sheet.getRange(row, 20).setValue("Pending");
    return "Pending status recorded";
  }
  if (eventType === "subscription.halted") {
    sheet.getRange(row, 19).setValue("Halted");
    sheet.getRange(row, 20).setValue("Failed after retries");
    sendOwnerOrderNotice_(sheet, row, "Subscription halted", eventType);
    return "Halted status recorded";
  }
  if (eventType === "subscription.cancelled") {
    sheet.getRange(row, 19).setValue("Cancelled");
    return "Cancellation recorded";
  }
  return "Event recorded; no order status change";
}

function sendOrderEmail_(sheet, row, kind, event) {
  const order = orderRecord_(sheet, row);
  const successful = kind === "success";
  const oneTimeOrder = order.frequency === "One-time order";
  const subject = oneTimeOrder
    ? (successful ? "Your Vraj Naturals order is confirmed" : "Payment update for your Vraj Naturals order")
    : (successful ? "Your Vraj Naturals subscription is confirmed" : "Payment update for your Vraj Naturals subscription");
  const intro = successful
    ? (oneTimeOrder ? "Your payment has been confirmed and your order is received. We’ll contact you about fulfilment." : "Your subscription payment has been confirmed. We’ve recorded your order details and will contact you about fulfilment.")
    : (oneTimeOrder ? "Razorpay reported that this payment did not complete. Please retry checkout or contact us for help." : "Razorpay reported that a subscription payment did not complete. You can retry using your Razorpay subscription link or contact us for help.");
  const body = [
    "Hello " + order.name + ",", "",
    intro,
    "", "ORDER SUMMARY", "Order reference: " + order.orderId,
    "", "Items", order.itemLines,
    "Product subtotal: ₹" + formatInr_(order.productsSubtotal),
    "Delivery fee: ₹" + formatInr_(order.deliveryFee),
    "Delivery address: " + order.address,
    (oneTimeOrder ? "Order total: ₹" : "Recurring total: ₹") + formatInr_(order.total) + (oneTimeOrder ? "" : " per delivery"),
    oneTimeOrder ? "Order type: One-time purchase" : "Schedule: " + order.frequency,
    event.paymentId ? "Payment reference: " + event.paymentId : "",
    !successful && (event.checkoutUrl || order.checkoutUrl) ? "Retry checkout: " + (event.checkoutUrl || order.checkoutUrl) : "",
    "", "Questions? Email info@vrajnaturals.com.", "Vraj Naturals"
  ].filter(Boolean).join("\n");
  const itemRows = order.itemsList.map(item => "<tr>" +
    "<td style=\"padding:10px;border-bottom:1px solid #e7e2d7\">" + escapeHtml_(item.name || item.id || "Item") + "</td>" +
    "<td style=\"padding:10px;border-bottom:1px solid #e7e2d7;text-align:center\">" + Number(item.weightKg || 0) + " kg × " + Number(item.packs || 0) + " pack(s)</td>" +
    "<td style=\"padding:10px;border-bottom:1px solid #e7e2d7;text-align:right\">₹" + formatInr_(item.lineTotal) + "</td></tr>").join("");
  const htmlBody = "<div style=\"font-family:Arial,sans-serif;color:#292d29;line-height:1.6;max-width:640px;margin:auto\">" +
    "<h1 style=\"color:#173d24;font-size:24px\">" + (oneTimeOrder ? (successful ? "Order confirmed" : "Payment update") : (successful ? "Subscription confirmed" : "Payment update")) + "</h1>" +
    "<p>Hello " + escapeHtml_(order.name) + ",</p><p>" + escapeHtml_(intro) + "</p>" +
    "<p><strong>Order reference:</strong> " + escapeHtml_(order.orderId) + "</p>" +
    "<table style=\"border-collapse:collapse;width:100%;font-size:14px\"><thead><tr style=\"background:#f5f2e9;text-align:left\"><th style=\"padding:10px\">Item</th><th style=\"padding:10px;text-align:center\">Pack</th><th style=\"padding:10px;text-align:right\">Amount</th></tr></thead><tbody>" + itemRows + "</tbody></table>" +
    "<p><strong>Product subtotal:</strong> ₹" + formatInr_(order.productsSubtotal) + "<br><strong>Delivery fee:</strong> ₹" + formatInr_(order.deliveryFee) + "<br><strong>" + (oneTimeOrder ? "Order total:" : "Total per delivery:") + "</strong> ₹" + formatInr_(order.total) + (oneTimeOrder ? "" : "<br><strong>Schedule:</strong> " + escapeHtml_(order.frequency)) + "</p>" +
    "<p><strong>Delivery address:</strong><br>" + escapeHtml_(order.address) + "</p>" +
    (event.paymentId ? "<p><strong>Payment reference:</strong> " + escapeHtml_(event.paymentId) + "</p>" : "") +
    (!successful && (event.checkoutUrl || order.checkoutUrl) ? "<p><a href=\"" + escapeHtml_(event.checkoutUrl || order.checkoutUrl) + "\">Retry checkout securely</a></p>" : "") +
    "<p>Questions? Email <a href=\"mailto:info@vrajnaturals.com\">info@vrajnaturals.com</a>.</p><p>Vraj Naturals</p></div>";
  sendCustomerEmail_({ to: order.email, subject, body, htmlBody });
  return true;
}

/** Send customer-facing mail from the verified Vraj Naturals Gmail alias. */
function sendCustomerEmail_(message) {
  const sender = CUSTOMER_SENDER_EMAIL.toLowerCase();
  const effectiveUser = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  const aliases = GmailApp.getAliases().map(email => String(email).toLowerCase());
  if (effectiveUser !== sender && !aliases.includes(sender)) {
    throw new Error("Add and verify " + CUSTOMER_SENDER_EMAIL + " as a Gmail Send mail as alias for the Apps Script owner, then retry.");
  }
  GmailApp.sendEmail(message.to, message.subject, message.body, {
    htmlBody: message.htmlBody,
    from: CUSTOMER_SENDER_EMAIL,
    name: "Vraj Naturals",
    replyTo: CUSTOMER_SENDER_EMAIL
  });
}

/** Run once manually to authorize Gmail sending and verify the branded alias. */
function authorizeCustomerSender_() {
  const sender = CUSTOMER_SENDER_EMAIL.toLowerCase();
  const effectiveUser = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  const aliases = GmailApp.getAliases().map(email => String(email).toLowerCase());
  if (effectiveUser !== sender && !aliases.includes(sender)) {
    throw new Error("The verified sender alias " + CUSTOMER_SENDER_EMAIL + " is not available to this script owner.");
  }
  console.log("Customer sender is ready: " + CUSTOMER_SENDER_EMAIL);
  return true;
}

function sendOwnerOrderNotice_(sheet, row, subject, detail) {
  const order = orderRecord_(sheet, row);
  const itemRows = order.itemsList.map(item => "<tr>" +
    "<td style=\"padding:9px;border-bottom:1px solid #e7e2d7\">" + escapeHtml_(item.name || item.id || "Item") + "</td>" +
    "<td style=\"padding:9px;border-bottom:1px solid #e7e2d7;text-align:center\">" + Number(item.weightKg || 0) + " kg × " + Number(item.packs || 0) + "</td>" +
    "<td style=\"padding:9px;border-bottom:1px solid #e7e2d7;text-align:right\">₹" + formatInr_(item.unitPricePerKg) + "/kg</td>" +
    "<td style=\"padding:9px;border-bottom:1px solid #e7e2d7;text-align:right\">₹" + formatInr_(item.lineTotal) + "</td></tr>").join("");
  const body = [subject, "", "Order reference: " + order.orderId,
    "Customer: " + order.name, "Email: " + order.email, "Phone: " + order.phone,
    "Items:", order.itemLines, "Address: " + order.address,
    "Product subtotal: ₹" + formatInr_(order.productsSubtotal), "Delivery fee: ₹" + formatInr_(order.deliveryFee),
    (order.frequency === "One-time order" ? "Order total: ₹" : "Total per delivery: ₹") + formatInr_(order.total), "Order type / frequency: " + order.frequency,
    "Subscription: " + order.subscriptionId, "Payment: " + order.paymentId, "Event: " + detail].join("\n");
  const htmlBody = "<div style=\"font-family:Arial,sans-serif;color:#292d29;line-height:1.55;max-width:760px;margin:auto\">" +
    "<h1 style=\"font-size:22px;color:#173d24\">" + escapeHtml_(subject) + "</h1>" +
    "<p><strong>Order reference:</strong> " + escapeHtml_(order.orderId) + "<br><strong>Customer:</strong> " + escapeHtml_(order.name) + "<br>" +
    "<strong>Email:</strong> <a href=\"mailto:" + escapeHtml_(order.email) + "\">" + escapeHtml_(order.email) + "</a><br>" +
    "<strong>Phone:</strong> " + escapeHtml_(order.phone) + "<br><strong>Address:</strong> " + escapeHtml_(order.address) + "</p>" +
    "<table style=\"border-collapse:collapse;width:100%;font-size:13px\"><thead><tr style=\"background:#f5f2e9;text-align:left\"><th style=\"padding:9px\">Product</th><th style=\"padding:9px;text-align:center\">Pack selection</th><th style=\"padding:9px;text-align:right\">Rate</th><th style=\"padding:9px;text-align:right\">Line total</th></tr></thead><tbody>" + itemRows + "</tbody></table>" +
    "<p><strong>Product subtotal:</strong> ₹" + formatInr_(order.productsSubtotal) + "<br><strong>Delivery fee:</strong> ₹" + formatInr_(order.deliveryFee) + "<br><strong>" + (order.frequency === "One-time order" ? "Order total:" : "Total per delivery:") + "</strong> ₹" + formatInr_(order.total) + "<br><strong>Order type / frequency:</strong> " + escapeHtml_(order.frequency) + "</p>" +
    "<p><strong>Razorpay reference:</strong> " + escapeHtml_(order.subscriptionId) + "<br><strong>Payment:</strong> " + escapeHtml_(order.paymentId) + "<br><strong>Event:</strong> " + escapeHtml_(detail) + "</p></div>";
  MailApp.sendEmail({
    to: ORDER_OWNER_EMAIL,
    subject: subject + " — " + order.name + " — ₹" + formatInr_(order.total) + (order.frequency === "One-time order" ? "" : " / delivery"),
    body,
    htmlBody,
    name: "Vraj Naturals Orders",
    replyTo: order.email
  });
}

function sendAbandonedCheckoutReminders_() {
  const id = PropertiesService.getScriptProperties().getProperty("ORDERS_SPREADSHEET_ID");
  if (!id) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const sheet = SpreadsheetApp.openById(id).getSheetByName(ORDERS_TAB);
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = sheet.getDataRange().getValues();
    const now = Date.now();
    for (let i = 1; i < rows.length; i++) {
      const row = i + 1;
      const created = new Date(rows[i][2]).getTime();
      const status = String(rows[i][18] || "");
      const optedIn = String(rows[i][23]) === "Yes";
      const reminderSent = String(rows[i][24] || "");
      const checkoutUrl = String(rows[i][27] || "");
      if (status !== "Checkout started" || !optedIn || reminderSent || !checkoutUrl || !Number.isFinite(created) || now - created < ORDER_REMINDER_DELAY_MS) continue;
      const order = orderRecord_(sheet, row);
      sendCustomerEmail_({
        to: order.email,
        subject: "Your Vraj Naturals checkout is waiting",
        body: ["Hello " + order.name + ",", "", "You started a pantry subscription checkout but did not complete it.",
          "", "YOUR SELECTION", order.itemLines, "", "Product subtotal: ₹" + formatInr_(order.productsSubtotal),
          "Delivery fee: ₹" + formatInr_(order.deliveryFee), "Recurring total: ₹" + formatInr_(order.total) + " per delivery",
          "Continue securely with Razorpay: " + checkoutUrl, "", "If you no longer want this subscription, you can ignore this email.",
          "Questions? Email info@vrajnaturals.com.", "Vraj Naturals"].join("\n"),
        htmlBody: "<div style=\"font-family:Arial,sans-serif;color:#292d29;line-height:1.6;max-width:640px;margin:auto\"><h1 style=\"color:#173d24\">Your checkout is waiting</h1><p>Hello " + escapeHtml_(order.name) + ",</p><p>You started a pantry subscription checkout but did not complete it.</p><h2 style=\"font-size:16px;color:#173d24\">Your selection</h2><ul>" + order.itemsList.map(item => "<li>" + escapeHtml_(item.name || item.id || "Item") + " — " + Number(item.weightKg || 0) + " kg × " + Number(item.packs || 0) + " pack(s) — ₹" + formatInr_(item.lineTotal) + "</li>").join("") + "</ul><p>Product subtotal: ₹" + formatInr_(order.productsSubtotal) + "<br>Delivery fee: ₹" + formatInr_(order.deliveryFee) + "<br><strong>Recurring total: ₹" + formatInr_(order.total) + " per delivery</strong></p><p><a href=\"" + escapeHtml_(checkoutUrl) + "\" style=\"display:inline-block;background:#173d24;color:#fff;padding:12px 18px;text-decoration:none\">Continue securely with Razorpay</a></p><p>If you no longer want this subscription, you can ignore this email.</p><p>Questions? Email <a href=\"mailto:info@vrajnaturals.com\">info@vrajnaturals.com</a>.</p><p>Vraj Naturals</p></div>"
      });
      sheet.getRange(row, 25).setValue(new Date().toISOString());
      sheet.getRange(row, 4).setValue(new Date().toISOString());
    }
  } finally {
    lock.releaseLock();
  }
}

function orderRecord_(sheet, row) {
  const v = sheet.getRange(row, 1, 1, ORDER_HEADERS.length).getValues()[0];
  const itemsJson = String(v[13] || "[]");
  let itemsList = [];
  try { itemsList = JSON.parse(itemsJson); } catch (_) { itemsList = []; }
  if (!Array.isArray(itemsList)) itemsList = [];
  const itemLines = itemsList.length ? itemsList.map(item =>
    "• " + String(item.name || item.id || "Item") + " — " + Number(item.weightKg || 0) + " kg × " + Number(item.packs || 0) +
    " pack(s) — ₹" + formatInr_(item.lineTotal)
  ).join("\n") : itemsJson;
  return {
    orderId: String(v[0]), name: String(v[4]), email: String(v[5]), phone: String(v[6]),
    address: [v[7], v[8], v[9], v[10], v[11], v[12]].filter(Boolean).join(", "),
    items: itemsJson, itemsList, itemLines,
    productsSubtotal: Number(v[14]) || 0, deliveryFee: Number(v[15]) || 0,
    total: Number(v[16]) || 0, frequency: String(v[17]),
    subscriptionId: String(v[20]), paymentId: String(v[22]), checkoutUrl: String(v[27])
  };
}

function escapeHtml_(value) {
  return String(value == null ? "" : value).replace(/[&<>\"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[char]));
}

function formatInr_(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
}

function findOrderRow_(spreadsheet, orderId) {
  const sheet = spreadsheet.getSheetByName(ORDERS_TAB);
  if (!sheet || !orderId) return 0;
  const finder = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).createTextFinder(orderId).matchEntireCell(true);
  const match = finder.findNext();
  return match ? match.getRow() : 0;
}

function findOrderBySubscription_(spreadsheet, subscriptionId) {
  const sheet = spreadsheet.getSheetByName(ORDERS_TAB);
  if (!sheet || !subscriptionId || sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, 21, sheet.getLastRow() - 1, 1).createTextFinder(subscriptionId).matchEntireCell(true);
  const match = finder.findNext();
  return match ? match.getRow() : 0;
}

function orderCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function orderJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
