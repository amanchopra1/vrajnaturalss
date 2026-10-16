/* VRAJ NATURALS — shared frontend interactions */
(() => {
  "use strict";

  const CONFIG = {
    brand: "Vraj Naturals",
    contactEmail: "hello@shop.vrajnaturals.com",
    workerBaseUrl: "", // Add your deployed Cloudflare Worker URL before enabling payments.
    currency: "INR",
    pricesArePlaceholders: false,
    packOptionsKg: [1, 2, 5, 10],
    products: []
  };

  const money = amount => new Intl.NumberFormat("en-IN", { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(amount);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const productById = id => CONFIG.products.find(product => product.id === id);
  const packOptions = () => CONFIG.packOptionsKg.map(kg => `<option value="${kg}">${kg} kg</option>`).join("");
  const productPrice = (product, kg, packs, subscription = false) => (subscription ? product.subscriptionPricePerKg : product.regularPricePerKg) * kg * packs;

  function currentPage() {
    const path = location.pathname.split("/").filter(Boolean).pop() || "index.html";
    return path.toLowerCase();
  }

  function renderHeader() {
    const target = document.querySelector("[data-site-header]");
    if (!target) return;
    const active = currentPage();
    const links = [
      ["Shop", "/shop.html", ["shop.html", "product.html"]],
      ["Subscriptions", "/subscriptions.html", ["subscriptions.html"]],
      ["Journal", "/blogs.html", ["blogs.html", "sonamotiwhytoeat.html", "traditionalgrains.html", "farmtokitchen.html", "understandingbajra.html", "storinggrains.html", "traditionalfoodpractices.html", "naturalfarming.html"]],
      ["Our Story", "/our-story.html", ["our-story.html"]],
      ["Contact", "/contact.html", ["contact.html"]]
    ];
    target.className = "site-header";
    target.innerHTML = `
      <div class="header-inner">
        <a class="brand" href="/" aria-label="Vraj Naturals home">
          <img class="brand-logo" src="/images/vraj-naturals-logo.webp" alt="Vraj Naturals">
        </a>
        <nav class="primary-nav" id="primary-navigation" aria-label="Main navigation">
          ${links.map(([label, href, pages]) => `<a href="${href}" ${pages.includes(active) ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
        <div class="header-actions"><a class="header-shop-link" href="/shop.html">Explore collection ↗</a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation"><span aria-hidden="true">☰</span> Menu</button></div>
      </div>`;
    const toggle = target.querySelector(".menu-toggle");
    const nav = target.querySelector(".primary-nav");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
  }

  function renderFooter() {
    const target = document.querySelector("[data-site-footer]");
    if (!target) return;
    target.className = "site-footer";
    target.innerHTML = `
      <div class="footer-main">
        <div class="footer-brand">
          <a class="brand" href="/" aria-label="Vraj Naturals home"><img class="brand-logo" src="/images/vraj-naturals-logo.webp" alt="Vraj Naturals"></a>
          <p>Traditional Indian staples and thoughtfully chosen handicrafts, bringing heritage and everyday living together.</p>
        </div>
        <div class="footer-column"><h3>Explore</h3><a href="/shop.html">Shop all</a><a href="/shop.html?category=food">Food staples</a><a href="/shop.html?category=handicrafts">Handicrafts</a><a href="/subscriptions.html">Subscriptions</a><a href="/blogs.html">Journal</a></div>
        <div class="footer-column"><h3>About us</h3><a href="/our-story.html">Our story</a><a href="/contact.html">Contact us</a></div>
        <div class="footer-column"><h3>Customer care</h3><a href="/shipping-returns.html">Shipping &amp; returns</a><a href="/privacy-policy.html">Privacy policy</a><a href="/terms.html">Terms &amp; conditions</a><a href="mailto:${escapeHtml(CONFIG.contactEmail)}">${escapeHtml(CONFIG.contactEmail)}</a></div>
      </div>
      <div class="footer-bottom"><p>© <span data-current-year></span> Vraj Naturals. All rights reserved.</p><p>Made with care, rooted in tradition.</p></div>`;
    const year = target.querySelector("[data-current-year]");
    if (year) year.textContent = new Date().getFullYear();
  }

  function productArtwork(product, extraClass = "") {
    const image = product.image ? `/images/${product.image.split("/").map(encodeURIComponent).join("/")}` : "";
    return `<div class="product-image ${extraClass}">
      ${image ? `<img src="${image}" alt="${escapeHtml(product.name)} packaging" loading="lazy" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">` : ""}
      <div class="product-placeholder" aria-hidden="true"><img class="placeholder-brand-logo" src="/images/vraj-naturals-logo.webp" alt=""><span>${escapeHtml(product.name.toUpperCase())}</span></div>
      <span class="product-label">${escapeHtml(product.label)}</span>
    </div>`;
  }

  function productGallery(product) {
    const images = product.gallery?.length ? product.gallery : product.image ? [product.image] : [];
    if (!images.length) return productArtwork(product, "detail-artwork");
    const multiple = images.length > 1 ? " is-multiple" : "";
    return `<div class="product-detail-art product-detail-gallery${multiple}">${images.map((path, index) => `<img class="product-gallery-image" src="/images/${path.split("/").map(encodeURIComponent).join("/")}" alt="${escapeHtml(product.name)} packaging, view ${index + 1}" loading="lazy">`).join("")}</div>`;
  }

  function productCard(product) {
    return `<article class="product-card" data-category="${escapeHtml(product.category)}" data-price="${product.regularPricePerKg}" data-name="${escapeHtml(product.name.toLowerCase())}">
      <a class="product-card-link" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">
        ${productArtwork(product)}
        <div class="product-card-info"><h3>${escapeHtml(product.name)}</h3><div class="product-meta"><span>${money(product.regularPricePerKg)} / kg</span><span class="product-price" data-card-total="${product.id}">${money(product.regularPricePerKg)} total</span></div><p class="pack-unit-price" data-card-unit="${product.id}">${money(product.regularPricePerKg)} per 1 kg pack</p></div>
      </a>
      <div class="card-pack-controls"><label>Pack size<select data-card-kg="${product.id}" aria-label="${escapeHtml(product.name)} pack size">${packOptions()}</select></label><div class="card-packs"><span>Number of packs</span><div class="qty-stepper"><button type="button" data-card-pack-change="-1" aria-label="Remove one pack">−</button><input type="number" min="1" max="50" value="1" data-card-packs="${product.id}" aria-label="Number of ${escapeHtml(product.name)} packs"><button type="button" data-card-pack-change="1" aria-label="Add one pack">+</button></div></div></div>
    </article>`;
  }

  function updateCardPrice(card) {
    const kgSelect = card.querySelector("[data-card-kg]");
    const product = productById(kgSelect?.dataset.cardKg);
    if (!product) return;
    const kg = Number(kgSelect.value);
    const packs = Number(card.querySelector("[data-card-packs]").value);
    card.querySelector("[data-card-unit]").textContent = `${money(productPrice(product, kg, 1))} per ${kg} kg pack`;
    card.querySelector("[data-card-total]").textContent = `${money(productPrice(product, kg, packs))} total`;
  }

  function handleShopPackControls() {
    document.addEventListener("change", event => {
      const select = event.target.closest("[data-card-kg]");
      const input = event.target.closest("[data-card-packs]");
      if (!select && !input) return;
      const card = event.target.closest(".product-card");
      if (input) input.value = Math.max(1, Math.min(50, Math.floor(Number(input.value || 1))));
      if (card) updateCardPrice(card);
    });
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-card-pack-change]");
      if (!button) return;
      const card = button.closest(".product-card");
      const input = card.querySelector("[data-card-packs]");
      input.value = Math.max(1, Math.min(50, Number(input.value || 1) + Number(button.dataset.cardPackChange)));
      updateCardPrice(card);
    });
  }

  function renderFeatured() {
    const target = document.querySelector("[data-featured-products]");
    if (!target) return;
    target.innerHTML = CONFIG.products.filter(p => p.category === "food" && p.featured !== false && p.available !== false).slice(0, 4).map(productCard).join("");
  }

  let activeFilter = "all";
  function renderShop() {
    const target = document.querySelector("[data-shop-products]");
    if (!target) return;
    const urlCategory = new URLSearchParams(location.search).get("category");
    if (urlCategory === "food" || urlCategory === "handicrafts") activeFilter = urlCategory;
    const sortSelect = document.querySelector("#sort-products");
    function draw() {
      let products = CONFIG.products.filter(p => p.available !== false && (activeFilter === "all" || p.category === activeFilter));
      const sort = sortSelect ? sortSelect.value : "featured";
      if (sort === "price-low") products.sort((a, b) => a.regularPricePerKg - b.regularPricePerKg);
      if (sort === "price-high") products.sort((a, b) => b.regularPricePerKg - a.regularPricePerKg);
      if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));
      target.innerHTML = products.map(productCard).join("") || '<p class="muted">No products in this collection yet. Please check back soon.</p>';
    }
    document.querySelectorAll("[data-filter]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.filter === activeFilter);
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("is-active", item === button));
        draw();
      });
    });
    if (sortSelect) sortSelect.addEventListener("change", draw);
    draw();
  }

  function renderProductDetail() {
    const target = document.querySelector("[data-product-detail]");
    if (!target) return;
    const id = new URLSearchParams(location.search).get("id");
    const product = productById(id);
    if (!product) return;
    document.title = `${product.name} | Vraj Naturals`;
    const crumb = document.querySelector("[data-breadcrumb-product]");
    if (crumb) crumb.textContent = product.name;
    target.innerHTML = `
      ${productGallery(product)}
      <div class="product-detail-copy"><p class="eyebrow">${escapeHtml(product.label)}</p><h1>${escapeHtml(product.name)}</h1><div class="detail-price" data-detail-total>${money(product.regularPricePerKg)} per 1 kg pack · ${money(product.regularPricePerKg)} total · ${money(product.regularPricePerKg)} / kg</div><p>${escapeHtml(product.description)}</p><div class="detail-actions detail-pack-actions"><label class="field-label">Pack size<select id="product-pack-size">${packOptions()}</select></label><div class="card-packs"><span>Number of packs</span><div class="qty-stepper"><button type="button" data-qty-minus aria-label="Decrease number of packs">−</button><input type="number" min="1" max="50" value="1" id="product-quantity" aria-label="Number of packs"><button type="button" data-qty-plus aria-label="Increase number of packs">+</button></div></div><button class="button button-primary" type="button" data-buy-product="${escapeHtml(product.id)}">Enquire / Buy <span aria-hidden="true">↗</span></button></div><p class="form-disclaimer">Regular shop rate. Checkout is not live yet; enquiries open in your email application.</p><p><a class="text-link" href="/subscriptions.html">See lower subscription rates ↗</a></p></div>`;
    const qty = target.querySelector("#product-quantity");
    const kgSelect = target.querySelector("#product-pack-size");
    const updateDetailPrice = () => {
      const total = productPrice(product, Number(kgSelect.value), Number(qty.value));
      target.querySelector("[data-detail-total]").textContent = `${money(productPrice(product, Number(kgSelect.value), 1))} per ${kgSelect.value} kg pack · ${money(total)} total · ${money(product.regularPricePerKg)} / kg`;
    };
    target.querySelector("[data-qty-minus]").addEventListener("click", () => { qty.value = Math.max(1, Number(qty.value || 1) - 1); updateDetailPrice(); });
    target.querySelector("[data-qty-plus]").addEventListener("click", () => { qty.value = Math.min(50, Number(qty.value || 1) + 1); updateDetailPrice(); });
    qty.addEventListener("change", () => { qty.value = Math.max(1, Math.min(50, Number(qty.value || 1))); updateDetailPrice(); });
    kgSelect.addEventListener("change", updateDetailPrice);
    target.querySelector("[data-buy-product]").addEventListener("click", () => {
      const subject = encodeURIComponent(`Product enquiry: ${product.name}`);
      const kg = Number(kgSelect.value);
      const packs = Number(qty.value);
      const body = encodeURIComponent(`Hello Vraj Naturals,\n\nI am interested in:\nProduct: ${product.name}\nPack size: ${kg} kg\nNumber of packs: ${packs}\nRate: ${money(product.regularPricePerKg)} / kg\nTotal: ${money(productPrice(product, kg, packs))}`);
      location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${body}`;
    });
  }

  function renderSubscriptionProducts() {
    const target = document.querySelector("[data-subscription-products]");
    if (!target) return;
    target.innerHTML = CONFIG.products.filter(p => p.category === "food" && p.available !== false).map(p => `
      <div class="subscription-product" data-sub-product="${p.id}">
        <div class="subscription-product-name"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.label)}</p><span class="sub-product-price">${money(p.subscriptionPricePerKg)} / kg</span><span class="sub-pack-price" data-sub-pack-price="${p.id}">${money(p.subscriptionPricePerKg)} per 1 kg pack</span></div>
        <label class="subscription-pack-size">Pack size<select data-sub-kg="${p.id}" aria-label="${escapeHtml(p.name)} pack size">${packOptions()}</select></label>
        <div class="subscription-pack-count"><span>Number of packs</span><div class="qty-stepper"><button type="button" data-qty-change="-1" aria-label="Remove one ${escapeHtml(p.name)} pack">−</button><input type="number" value="0" min="0" max="50" step="1" inputmode="numeric" data-sub-qty="${p.id}" aria-label="${escapeHtml(p.name)} number of packs"><button type="button" data-qty-change="1" aria-label="Add one ${escapeHtml(p.name)} pack">+</button></div></div>
      </div>`).join("");
    target.querySelectorAll("[data-qty-change]").forEach(button => button.addEventListener("click", () => {
      const input = button.closest(".qty-stepper").querySelector("input");
      input.value = Math.max(0, Math.min(50, Number(input.value || 0) + Number(button.dataset.qtyChange)));
      updateSubscriptionSummary();
    }));
    target.querySelectorAll("input[data-sub-qty]").forEach(input => input.addEventListener("change", () => {
      input.value = Math.max(0, Math.min(50, Math.floor(Number(input.value || 0))));
      updateSubscriptionSummary();
    }));
    target.querySelectorAll("select[data-sub-kg]").forEach(select => select.addEventListener("change", updateSubscriptionSummary));
    updateSubscriptionSummary();
  }

  function selectedSubscriptionItems() {
    return [...document.querySelectorAll("[data-sub-qty]")].map(input => {
      const product = productById(input.dataset.subQty);
      const packs = Math.max(0, Math.min(50, Math.floor(Number(input.value || 0))));
      const kg = Number(input.closest(".subscription-product").querySelector("[data-sub-kg]").value);
      return { product, kg, packs };
    }).filter(item => item.product && item.packs > 0);
  }

  function updateSubscriptionSummary() {
    const summary = document.querySelector("[data-subscription-summary]");
    const total = document.querySelector("[data-subscription-total]");
    const freq = document.querySelector("#frequency");
    const freqText = document.querySelector("[data-summary-frequency]");
    if (!summary || !total) return;
    const items = selectedSubscriptionItems();
    document.querySelectorAll("[data-sub-pack-price]").forEach(price => {
      const product = productById(price.dataset.subPackPrice);
      const row = price.closest(".subscription-product");
      const kg = Number(row.querySelector("[data-sub-kg]").value);
      if (product) price.textContent = `${money(productPrice(product, kg, 1, true))} per ${kg} kg pack`;
    });
    summary.innerHTML = items.length ? items.map(({product, kg, packs}) => `<div class="summary-line"><span>${escapeHtml(product.name)} · ${kg} kg × ${packs} pack${packs === 1 ? "" : "s"}</span><span>${money(productPrice(product, kg, packs, true))}</span></div>`).join("") : '<p class="muted">Select products to see your estimate.</p>';
    total.textContent = money(items.reduce((sum, item) => sum + productPrice(item.product, item.kg, item.packs, true), 0));
    const labels = { weekly: "Every week", fortnightly: "Every 2 weeks", monthly: "Every month" };
    if (freqText) freqText.textContent = labels[freq?.value] || "Recurring schedule";
  }

  async function submitSubscription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector("[data-subscription-status]");
    const items = selectedSubscriptionItems();
    if (!items.length) {
      setStatus(status, "Please select at least one product and quantity.", true);
      return;
    }
    if (!form.reportValidity()) return;
    const payload = {
      customer: {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim()
      },
      shipping: {
        address1: form.elements.address1.value.trim(),
        address2: form.elements.address2.value.trim(),
        city: form.elements.city.value.trim(),
        state: form.elements.state.value.trim(),
        postalCode: form.elements.postalCode.value.trim(),
        country: form.elements.country.value.trim()
      },
      frequency: form.elements.frequency.value,
      items: items.map(({product, kg, packs}) => ({ id: product.id, weightKg: kg, packs })),
      consent: form.elements.consent.checked
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(status, "");
    try {
      if (!CONFIG.workerBaseUrl) {
        throw new Error("Demo mode: the secure payment Worker is not configured yet. No information was sent or stored. Configure workerBaseUrl after deploying and testing the Cloudflare Worker.");
      }
      const response = await fetch(`${CONFIG.workerBaseUrl.replace(/\/$/, "")}/api/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't start the subscription. Please try again or contact us.");
      if (!data.checkout_url) throw new Error("The payment provider did not return a checkout link. Please contact us.");
      location.href = data.checkout_url;
    } catch (error) {
      setStatus(status, error.message || "Something went wrong. Please try again.", true);
    } finally {
      button.disabled = false;
    }
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function handleContactForm() {
    const form = document.querySelector("#contact-form");
    if (!form) return;
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const subject = encodeURIComponent(`[Vraj Naturals] ${data.get("topic")}`);
      const body = encodeURIComponent(`Name: ${data.get("name")}\nEmail: ${data.get("email")}\nTopic: ${data.get("topic")}\n\n${data.get("message")}`);
      setStatus(form.querySelector("[data-contact-status]"), "Opening your email application. Your message has not been sent yet.");
      location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${body}`;
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    renderHeader();
    renderFooter();
    try {
      const response = await fetch("/products.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Could not load product catalogue");
      const catalogue = await response.json();
      CONFIG.products = Array.isArray(catalogue.products) ? catalogue.products : [];
      CONFIG.currency = catalogue.currency || "INR";
      CONFIG.pricesArePlaceholders = catalogue.pricesArePlaceholders !== false;
      CONFIG.packOptionsKg = Array.isArray(catalogue.packOptionsKg) ? catalogue.packOptionsKg : [1, 2, 5, 10];
    } catch (error) { console.error(error); }
    renderFeatured();
    renderShop();
    renderProductDetail();
    renderSubscriptionProducts();
    handleShopPackControls();
    const subscriptionForm = document.querySelector("#subscription-form");
    if (subscriptionForm) {
      subscriptionForm.addEventListener("submit", submitSubscription);
      document.querySelector("#frequency")?.addEventListener("change", updateSubscriptionSummary);
    }
    handleContactForm();
    document.querySelectorAll("[data-contact-email]").forEach(link => {
      link.textContent = CONFIG.contactEmail;
      link.href = `mailto:${CONFIG.contactEmail}`;
    });
  });
})();
