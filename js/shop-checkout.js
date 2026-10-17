(() => {
  "use strict";

  const form = document.querySelector("#shop-checkout-form");
  if (!form) return;
  const workerUrl = ["localhost", "127.0.0.1", "::1"].includes(location.hostname)
    ? "http://127.0.0.1:8787"
    : location.hostname === "vrajnaturals.com" ? location.origin : "";
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  const safe = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const status = form.querySelector("[data-shop-checkout-status]");
  const button = form.querySelector('button[type="submit"]');
  const label = form.querySelector("[data-shop-submit-label]");
  const arrow = form.querySelector("[data-shop-submit-arrow]");
  const spinner = form.querySelector("[data-shop-submit-spinner]");
  let items = [];
  let productData = [];
  let idempotencyKey = "";
  let onlineCheckoutReady = false;
  const deliveryFeeFor = (weight, postalCode, city) => {
    if (weight > 500) return null;
    if (String(postalCode || "").trim() === "125050" && /fatehabad/i.test(String(city || "").trim())) return 0;
    return [[2, 99], [20, 149], [50, 199], [100, 249], [350, 399], [500, 499]].find(([limit]) => weight <= limit)?.[1] ?? 0;
  };
  const isFatehabadFreeDelivery = (postalCode, city) => String(postalCode || "").trim() === "125050" && /fatehabad/i.test(String(city || "").trim());

  function showStatus(message, error = false, loading = false) {
    status.textContent = message;
    status.classList.toggle("is-error", error);
    status.classList.toggle("is-loading", loading);
  }

  function currentItems() {
    return items.map(item => ({
      product: productData.find(product => product.id === item.id),
      weightKg: Number(item.weightKg), packs: Number(item.packs)
    })).filter(item => item.product);
  }

  function drawSummary() {
    const selected = currentItems();
    const summary = form.querySelector("[data-shop-summary]");
    if (!selected.length) {
      summary.innerHTML = '<p class="muted">Your shop selection could not be found. Please return to the shop and choose an item.</p>';
      button.disabled = !onlineCheckoutReady;
      showStatus("Choose a product from the shop before continuing to payment.", true);
      return;
    }
    const subtotal = selected.reduce((sum, item) => sum + item.product.regularPricePerKg * item.weightKg * item.packs, 0);
    const weight = selected.reduce((sum, item) => sum + item.weightKg * item.packs, 0);
    const delivery = deliveryFeeFor(weight, form.elements.postalCode.value, form.elements.city.value);
    summary.innerHTML = selected.map(({ product, weightKg, packs }) => {
      const lineTotal = product.regularPricePerKg * weightKg * packs;
      return `<div class="summary-line"><span>${safe(product.name)} · ${weightKg} kg × ${packs} pack${packs === 1 ? "" : "s"}</span><strong>${money(lineTotal)}</strong></div>`;
    }).join("");
    form.querySelector("[data-shop-total-weight]").textContent = `(${weight} kg total)`;
    form.querySelector("[data-shop-delivery]").textContent = delivery === null ? "Custom quote" : isFatehabadFreeDelivery(form.elements.postalCode.value, form.elements.city.value) ? "Free" : money(delivery);
    form.querySelector("[data-shop-total]").textContent = delivery === null ? "Custom quote" : money(subtotal + delivery);
    form.querySelector("[data-shop-bulk-note]").hidden = delivery !== null;
    button.disabled = !onlineCheckoutReady;
  }

  async function loadRazorpayCheckout() {
    if (window.Razorpay) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Secure payment could not be loaded. Please check your connection and try again."));
      document.head.appendChild(script);
    });
  }

  function requestKey(payload) {
    const serialized = JSON.stringify(payload);
    const cached = sessionStorage.getItem("vrajShopOrderRequest");
    const cachedKey = sessionStorage.getItem("vrajShopOrderRequestKey");
    if (cached === serialized && cachedKey) return cachedKey;
    idempotencyKey = crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("vrajShopOrderRequest", serialized);
    sessionStorage.setItem("vrajShopOrderRequestKey", idempotencyKey);
    return idempotencyKey;
  }

  async function verifyPayment(result, localOrderId) {
    showStatus("Payment received. Verifying it securely and recording your order…", false, true);
    const response = await fetch(`${workerUrl}/api/orders/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...result, local_order_id: localOrderId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Payment could not be confirmed yet. Please contact info@vrajnaturals.com before paying again.");
    sessionStorage.removeItem("vrajShopCheckoutItems");
    sessionStorage.removeItem("vrajShopOrderRequest");
    sessionStorage.removeItem("vrajShopOrderRequestKey");
    localStorage.removeItem("vrajNaturalsCartV1");
    form.querySelector(".checkout-details").innerHTML = `<div class="checkout-complete"><p class="eyebrow">ORDER UPDATE</p><h2>${data.status === "captured" ? "Thank you. Your order is confirmed." : "Payment authorised."}</h2><p>${data.status === "captured" ? "Your payment is confirmed and your order has been recorded. A confirmation email will follow." : "Your bank authorised the payment. We’re waiting for final capture confirmation before marking the order paid."}</p><p>Questions? <a href="mailto:info@vrajnaturals.com">info@vrajnaturals.com</a></p><a class="button button-primary" href="/shop.html">Continue shopping</a></div>`;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentItems().length) {
      showStatus("Choose a product from the shop before continuing to payment.", true);
      return;
    }
    if (currentItems().reduce((sum, item) => sum + item.weightKg * item.packs, 0) > 500) {
      showStatus("For orders above 500 kg, please contact us at +91 8860493812 for a customised quotation.", true);
      return;
    }
    if (!form.reportValidity()) {
      showStatus("Complete the required delivery fields and accept the Terms and Privacy Policy before continuing.", true);
      return;
    }
    if (!workerUrl) {
      showStatus("Secure one-time checkout is available on the locally running test service only. Please contact info@vrajnaturals.com for assistance.", true);
      return;
    }
    const payload = {
      customer: { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), phone: form.elements.phone.value.trim() },
      shipping: {
        address1: form.elements.address1.value.trim(), address2: form.elements.address2.value.trim(),
        city: form.elements.city.value.trim(), state: form.elements.state.value.trim(),
        postalCode: form.elements.postalCode.value.trim(), country: form.elements.country.value.trim()
      },
      items: items.map(({ id, weightKg, packs }) => ({ id, weightKg: Number(weightKg), packs: Number(packs) }))
    };
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    arrow.hidden = true;
    spinner.hidden = false;
    label.textContent = "Preparing your secure checkout…";
    showStatus("Saving your order and connecting securely to Razorpay. This can take a few seconds; please keep this page open.", false, true);
    try {
      await loadRazorpayCheckout();
      const response = await fetch(`${workerUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey(payload) },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't prepare payment. Please try again.");
      const checkout = new window.Razorpay({
        key: data.key_id,
        order_id: data.order_id,
        amount: data.amount,
        currency: data.currency,
        name: "Vraj Naturals",
        description: "One-time shop order",
        image: "/images/vraj-naturals-logo.webp",
        prefill: { name: payload.customer.name, email: payload.customer.email, contact: payload.customer.phone },
        notes: { "Vraj order": data.local_order_id },
        theme: { color: "#173D24" },
        handler: result => verifyPayment(result, data.local_order_id).catch(error => showStatus(error.message, true)),
        modal: { ondismiss: () => showStatus("Checkout closed without confirming payment. Your order is saved as unpaid; you can reopen checkout to try again.") }
      });
      checkout.on("payment.failed", result => {
        const message = result?.error?.description || "Payment did not complete. You can try again, or contact info@vrajnaturals.com.";
        showStatus(message, true);
      });
      checkout.open();
      showStatus("Razorpay checkout is ready. Complete payment in the secure payment window.");
    } catch (error) {
      const networkError = error instanceof TypeError && /failed to fetch|load failed|networkerror/i.test(error.message || "");
      showStatus(networkError ? "We couldn't connect to secure checkout. Check your connection and try again." : error.message || "Something went wrong. Please try again.", true);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      label.textContent = "Continue to secure payment";
      arrow.hidden = false;
      spinner.hidden = true;
    }
  });

  (async () => {
    try {
      const response = await fetch("/products.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Catalogue unavailable");
      const catalogue = await response.json();
      productData = catalogue.products || [];
      const query = new URLSearchParams(location.search);
      const fromQuery = query.get("item") ? [{ id: query.get("item"), weightKg: Number(query.get("kg")), packs: Number(query.get("packs")) }] : [];
      try { items = JSON.parse(sessionStorage.getItem("vrajShopCheckoutItems") || "[]"); } catch (_) { items = []; }
      if (!Array.isArray(items) || !items.length) {
        try { items = JSON.parse(localStorage.getItem("vrajNaturalsCartV1") || "[]").map(item => ({ id: item.id, weightKg: Number(item.weightKg), packs: Number(item.quantity) })); } catch (_) { items = []; }
      }
      if (!Array.isArray(items) || !items.length) items = fromQuery;
      items = items.filter(item => productData.some(product => product.id === item.id) && [1, 2, 5, 10].includes(Number(item.weightKg)) && Number.isInteger(Number(item.packs)) && Number(item.packs) >= 1 && Number(item.packs) <= 50);
      drawSummary();
      if (!workerUrl) {
        button.disabled = true;
        label.textContent = "Online checkout unavailable";
        showStatus("Secure one-time checkout is not available on this preview site yet. Please contact info@vrajnaturals.com.");
      } else {
        const healthResponse = await fetch(`${workerUrl}/api/health`, { cache: "no-store" });
        const health = await healthResponse.json().catch(() => ({}));
        if (!healthResponse.ok || !health.credentialsConfigured || !health.shopPaymentsEnabled) {
          button.disabled = true;
          label.textContent = "Online checkout unavailable";
          showStatus("One-time shop payments are not enabled in this environment yet. Please contact info@vrajnaturals.com.");
        } else {
          onlineCheckoutReady = true;
          drawSummary();
        }
      }
      [form.elements.city, form.elements.postalCode].forEach(field => {
        field.addEventListener("input", drawSummary);
        field.addEventListener("change", drawSummary);
      });
    } catch (_) {
      showStatus("We couldn't load the product selection. Please go back to the shop and choose a product.", true);
    }
  })();
})();
