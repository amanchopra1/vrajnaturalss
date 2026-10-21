/**
 * VRAJ NATURALS — Cloudflare Worker / Razorpay integration
 *
 * IMPORTANT:
 * - Payment mode must be set explicitly for each environment.
 * - Razorpay subscriptions require a valid Plan ID and compatible billing
 *   configuration. A unique product mix may need a plan created/approved first.
 * - Production payment availability is controlled by PAYMENTS_ENABLED in Cloudflare.
 * - No separate database is used by this starter.
 *
 * Required Worker secrets:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   RAZORPAY_WEBHOOK_SECRET
 *   ORDERS_API_TOKEN
 *   ORDERS_WEB_APP_URL
 *
 * Local development variables in worker/.dev.vars:
 *   ALLOWED_ORIGIN = http://127.0.0.1:8000
 *   RAZORPAY_MODE = test (set live only in the production Worker environment)
 *
 * Plans are reused within the selected Razorpay mode when amount, currency,
 * period, and interval match. If none matches, the Worker creates a plan. No plan
 * identifier, price, or total supplied by the browser is trusted.
 */

const PRODUCTS = {
  "sharbati-atta": { name: "Sharbati Atta", regularPaisePerKg: 7000, subscriptionPaisePerKg: 5000 },
  "sona-moti-atta": { name: "Sona Moti Atta", regularPaisePerKg: 16000, subscriptionPaisePerKg: 12000 },
  "bajra": { name: "Bajra", regularPaisePerKg: 7000, subscriptionPaisePerKg: 5000 },
  "jau": { name: "Jau", regularPaisePerKg: 8000, subscriptionPaisePerKg: 5000 },
  "daliya": { name: "Daliya", regularPaisePerKg: 7500, subscriptionPaisePerKg: 5500 },
  "everyday-rice": { name: "Everyday Rice", regularPaisePerKg: 6000, subscriptionPaisePerKg: 5000 },
  "basmati-rice": { name: "Basmati Rice", regularPaisePerKg: 15000, subscriptionPaisePerKg: 12500 },
  "moong-dal": { name: "Moong Dal (Sabut Moong)", regularPaisePerKg: 16000, subscriptionPaisePerKg: 14500 }
};

const ALLOWED_WEIGHTS_KG = new Set([1, 2, 5, 10]);
const SUBSCRIPTION_DELIVERY_FEE_PAISE = 14900;
const SHOP_DELIVERY_FEE_UP_TO_2KG_PAISE = 9900;
const SHOP_DELIVERY_FEE_OVER_2KG_PAISE = 14900;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const idempotentRequests = new Map();
const matchingPlanCache = new Map();

function paymentMode(env) {
  return env.RAZORPAY_MODE === "live" ? "live" : "test";
}

function credentialsMatchMode(env) {
  const keyId = env.RAZORPAY_KEY_ID || "";
  return paymentMode(env) === "live" ? keyId.startsWith("rzp_live_") : keyId.startsWith("rzp_test_");
}

function paymentsUnavailable(env) {
  if (env.PAYMENTS_ENABLED === "false") return "Online payments are not enabled yet. Please contact info@vrajnaturals.com.";
  if (!credentialsMatchMode(env) || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET || !env.ORDERS_WEB_APP_URL || !env.ORDERS_API_TOKEN) {
    return "Secure checkout is still being configured. Please contact info@vrajnaturals.com.";
  }
  return "";
}

const FREQUENCIES = {
  weekly: { period: "weekly", interval: 1, label: "weekly" },
  fortnightly: { period: "weekly", interval: 2, label: "every 2 weeks" },
  monthly: { period: "monthly", interval: 1, label: "monthly" },
  "every-two-months": { period: "monthly", interval: 2, label: "every 2 months" },
  "every-three-months": { period: "monthly", interval: 3, label: "every 3 months" }
};

function subscriptionCycleLimit(frequency) {
  // Razorpay subscriptions have a 10-year maximum duration. Keep every
  // interval within that duration (e.g. 40 quarterly cycles rather than 120).
  return frequency.period === "weekly"
    ? Math.floor(52 * 10 / frequency.interval)
    : Math.floor(12 * 10 / frequency.interval);
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || "";
  const permitted = origin && allowed && origin === allowed ? origin : "null";
  return {
    "Access-Control-Allow-Origin": permitted,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Vary": "Origin"
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "Invalid request.";
  if (!payload.consent) return "Please confirm the recurring payment terms.";
  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  if (typeof customer.name !== "string" || !customer.name.trim() || customer.name.length > 100) return "Enter a valid name.";
  if (typeof customer.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || customer.email.length > 150) return "Enter a valid email address.";
  if (!/^[0-9+() -]{8,20}$/.test(customer.phone || "")) return "Enter a valid phone number.";
  if (typeof shipping.address1 !== "string" || !shipping.address1.trim() || shipping.address1.length > 200) return "Enter a valid delivery address.";
  if (typeof shipping.city !== "string" || !shipping.city.trim() || shipping.city.length > 100 || typeof shipping.state !== "string" || !shipping.state.trim() || shipping.state.length > 100) return "Enter a valid city and state.";
  if (!/^[0-9]{6}$/.test(shipping.postalCode || "")) return "Enter a valid six-digit PIN code.";
  if (typeof shipping.country !== "string" || !shipping.country.trim() || shipping.country.length > 60) return "Enter a valid country.";
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 8) return "Select one or more valid products.";
  if (!FREQUENCIES[payload.frequency]) return "Select a supported billing frequency.";
  if (payload.emailReminderConsent !== undefined && typeof payload.emailReminderConsent !== "boolean") return "Invalid email reminder preference.";
  const seen = new Set();
  for (const item of payload.items) {
    if (!item || !PRODUCTS[item.id] || !ALLOWED_WEIGHTS_KG.has(item.weightKg) || !Number.isInteger(item.packs) || item.packs < 1 || item.packs > 50 || seen.has(item.id)) {
      return "One or more selected products or quantities are invalid.";
    }
    seen.add(item.id);
  }
  return null;
}

async function razorpayRequest(path, env, body) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured.");
  if (!credentialsMatchMode(env)) throw new Error(`Razorpay ${paymentMode(env) === "live" ? "Live" : "Test"} Mode credentials are required for this environment.`);
  const auth = btoa(`${keyId}:${keySecret}`);
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Authorization": `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Do not return Razorpay's full error payload to a public client.
    console.error("Razorpay API error", response.status, data?.error?.code || "unknown");
    throw new Error("The payment provider could not process this request. Please try again later.");
  }
  return data;
}

async function ordersApi(env, action, fields) {
  if (!env.ORDERS_WEB_APP_URL || !env.ORDERS_API_TOKEN) throw new Error("The private Google Orders Sheet is not configured yet.");
  let response;
  try {
    response = await fetch(env.ORDERS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "vraj-order-api", action, token: env.ORDERS_API_TOKEN, ...fields })
    });
  } catch (_) {
    throw new Error("The private Google Orders Sheet could not be reached.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "The private Google Orders Sheet rejected the request.");
  return data;
}

async function findMatchingPlan(env, amountPaise, frequency) {
  const cacheKey = `${amountPaise}:${frequency.period}:${frequency.interval}`;
  if (matchingPlanCache.has(cacheKey)) return matchingPlanCache.get(cacheKey);

  const plans = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const collection = await razorpayRequest(`/plans?count=100&skip=${skip}`, env);
    const page = Array.isArray(collection.items) ? collection.items : [];
    plans.push(...page);
    if (page.length < 100) break;
  }
  const plan = plans.find(candidate => candidate && candidate.id &&
    candidate.item?.active !== false &&
    Number(candidate.item?.amount) === amountPaise &&
    candidate.item?.currency === "INR" &&
    candidate.period === frequency.period &&
    Number(candidate.interval) === frequency.interval);
  if (plan) {
    matchingPlanCache.set(cacheKey, plan);
    return plan;
  }

  const created = await razorpayRequest("/plans", env, {
    period: frequency.period,
    interval: frequency.interval,
    item: {
      name: `Vraj Naturals subscription · ₹${amountPaise / 100} per delivery`,
      amount: amountPaise,
      currency: "INR",
      description: `Vraj Naturals subscription, ${frequency.label}; includes ₹149 delivery per scheduled delivery.`
    },
    notes: { created_by: `Vraj Naturals ${paymentMode(env) === "live" ? "Live" : "Test"} Mode integration` }
  });
  if (!created?.id || Number(created.item?.amount) !== amountPaise || created.period !== frequency.period || Number(created.interval) !== frequency.interval) {
    throw new Error("Razorpay did not return a plan matching the requested amount and frequency.");
  }
  matchingPlanCache.set(cacheKey, created);
  return created;
}

async function createSubscription(payload, env, idempotencyKey) {
  const unavailable = paymentsUnavailable(env);
  if (unavailable) return { status: 503, body: { error: unavailable } };
  // Never trust client-calculated prices. Compute the expected recurring total here.
  const productsAmountPaise = payload.items.reduce((sum, item) => sum + PRODUCTS[item.id].subscriptionPaisePerKg * item.weightKg * item.packs, 0);
  const amountPaise = productsAmountPaise + SUBSCRIPTION_DELIVERY_FEE_PAISE;
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { status: 400, body: { error: "Unable to calculate order total." } };

  let plan;
  try { plan = await findMatchingPlan(env, amountPaise, FREQUENCIES[payload.frequency]); }
  catch (error) { return { status: 503, body: { error: error.message } }; }

  const itemsText = payload.items.map(item => `${PRODUCTS[item.id].name} ${item.weightKg}kg x${item.packs}`).join("; ");
  const notes = {
    customer_name: payload.customer.name.slice(0, 255),
    customer_phone: payload.customer.phone.slice(0, 255),
    address_line_1: payload.shipping.address1.slice(0, 255),
    address_line_2: (payload.shipping.address2 || "").slice(0, 255),
    city: payload.shipping.city.slice(0, 255),
    state: payload.shipping.state.slice(0, 255),
    postal_code: payload.shipping.postalCode.slice(0, 255),
    country: payload.shipping.country.slice(0, 255),
    product_summary: itemsText.slice(0, 255),
    frequency: FREQUENCIES[payload.frequency].label,
    delivery_fee_paise: String(SUBSCRIPTION_DELIVERY_FEE_PAISE),
    products_amount_paise: String(productsAmountPaise),
    local_request_id: idempotencyKey
  };

  let createdOrderId = "";
  try {
    const order = await ordersApi(env, "create-order", { order: {
      localRequestId: idempotencyKey,
      customerName: payload.customer.name,
      email: payload.customer.email,
      phone: payload.customer.phone,
      address1: payload.shipping.address1,
      address2: payload.shipping.address2 || "",
      city: payload.shipping.city,
      state: payload.shipping.state,
      postalCode: payload.shipping.postalCode,
      country: payload.shipping.country,
      items: payload.items.map(item => ({
        id: item.id, name: PRODUCTS[item.id].name, weightKg: item.weightKg, packs: item.packs,
        unitPricePerKg: PRODUCTS[item.id].subscriptionPaisePerKg / 100,
        lineTotal: PRODUCTS[item.id].subscriptionPaisePerKg / 100 * item.weightKg * item.packs
      })),
      productsSubtotal: productsAmountPaise / 100,
      deliveryFee: SUBSCRIPTION_DELIVERY_FEE_PAISE / 100,
      total: amountPaise / 100,
      frequency: FREQUENCIES[payload.frequency].label,
      emailReminderConsent: payload.emailReminderConsent === true
    } });
    createdOrderId = String(order.orderId || "");
    if (order.duplicate) {
      if (order.checkoutUrl && order.subscriptionId) return { status: 200, body: {
        subscription_id: order.subscriptionId, checkout_url: order.checkoutUrl,
        amount_paise: Math.round(Number(order.total) * 100),
        message: `Continue to your existing Razorpay ${paymentMode(env) === "live" ? "Live" : "Test"} Mode checkout.`
      } };
      return { status: 409, body: { error: "This checkout is already being prepared or needs review. Please wait a moment or contact info@vrajnaturals.com before retrying." } };
    }
    notes.order_id = String(order.orderId).slice(0, 255);
    const subscription = await razorpayRequest("/subscriptions", env, {
      plan_id: plan.id,
      total_count: subscriptionCycleLimit(FREQUENCIES[payload.frequency]),
      quantity: 1,
      customer_notify: 0,
      notes
    });
    if (!subscription.short_url) {
      console.error("Razorpay subscription created without short_url", subscription.id);
      await ordersApi(env, "checkout-failed", { orderId: order.orderId, reason: "Razorpay did not return a checkout URL." }).catch(() => {});
      return { status: 502, body: { error: "Razorpay did not return a subscription checkout link. Please check the Razorpay dashboard before retrying." } };
    }
    await ordersApi(env, "checkout-created", {
      orderId: order.orderId, subscriptionId: subscription.id, planId: plan.id, checkoutUrl: subscription.short_url
    });
    return { status: 201, body: {
      subscription_id: subscription.id,
      checkout_url: subscription.short_url,
      amount_paise: amountPaise,
      message: `Continue to Razorpay ${paymentMode(env) === "live" ? "Live" : "Test"} Mode to review and authorise the recurring payment.`
    } };
  } catch (error) {
    if (createdOrderId) await ordersApi(env, "checkout-failed", { orderId: createdOrderId, reason: "Checkout setup could not be completed." }).catch(() => {});
    console.error("Subscription creation failed", error.message);
    return { status: 502, body: { error: error.message || "We couldn't create the subscription. Please check Razorpay before retrying." } };
  }
}

function validateShopOrder(payload) {
  if (!payload || typeof payload !== "object") return "Invalid request.";
  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  if (typeof customer.name !== "string" || !customer.name.trim() || customer.name.length > 100) return "Enter a valid name.";
  if (typeof customer.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || customer.email.length > 150) return "Enter a valid email address.";
  if (!/^[0-9+() -]{8,20}$/.test(customer.phone || "")) return "Enter a valid phone number.";
  if (typeof shipping.address1 !== "string" || !shipping.address1.trim() || shipping.address1.length > 200) return "Enter a valid delivery address.";
  if (typeof shipping.city !== "string" || !shipping.city.trim() || shipping.city.length > 100 || typeof shipping.state !== "string" || !shipping.state.trim() || shipping.state.length > 100) return "Enter a valid city and state.";
  if (!/^[0-9]{6}$/.test(shipping.postalCode || "")) return "Enter a valid six-digit PIN code.";
  if (typeof shipping.country !== "string" || !shipping.country.trim() || shipping.country.length > 60) return "Enter a valid country.";
  const itemsError = validateShopItems(payload.items);
  if (itemsError) return itemsError;
  if (payload.couponCode != null && (typeof payload.couponCode !== "string" || payload.couponCode.length > 32)) return "Invalid coupon code.";
  return null;
}

function shopOrderAmounts(items, discountPaise = 0) {
  const totalWeightKg = items.reduce((sum, item) => sum + item.weightKg * item.packs, 0);
  const productsAmountPaise = items.reduce((sum, item) => sum + PRODUCTS[item.id].regularPaisePerKg * item.weightKg * item.packs, 0);
  const deliveryFeePaise = totalWeightKg <= 2 ? SHOP_DELIVERY_FEE_UP_TO_2KG_PAISE : SHOP_DELIVERY_FEE_OVER_2KG_PAISE;
  const boundedDiscountPaise = Math.max(0, Math.min(productsAmountPaise, Math.trunc(discountPaise)));
  return { totalWeightKg, productsAmountPaise, discountPaise: boundedDiscountPaise, deliveryFeePaise, amountPaise: productsAmountPaise - boundedDiscountPaise + deliveryFeePaise };
}

function validateShopItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) return "Select one or more valid products.";
  const seen = new Set();
  for (const item of items) {
    if (!item || !PRODUCTS[item.id] || !ALLOWED_WEIGHTS_KG.has(item.weightKg) || !Number.isInteger(item.packs) || item.packs < 1 || item.packs > 50 || seen.has(item.id)) return "One or more selected products or quantities are invalid.";
    seen.add(item.id);
  }
  return null;
}

function couponCodeFrom(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : "";
}

async function calculateCoupon(env, code, items) {
  const config = await ordersApi(env, "get-coupon", { code });
  if (!config.found || String(config.code || "").toUpperCase() !== code) throw new Error("That coupon code is not valid.");
  const active = config.active === true || String(config.active).toUpperCase() === "TRUE";
  if (!active) throw new Error("That coupon is not active.");
  if (!/one[- ]time/i.test(String(config.applicableOrders || ""))) throw new Error("That coupon is not valid for one-time purchases.");
  const amounts = shopOrderAmounts(items);
  const minimumPaise = Math.max(0, Math.round(Number(config.minimumOrderValue || 0) * 100));
  if (amounts.productsAmountPaise < minimumPaise) throw new Error("Your product subtotal does not meet this coupon's minimum order value.");
  const type = String(config.discountType || "").trim().toLowerCase();
  const value = Number(config.discountValue);
  if (type !== "percentage" || !Number.isFinite(value) || value <= 0 || value > 100) throw new Error("This coupon is not configured correctly.");
  const cap = String(config.maximumDiscount || "").trim().toLowerCase();
  let capPaise = amounts.productsAmountPaise;
  if (!["", "no cap", "unlimited", "none"].includes(cap)) {
    const capValue = Number(cap);
    if (!Number.isFinite(capValue) || capValue < 0) throw new Error("This coupon is not configured correctly.");
    capPaise = Math.round(capValue * 100);
  }
  const discountPaise = Math.min(amounts.productsAmountPaise, capPaise, Math.round(amounts.productsAmountPaise * value / 100));
  return { code, amounts: shopOrderAmounts(items, discountPaise) };
}

async function handleCouponValidation(request, env) {
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const code = couponCodeFrom(payload?.code);
  const validationError = validateShopItems(payload?.items);
  if (!code) return json({ error: "Enter a valid coupon code." }, 400);
  if (validationError) return json({ error: validationError }, 400);
  try {
    const { amounts } = await calculateCoupon(env, code, payload.items);
    return json({ ok: true, code, productSubtotal: amounts.productsAmountPaise / 100, discountAmount: amounts.discountPaise / 100, discountedProductSubtotal: (amounts.productsAmountPaise - amounts.discountPaise) / 100 });
  } catch (error) {
    const unavailable = /Google Orders Sheet|sheet|temporarily unavailable|reached/i.test(error.message);
    return json({ error: unavailable ? "Coupon validation is temporarily unavailable. Please try again shortly." : error.message }, unavailable ? 503 : 400);
  }
}

async function createShopOrder(payload, env, idempotencyKey) {
  const unavailable = paymentsUnavailable(env);
  if (unavailable) return { status: 503, body: { error: unavailable } };
  let coupon = { code: "", amounts: shopOrderAmounts(payload.items) };
  const requestedCoupon = couponCodeFrom(payload.couponCode);
  if (payload.couponCode && !requestedCoupon) return { status: 400, body: { error: "Invalid coupon code." } };
  if (requestedCoupon) {
    try { coupon = await calculateCoupon(env, requestedCoupon, payload.items); }
    catch (error) { return { status: /Google Orders Sheet|sheet|temporarily unavailable|reached/i.test(error.message) ? 503 : 400, body: { error: error.message } }; }
  }
  const amounts = coupon.amounts;
  const summary = payload.items.map(item => `${PRODUCTS[item.id].name} ${item.weightKg}kg x${item.packs}`).join("; ");
  let sheetOrderId = "";
  try {
    const order = await ordersApi(env, "create-order", { order: {
      localRequestId: idempotencyKey, customerName: payload.customer.name, email: payload.customer.email, phone: payload.customer.phone,
      address1: payload.shipping.address1, address2: payload.shipping.address2 || "", city: payload.shipping.city,
      state: payload.shipping.state, postalCode: payload.shipping.postalCode, country: payload.shipping.country,
      items: payload.items.map(item => ({
        id: item.id, name: PRODUCTS[item.id].name, weightKg: item.weightKg, packs: item.packs,
        unitPricePerKg: PRODUCTS[item.id].regularPaisePerKg / 100,
        lineTotal: PRODUCTS[item.id].regularPaisePerKg / 100 * item.weightKg * item.packs
      })),
      productsSubtotal: amounts.productsAmountPaise / 100, discountAmount: amounts.discountPaise / 100,
      couponCode: coupon.code, deliveryFee: amounts.deliveryFeePaise / 100,
      total: amounts.amountPaise / 100, frequency: "One-time order", emailReminderConsent: false
    } });
    sheetOrderId = String(order.orderId || "");
    if (order.duplicate && order.subscriptionId) {
      const existing = await razorpayRequest(`/orders/${encodeURIComponent(order.subscriptionId)}`, env);
      if (existing?.id && Number(existing.amount) === amounts.amountPaise) return { status: 200, body: {
        order_id: existing.id, amount: existing.amount, currency: existing.currency, key_id: env.RAZORPAY_KEY_ID,
        local_order_id: sheetOrderId, items: payload.items,
        product_subtotal: amounts.productsAmountPaise, discount_amount: amounts.discountPaise,
        delivery_fee: amounts.deliveryFeePaise, final_amount: amounts.amountPaise
      } };
      return { status: 409, body: { error: "This checkout is already being prepared or needs review. Please wait a moment or contact info@vrajnaturals.com before retrying." } };
    }
    const rzpOrder = await razorpayRequest("/orders", env, {
      amount: amounts.amountPaise, currency: "INR", receipt: idempotencyKey.slice(0, 40),
      notes: {
        vraj_order_id: sheetOrderId, local_request_id: idempotencyKey,
        product_summary: summary.slice(0, 255), total_weight_kg: String(amounts.totalWeightKg),
        products_subtotal_paise: String(amounts.productsAmountPaise), coupon_code: coupon.code,
        coupon_discount_paise: String(amounts.discountPaise), delivery_fee_paise: String(amounts.deliveryFeePaise)
      }
    });
    await ordersApi(env, "checkout-created", { orderId: sheetOrderId, subscriptionId: rzpOrder.id, planId: "One-time order", checkoutUrl: "" });
    return { status: 201, body: {
      order_id: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency,
      key_id: env.RAZORPAY_KEY_ID, local_order_id: sheetOrderId, items: payload.items,
      product_subtotal: amounts.productsAmountPaise, discount_amount: amounts.discountPaise,
      delivery_fee: amounts.deliveryFeePaise, final_amount: amounts.amountPaise, coupon_code: coupon.code
    } };
  } catch (error) {
    if (sheetOrderId) await ordersApi(env, "checkout-failed", { orderId: sheetOrderId, reason: "One-time checkout setup could not be completed." }).catch(() => {});
    console.error("One-time checkout creation failed", error.message);
    return { status: 502, body: { error: error.message || "We couldn't start secure payment. Please try again or contact us." } };
  }
}

async function handleShopOrder(request, env) {
  const key = request.headers.get("Idempotency-Key") || "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return json({ error: "A valid idempotency key is required." }, 400);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const validationError = validateShopOrder(payload);
  if (validationError) return json({ error: validationError }, 400);
  const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = [...new Uint8Array(fingerprintBytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  for (const [cachedKey, value] of idempotentRequests) if (value.expiresAt <= now) idempotentRequests.delete(cachedKey);
  const previous = idempotentRequests.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return json({ error: "This request key was already used for different order details. Refresh the page and try again." }, 409);
    const result = await previous.promise;
    return json(result.body, result.status);
  }
  const promise = createShopOrder(payload, env, key);
  idempotentRequests.set(key, { fingerprint, promise, expiresAt: now + IDEMPOTENCY_TTL_MS });
  const result = await promise;
  idempotentRequests.set(key, { fingerprint, promise: Promise.resolve(result), expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  return json(result.body, result.status);
}

async function handleShopPaymentVerification(request, env) {
  const unavailable = paymentsUnavailable(env);
  if (unavailable) return json({ error: unavailable }, 503);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const orderId = String(payload.razorpay_order_id || "");
  const paymentId = String(payload.razorpay_payment_id || "");
  const signature = String(payload.razorpay_signature || "");
  const localOrderId = String(payload.local_order_id || "");
  if (!/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !localOrderId || localOrderId.length > 100) return json({ error: "Payment details are incomplete." }, 400);
  if (!await verifyWebhookSignature(new TextEncoder().encode(`${orderId}|${paymentId}`), signature, env.RAZORPAY_KEY_SECRET)) return json({ error: "We could not verify the payment response. Please contact info@vrajnaturals.com before retrying." }, 400);
  try {
    const rzpOrder = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}`, env);
    if (String(rzpOrder.notes?.vraj_order_id || "") !== localOrderId) return json({ error: "This payment does not match the saved order." }, 400);
    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, env);
    if (payment.order_id !== orderId || Number(payment.amount) !== Number(rzpOrder.amount) || !["captured", "authorized"].includes(payment.status)) return json({ error: "Payment is still being confirmed. Please wait for the confirmation email before trying again." }, 409);
    const result = await ordersApi(env, "payment-event", { event: {
      eventId: `checkout-${paymentId}-${payment.status}`, eventType: payment.status === "captured" ? "order.paid" : "order.authorized",
      subscriptionId: orderId, paymentId, paymentStatus: payment.status, amount: Number(payment.amount || 0) / 100
    } });
    return json({ ok: true, status: payment.status, matched: Boolean(result.matched) });
  } catch (error) {
    console.error("One-time payment verification failed", error.message);
    return json({ error: "Payment may have completed, but order confirmation is delayed. Please check your email or contact info@vrajnaturals.com." }, 503);
  }
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(signature.toLowerCase(), expected);
}

async function handleRazorpayWebhook(request, env) {
  if (!credentialsMatchMode(env)) return json({ error: "Razorpay credentials do not match this Worker environment." }, 503);
  if (!env.RAZORPAY_WEBHOOK_SECRET) return json({ error: "Webhook secret is not configured." }, 503);
  const rawBody = await request.arrayBuffer();
  const signature = request.headers.get("X-Razorpay-Signature") || "";
  if (!await verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) return json({ error: "Invalid webhook signature." }, 401);

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return json({ error: "Invalid webhook payload." }, 400); }
  const eventType = String(payload.event || "");
  const supported = new Set(["subscription.activated", "subscription.charged", "subscription.pending", "subscription.halted", "subscription.cancelled", "payment.failed", "payment.captured", "order.paid"]);
  if (!supported.has(eventType)) return json({ ok: true, ignored: true });

  const subscription = payload.payload?.subscription?.entity || {};
  const order = payload.payload?.order?.entity || {};
  const payment = payload.payload?.payment?.entity || {};
  const subscriptionId = subscription.id || payment.subscription_id || payment.order_id || order.id || "";
  if (!subscriptionId) return json({ error: "Webhook has no subscription or order ID." }, 400);
  const data = await ordersApi(env, "payment-event", { event: {
    eventId: request.headers.get("X-Razorpay-Event-Id") || payload.id || "",
    eventType,
    subscriptionId,
    paymentId: payment.id || "",
    paymentStatus: payment.status || subscription.status || eventType,
    amount: Number(payment.amount || order.amount_paid || 0) / 100,
    failureReason: payment.error_description || payment.error_reason || payment.error_code || ""
  } });
  return json({ ok: true, matched: Boolean(data.matched), duplicate: Boolean(data.duplicate) });
}

async function handleSubscription(request, env) {
  const key = request.headers.get("Idempotency-Key") || "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return json({ error: "A valid idempotency key is required." }, 400);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const validationError = validatePayload(payload);
  if (validationError) return json({ error: validationError }, 400);

  const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = [...new Uint8Array(fingerprintBytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  for (const [cachedKey, value] of idempotentRequests) if (value.expiresAt <= now) idempotentRequests.delete(cachedKey);
  const previous = idempotentRequests.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return json({ error: "This request key was already used for different subscription details. Refresh the page and try again." }, 409);
    const result = await previous.promise;
    return json(result.body, result.status);
  }

  const promise = createSubscription(payload, env, key);
  idempotentRequests.set(key, { fingerprint, promise, expiresAt: now + IDEMPOTENCY_TTL_MS });
  const result = await promise;
  idempotentRequests.set(key, { fingerprint, promise: Promise.resolve(result), expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  return json(result.body, result.status);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "vraj-naturals-worker", mode: paymentMode(env), paymentsEnabled: env.PAYMENTS_ENABLED !== "false", credentialsConfigured: Boolean(credentialsMatchMode(env) && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET && env.ORDERS_WEB_APP_URL && env.ORDERS_API_TOKEN) }, 200, cors);
    }
    if (url.pathname === "/api/subscriptions" && request.method === "POST") {
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, cors);
      const response = await handleSubscription(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === "/api/shop/coupon" && request.method === "POST") {
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, cors);
      const response = await handleCouponValidation(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    if ((url.pathname === "/api/orders" || url.pathname === "/api/orders/create") && request.method === "POST") {
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, cors);
      const response = await handleShopOrder(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === "/api/orders/verify" && request.method === "POST") {
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, cors);
      const response = await handleShopPaymentVerification(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    if (url.pathname === "/api/razorpay/webhook" && request.method === "POST") {
      try { return await handleRazorpayWebhook(request, env); }
      catch (error) {
        console.error("Webhook processing failed", error.message);
        return json({ error: "Webhook could not be processed; Razorpay may retry it." }, 503);
      }
    }
    return json({ error: "Not found." }, 404, cors);
  }
};
