/* VRAJ NATURALS - shared frontend interactions */
(() => {
  "use strict";

  const CONFIG = {
    brand: "Vraj Naturals",
    contactEmail: "info@vrajnaturals.com",
    whatsappNumber: "918860493812",
    workerBaseUrl: ["localhost", "127.0.0.1", "::1"].includes(location.hostname)
      ? "http://127.0.0.1:8787"
      : location.hostname === "vrajnaturals.com" ? location.origin : "",
    currency: "INR",
    pricesArePlaceholders: false,
    packOptionsKg: [1, 2, 5, 10],
    products: []
  };
  const FATEHABAD_FREE_PIN = "125050";
  const SUBSCRIPTION_DELIVERY_TIERS = [[2, 99], [20, 149], [50, 199], [100, 249], [350, 399], [500, 499]];
  let subscriptionCheckoutReady = false;
  let subscriptionRequestFingerprint = "";
  let subscriptionIdempotencyKey = "";

  const money = amount => new Intl.NumberFormat("en-IN", { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(amount);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const productById = id => CONFIG.products.find(product => product.id === id);
  const packOptions = () => CONFIG.packOptionsKg.map(kg => `<option value="${kg}">${kg} kg</option>`).join("");
  const productPrice = (product, kg, packs, subscription = false) => (subscription ? product.subscriptionPricePerKg : product.regularPricePerKg) * kg * packs;
  const deliveryFeeFor = (weightKg, postalCode, city) => {
    if (weightKg > 500) return null;
    if (String(postalCode || "").trim() === FATEHABAD_FREE_PIN && /fatehabad/i.test(String(city || "").trim())) return 0;
    return SUBSCRIPTION_DELIVERY_TIERS.find(([limit]) => weightKg <= limit)?.[1] ?? 0;
  };
  const isFatehabadFreeDelivery = (postalCode, city) => String(postalCode || "").trim() === FATEHABAD_FREE_PIN && /fatehabad/i.test(String(city || "").trim());
  const whatsappUrl = message => `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  const whatsappIcon = '<svg class="whatsapp-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 3.25A12.25 12.25 0 0 0 5.4 21.65L4 28l6.5-1.35A12.25 12.25 0 1 0 16 3.25Z"/><path d="M11.2 9.7c-.35-.78-.73-.8-1.07-.81h-.9c-.31 0-.82.12-1.25.59-.43.47-1.64 1.6-1.64 3.89s1.68 4.51 1.91 4.82c.24.31 3.25 5.21 8.03 7.1 3.97 1.57 4.78 1.26 5.64 1.18.86-.08 2.77-1.13 3.16-2.22.39-1.1.39-2.03.27-2.22-.12-.2-.43-.32-.9-.55-.47-.24-2.77-1.37-3.2-1.53-.43-.16-.74-.24-1.05.24-.31.47-1.21 1.53-1.48 1.84-.27.31-.55.35-1.02.12-.47-.24-1.99-.73-3.79-2.34-1.4-1.25-2.35-2.8-2.62-3.28-.27-.47-.03-.73.2-.96.21-.21.47-.55.7-.82.24-.27.31-.47.47-.78.16-.31.08-.59-.04-.82-.12-.24-1.05-2.58-1.43-3.45Z"/></svg>';
  const orderMessage = (product, kg, packs, subscription = false) => {
    const rate = subscription ? product.subscriptionPricePerKg : product.regularPricePerKg;
    const priceLabel = subscription ? "Estimated subscription total" : "Estimated product total";
    return `Hello Vraj Naturals, I would like to place an order.\nProduct: ${product.name}\nPack size: ${kg} kg\nNumber of packs: ${packs}\nRate: ${money(rate)} / kg\n${priceLabel}: ${money(productPrice(product, kg, packs, subscription))}\nPlease confirm availability, delivery charges and the final amount.`;
  };

  function currentPage() {
    const path = location.pathname.split("/").filter(Boolean).pop() || "index.html";
    return path.toLowerCase();
  }

  function renderHeader() {
    const target = document.querySelector("[data-site-header]");
    if (!target) return;
    const active = currentPage();
    const links = [
      ["Home", "https://vrajnaturals.com/", ["index.html"]],
      ["Shop", "/shop.html", ["shop.html", "product.html"]],
      ["Subscriptions", "/subscriptions.html", ["subscriptions.html"]],
      ["Journal", "/blogs.html", ["blogs.html", "sonamotiwhytoeat.html", "traditionalgrains.html", "farmtokitchen.html", "understandingbajra.html", "storinggrains.html", "traditionalfoodpractices.html", "naturalfarming.html"]],
      ["Our Story", "/our-story.html", ["our-story.html"]],
      ["Contact", "/contact.html", ["contact.html"]],
      ["The Vraj Circle", "#join-vraj-circle", []]
    ];
    target.className = "site-header";
    target.innerHTML = `
      <div class="header-inner">
        <a class="brand" href="/" aria-label="Vraj Naturals home">
          <img class="brand-logo" src="/images/vraj-naturals-logo.webp" alt="Vraj Naturals">
        </a>
        <nav class="primary-nav" id="primary-navigation" aria-label="Main navigation">
          ${links.map(([label, href, pages]) => `<a href="${href}" ${label === "The Vraj Circle" ? 'data-open-vraj-circle' : ""} ${pages.includes(active) ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
        <div class="header-actions"><a class="header-shop-link" href="/shop.html">Explore collection </a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation"><span class="menu-mark" aria-hidden="true"></span> Menu</button></div>
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
          <a class="button button-primary footer-circle-join" href="#join-vraj-circle" data-open-vraj-circle>Join The Vraj Circle </a>
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
      ${image ? `<img src="${image}" alt="${escapeHtml(product.imageAlt || `${product.name} packaging`)}" loading="lazy" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">` : ""}
      <div class="product-placeholder" aria-hidden="true"><img class="placeholder-brand-logo" src="/images/vraj-naturals-logo.webp" alt=""><span>${escapeHtml(product.name.toUpperCase())}</span></div>
      <span class="product-label">${escapeHtml(product.label)}</span>
    </div>`;
  }

  function productGallery(product) {
    const images = product.gallery?.length ? product.gallery : product.image ? [product.image] : [];
    if (!images.length) return productArtwork(product, "detail-artwork");
    const multiple = images.length > 1 ? " is-multiple" : "";
    return `<div class="product-detail-art product-detail-gallery${multiple}">${images.map((path, index) => `<img class="product-gallery-image" src="/images/${path.split("/").map(encodeURIComponent).join("/")}" alt="${escapeHtml(product.imageAlt || `${product.name} packaging, view ${index + 1}`)}" loading="lazy">`).join("")}</div>`;
  }

  function productCard(product) {
    return `<article class="product-card shop-cart-card" data-category="${escapeHtml(product.category)}" data-price="${product.regularPricePerKg}" data-name="${escapeHtml(product.name.toLowerCase())}">
      <button class="shop-product-image-button" type="button" data-quickview-open="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)} details and images">
        ${productArtwork(product)}<span class="shop-view-hint">Quick view</span>
      </button>
      <div class="product-card-info"><h3>${escapeHtml(product.name)}</h3><div class="product-meta"><span>${money(product.regularPricePerKg)} / kg</span></div></div>
      <button class="button button-primary product-order-button" data-add-product="${escapeHtml(product.id)}" type="button">Add to cart <span aria-hidden="true">+</span></button>
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
      const buyButton = event.target.closest("[data-card-buy]");
      if (buyButton) {
        const card = buyButton.closest(".product-card");
        const productId = buyButton.dataset.cardBuy;
        const weightKg = Number(card.querySelector("[data-card-kg]").value);
        const packs = Math.max(1, Math.min(50, Number(card.querySelector("[data-card-packs]").value || 1)));
        try {
          sessionStorage.setItem("vrajShopCheckoutItems", JSON.stringify([{ id: productId, weightKg, packs }]));
          location.href = "/checkout.html";
        } catch (_) {
          location.href = `/checkout.html?item=${encodeURIComponent(productId)}&kg=${weightKg}&packs=${packs}`;
        }
        return;
      }
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
    target.innerHTML = CONFIG.products.filter(p => p.category === "food" && p.featured !== false && p.available !== false).slice(0, 6).map(productCard).join("");
  }

  let activeFilter = "all";
  function renderShop() {
    const target = document.querySelector("[data-shop-products]");
    if (!target) return;
    // The shop page opts into its dedicated cart and quick-view renderer.
    if (document.querySelector("[data-cart-drawer]")) return;
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
      button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(item => {
          item.classList.toggle("is-active", item === button);
          item.setAttribute("aria-pressed", String(item === button));
        });
        draw();
      });
    });
    if (sortSelect) sortSelect.addEventListener("change", draw);
    draw();
  }

  function renderProductDetail() {
    const target = document.querySelector("[data-product-detail]");
    if (!target) return;
    const setProductMetadata = ({ title, description, canonical, image }) => {
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) metaDescription.content = description;
      document.title = title;
      document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
      document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
      document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
      document.querySelector('meta[property="og:image"]')?.setAttribute("content", image);
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink) canonicalLink.href = canonical;
    };
    const id = new URLSearchParams(location.search).get("id");
    const product = productById(id);
    if (!product) {
      const title = "Product not found | Vraj Naturals";
      const description = "This product could not be found. Explore the Vraj Naturals collection.";
      setProductMetadata({ title, description, canonical: "https://vrajnaturals.com/product.html", image: "https://vrajnaturals.com/images/hero-planet.webp" });
      const crumb = document.querySelector("[data-breadcrumb-product]");
      if (crumb) crumb.textContent = "Product not found";
      target.innerHTML = `<div class="product-not-found"><p class="eyebrow">THE COLLECTION</p><h1>Product not found.</h1><p>We couldn't find that product. It may have moved or may no longer be available.</p><a class="button button-primary" href="/shop.html">Browse the shop</a></div>`;
      return;
    }
    const title = `${product.name} | Vraj Naturals`;
    const productDescription = `${product.name}: ${product.description} View pack sizes and per-kg pricing from Vraj Naturals.`;
    const productImage = product.image ? `/images/${product.image.split("/").map(encodeURIComponent).join("/")}` : "/images/hero-planet.webp";
    setProductMetadata({ title, description: productDescription, canonical: `https://vrajnaturals.com/product.html?id=${encodeURIComponent(product.id)}`, image: new URL(productImage, "https://vrajnaturals.com").href });
    const crumb = document.querySelector("[data-breadcrumb-product]");
    if (crumb) crumb.textContent = product.name;
    target.innerHTML = `
      ${productGallery(product)}
      <div class="product-detail-copy"><p class="eyebrow">${escapeHtml(product.label)}</p><h1>${escapeHtml(product.name)}</h1><div class="detail-price" data-detail-total>${money(product.regularPricePerKg)} per 1 kg pack · ${money(product.regularPricePerKg)} total · ${money(product.regularPricePerKg)} / kg</div><p>${escapeHtml(product.description)}</p><div class="detail-actions detail-pack-actions"><label class="field-label">Pack size<select id="product-pack-size">${packOptions()}</select></label><div class="card-packs"><span>Number of packs</span><div class="qty-stepper"><button type="button" data-qty-minus aria-label="Decrease ${escapeHtml(product.name)} pack count">−</button><input type="number" min="1" max="50" value="1" id="product-quantity" aria-label="Number of ${escapeHtml(product.name)} packs"><button type="button" data-qty-plus aria-label="Increase ${escapeHtml(product.name)} pack count">+</button></div></div><button class="button button-primary" data-buy-product="${escapeHtml(product.id)}" type="button">Order Now </button></div><p class="form-disclaimer">One-time secure checkout.</p><p><a class="text-link" href="/subscriptions.html">See lower subscription rates </a></p></div>`;
    const qty = target.querySelector("#product-quantity");
    const kgSelect = target.querySelector("#product-pack-size");
    const updateDetailPrice = () => {
      const total = productPrice(product, Number(kgSelect.value), Number(qty.value));
      target.querySelector("[data-detail-total]").textContent = `${money(productPrice(product, Number(kgSelect.value), 1))} per ${kgSelect.value} kg pack · ${money(total)} total · ${money(product.regularPricePerKg)} / kg`;
    };
    target.querySelector("[data-buy-product]").addEventListener("click", () => {
      const item = { id: product.id, weightKg: Number(kgSelect.value), packs: Math.max(1, Math.min(50, Number(qty.value || 1))) };
      try {
        sessionStorage.setItem("vrajShopCheckoutItems", JSON.stringify([item]));
        location.href = "/checkout.html";
      } catch (_) {
        location.href = `/checkout.html?item=${encodeURIComponent(item.id)}&kg=${item.weightKg}&packs=${item.packs}`;
      }
    });
    target.querySelector("[data-qty-minus]").addEventListener("click", () => { qty.value = Math.max(1, Number(qty.value || 1) - 1); updateDetailPrice(); });
    target.querySelector("[data-qty-plus]").addEventListener("click", () => { qty.value = Math.min(50, Number(qty.value || 1) + 1); updateDetailPrice(); });
    qty.addEventListener("change", () => { qty.value = Math.max(1, Math.min(50, Number(qty.value || 1))); updateDetailPrice(); });
    kgSelect.addEventListener("change", updateDetailPrice);
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
    const delivery = document.querySelector("[data-subscription-delivery]");
    const deliveryWeight = document.querySelector("[data-subscription-weight]");
    const bulkNote = document.querySelector("[data-subscription-bulk]");
    if (!summary || !total) return;
    const items = selectedSubscriptionItems();
    document.querySelectorAll("[data-sub-pack-price]").forEach(price => {
      const product = productById(price.dataset.subPackPrice);
      const row = price.closest(".subscription-product");
      const kg = Number(row.querySelector("[data-sub-kg]").value);
      if (product) price.textContent = `${money(productPrice(product, kg, 1, true))} per ${kg} kg pack`;
    });
    summary.innerHTML = items.length ? items.map(({product, kg, packs}) => `<div class="summary-line"><span>${escapeHtml(product.name)} · ${kg} kg × ${packs} pack${packs === 1 ? "" : "s"}</span><span>${money(productPrice(product, kg, packs, true))}</span></div>`).join("") : '<p class="muted">Select products to see your estimate.</p>';
    const productsTotal = items.reduce((sum, item) => sum + productPrice(item.product, item.kg, item.packs, true), 0);
    const totalWeightKg = items.reduce((sum, item) => sum + item.kg * item.packs, 0);
    const form = document.querySelector("#subscription-form");
    const fee = deliveryFeeFor(totalWeightKg, form?.elements.postalCode?.value, form?.elements.city?.value);
    const isBulk = Boolean(items.length && fee === null);
    if (deliveryWeight) deliveryWeight.textContent = items.length ? `(${totalWeightKg} kg total)` : "";
    if (delivery) delivery.textContent = isBulk ? "Custom quote" : items.length && isFatehabadFreeDelivery(form?.elements.postalCode?.value, form?.elements.city?.value) ? "Free" : money(items.length ? fee : 0);
    total.textContent = isBulk ? "Custom quote" : money(productsTotal + (items.length ? fee : 0));
    if (bulkNote) bulkNote.hidden = !isBulk;
    const submit = form?.querySelector('button[type="submit"]');
    // Keep the action usable when the selection itself needs attention. The submit
    // handler can explain the missing selection or bulk quote instead of leaving
    // customers with a button that appears unresponsive.
    if (submit) submit.disabled = !subscriptionCheckoutReady;
    const labels = { weekly: "Every week", fortnightly: "Every 2 weeks", monthly: "Every month", "every-two-months": "Every 2 months", "every-three-months": "Every 3 months" };
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
    const totalWeightKg = items.reduce((sum, item) => sum + item.kg * item.packs, 0);
    if (totalWeightKg > 500) {
      setStatus(status, "For orders above 500 kg, please contact us at +91 8860493812 for a customised quotation.", true);
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
      consent: form.elements.consent.checked,
      emailReminderConsent: true
    };
    const button = form.querySelector('button[type="submit"]');
    const buttonLabel = button.querySelector("[data-submit-label]");
    const buttonArrow = button.querySelector("[data-submit-arrow]");
    const buttonSpinner = button.querySelector("[data-submit-spinner]");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    buttonLabel.textContent = "Connecting securely to Razorpay…";
    buttonArrow.hidden = true;
    buttonSpinner.hidden = false;
    setStatus(status, "Preparing your secure checkout. This can take a few seconds. Please keep this page open.");
    status?.classList.add("is-loading");
    try {
      if (!CONFIG.workerBaseUrl) {
        throw new Error("Local payment testing is available only when the site is opened on localhost and the Wrangler Worker is running.");
      }
      const response = await fetch(`${CONFIG.workerBaseUrl.replace(/\/$/, "")}/api/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": subscriptionKeyFor(payload) },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't start the subscription. Please try again or contact us.");
      if (!data.checkout_url) throw new Error("The payment provider did not return a checkout link. Please contact us.");
      location.href = data.checkout_url;
    } catch (error) {
      const networkFailure = error instanceof TypeError && /load failed|failed to fetch|networkerror/i.test(error.message || "");
      const message = networkFailure
        ? "We couldn't reach the local checkout service. Make sure the website server and Wrangler Worker are running, then try again."
        : error.message || "Something went wrong. Please try again.";
      setStatus(status, message, true);
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
      buttonLabel.textContent = "Continue to secure payment";
      buttonArrow.hidden = false;
      buttonSpinner.hidden = true;
    }
  }

  function subscriptionKeyFor(payload) {
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== subscriptionRequestFingerprint) {
      subscriptionRequestFingerprint = fingerprint;
      subscriptionIdempotencyKey = crypto.randomUUID().replaceAll("-", "");
    }
    return subscriptionIdempotencyKey;
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
    element.classList.remove("is-loading");
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

  async function configureSubscriptionCheckout() {
    const form = document.querySelector("#subscription-form");
    if (!form) return;
    const button = form.querySelector('button[type="submit"]');
    const label = button?.querySelector("[data-submit-label]");
    const arrow = button?.querySelector("[data-submit-arrow]");
    const disclaimer = form.querySelector("[data-checkout-disclaimer]");
    if (!CONFIG.workerBaseUrl) {
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }
      if (label) label.textContent = "Online checkout unavailable";
      if (arrow) arrow.hidden = true;
      if (disclaimer) disclaimer.textContent = "Secure online checkout is not available on this preview site yet. Contact info@vrajnaturals.com for help.";
      setStatus(form.querySelector("[data-subscription-status]"), "Secure online checkout is not available on this site yet. Please contact info@vrajnaturals.com.");
      return;
    }
    try {
      const response = await fetch(`${CONFIG.workerBaseUrl.replace(/\/$/, "")}/api/health`, { cache: "no-store" });
      const health = await response.json().catch(() => ({}));
      if (!response.ok || !health.credentialsConfigured || !health.paymentsEnabled) throw new Error("Payments are not enabled on this checkout yet.");
    } catch (_) {
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }
      if (label) label.textContent = "Online checkout unavailable";
      if (arrow) arrow.hidden = true;
      if (disclaimer) disclaimer.textContent = "Secure online checkout is being prepared. Please contact info@vrajnaturals.com for help.";
      setStatus(form.querySelector("[data-subscription-status]"), "Online checkout is not available yet. Please contact info@vrajnaturals.com.");
      return;
    }
    if (disclaimer) disclaimer.textContent = ["localhost", "127.0.0.1", "::1"].includes(location.hostname)
      ? "Local checkout uses Razorpay Test Mode. Keep the Wrangler Worker running while testing, and use test customer details only."
      : "Checkout opens securely with Razorpay. The amount and recurring schedule will be shown for your review before authorisation.";
    if (button) {
      subscriptionCheckoutReady = true;
      button.removeAttribute("aria-disabled");
    }
    updateSubscriptionSummary();
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
      await configureSubscriptionCheckout();
      subscriptionForm.addEventListener("submit", submitSubscription);
      document.querySelector("#frequency")?.addEventListener("change", updateSubscriptionSummary);
      [subscriptionForm.elements.city, subscriptionForm.elements.postalCode].forEach(field => {
        field?.addEventListener("input", updateSubscriptionSummary);
        field?.addEventListener("change", updateSubscriptionSummary);
      });
    }
    handleContactForm();
    document.querySelectorAll("[data-contact-email]").forEach(link => {
      link.textContent = CONFIG.contactEmail;
      link.href = `mailto:${CONFIG.contactEmail}`;
    });
  });
})();
