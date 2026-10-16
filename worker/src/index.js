/**
 * VRAJ NATURALS — Cloudflare Worker / Razorpay integration starter
 *
 * IMPORTANT:
 * - This worker is intentionally fail-closed for subscriptions.
 * - Razorpay subscriptions require a valid Plan ID and compatible billing
 *   configuration. A unique product mix may need a plan created/approved first.
 * - Do not deploy a live payment flow until the Razorpay account, subscription
 *   product, billing interval, checkout, webhook and cancellation flow are tested.
 * - No separate database is used by this starter.
 *
 * Required Worker secrets:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *
 * Worker variables:
 *   ALLOWED_ORIGIN = https://your-production-domain.example
 *   RAZORPAY_PLAN_WEEKLY = plan_...
 *   RAZORPAY_PLAN_FORTNIGHTLY = plan_...
 *   RAZORPAY_PLAN_MONTHLY = plan_...
 *
 * Plan amount must match the exact selected products/quantities. A single static
 * plan cannot safely represent arbitrary customer-selected mixes. For production,
 * implement a tested plan strategy that creates/reuses plans via Razorpay API or
 * offers fixed curated subscription bundles. This starter returns a clear error
 * rather than charging an incorrect amount.
 */

const PRODUCTS = {
  "sharbati-atta": { name: "Sharbati Atta", subscriptionPaisePerKg: 5000 },
  "sona-moti-atta": { name: "Sona Moti Atta", subscriptionPaisePerKg: 12000 },
  "bajra": { name: "Bajra", subscriptionPaisePerKg: 5000 },
  "jau": { name: "Jau", subscriptionPaisePerKg: 5000 },
  "daliya": { name: "Daliya", subscriptionPaisePerKg: 5500 },
  "everyday-rice": { name: "Everyday Rice", subscriptionPaisePerKg: 5000 },
  "basmati-rice": { name: "Basmati Rice", subscriptionPaisePerKg: 12500 },
  "moong-dal": { name: "Moong Dal (Sabut Moong)", subscriptionPaisePerKg: 14500 }
};

const ALLOWED_WEIGHTS_KG = new Set([1, 2, 5, 10]);

const FREQUENCIES = {
  weekly: { env: "RAZORPAY_PLAN_WEEKLY", label: "weekly" },
  fortnightly: { env: "RAZORPAY_PLAN_FORTNIGHTLY", label: "fortnightly" },
  monthly: { env: "RAZORPAY_PLAN_MONTHLY", label: "monthly" }
};

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
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "Invalid request.";
  if (!payload.consent) return "Please confirm the recurring payment terms.";
  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  if (!customer.name || customer.name.length > 100) return "Enter a valid name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "") || customer.email.length > 150) return "Enter a valid email address.";
  if (!/^[0-9+() -]{8,20}$/.test(customer.phone || "")) return "Enter a valid phone number.";
  if (!shipping.address1 || shipping.address1.length > 200) return "Enter a valid delivery address.";
  if (!shipping.city || shipping.city.length > 100 || !shipping.state || shipping.state.length > 100) return "Enter a valid city and state.";
  if (!/^[0-9]{6}$/.test(shipping.postalCode || "")) return "Enter a valid six-digit PIN code.";
  if (!shipping.country || shipping.country.length > 60) return "Enter a valid country.";
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 8) return "Select one or more valid products.";
  if (!FREQUENCIES[payload.frequency]) return "Select a supported billing frequency.";
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

async function createSubscription(request, env) {
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const validationError = validatePayload(payload);
  if (validationError) return json({ error: validationError }, 400);

  const frequency = FREQUENCIES[payload.frequency];
  const planId = env[frequency.env];
  if (!planId) {
    return json({
      error: "Subscriptions are not live yet. The matching Razorpay plan has not been configured. Please contact Vraj Naturals."
    }, 503);
  }

  // Never trust client-calculated prices. Compute the expected recurring total here.
  const amountPaise = payload.items.reduce((sum, item) => sum + PRODUCTS[item.id].subscriptionPaisePerKg * item.weightKg * item.packs, 0);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return json({ error: "Unable to calculate order total." }, 400);

  // A Razorpay plan has its own fixed amount/period. Refuse mismatches instead of
  // creating a subscription whose amount differs from the selected products.
  let plan;
  try { plan = await razorpayRequest(`/plans/${encodeURIComponent(planId)}`, env); }
  catch { return json({ error: "The configured subscription plan could not be verified. Please contact us." }, 503); }
  if (Number(plan.item?.amount) !== amountPaise) {
    return json({
      error: "This exact product combination is not configured for recurring billing yet. Please contact us to arrange your subscription."
    }, 422);
  }

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
    frequency: payload.frequency
  };

  try {
    const subscription = await razorpayRequest("/subscriptions", env, {
      plan_id: planId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes
    });
    if (!subscription.short_url) {
      console.error("Razorpay subscription created without short_url", subscription.id);
      return json({ error: "Subscription was created but no checkout link was returned. Please contact support." }, 502);
    }
    return json({
      subscription_id: subscription.id,
      checkout_url: subscription.short_url,
      amount_paise: amountPaise,
      message: "Continue to Razorpay to review and authorise the recurring payment."
    }, 201);
  } catch (error) {
    console.error("Subscription creation failed", error.message);
    return json({ error: "We couldn't create your subscription. Please try again later." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "vraj-naturals-worker", paymentsConfigured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) }, 200, cors);
    }
    if (url.pathname === "/api/subscriptions" && request.method === "POST") {
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, cors);
      const response = await createSubscription(request, env);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }
    return json({ error: "Not found." }, 404, cors);
  }
};
