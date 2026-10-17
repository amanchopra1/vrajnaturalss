(() => {
  "use strict";

  const STORAGE_KEY = "vrajNaturalsCartV1";
  const CHECKOUT_KEY = "vrajShopCheckoutItems";
  const form = document.querySelector("[data-shop-products]");
  const homepageProducts = document.querySelector("[data-featured-products]");
  const drawer = document.querySelector("[data-cart-drawer]");
  const backdrop = document.querySelector("[data-cart-backdrop]");
  const quickview = document.querySelector("[data-quickview]");
  if ((!form && !homepageProducts) || !drawer || !backdrop || !quickview) return;

  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const imageUrl = path => `/images/${String(path || "").split("/").map(encodeURIComponent).join("/")}`;
  const imageList = product => [...new Set((product.gallery?.length ? product.gallery : [product.image]).filter(Boolean))];
  const imageForPack = (product, weightKg) => product.packImagesKg?.[String(weightKg)] || product.image || imageList(product)[0];
  function imagesForPack(product, weightKg) {
    const packGallery = product.packGalleriesKg?.[String(weightKg)];
    if (Array.isArray(packGallery) && packGallery.length) return [...new Set(packGallery.filter(Boolean))];
    const packImage = imageForPack(product, weightKg);
    const variants = new Set(Object.values(product.packImagesKg || {}));
    const sharedImages = imageList(product).filter(path => !variants.has(path) && path !== packImage);
    return [...new Set([packImage, ...sharedImages].filter(Boolean))];
  }
  let products = [];
  let packsOptions = [1, 2, 5, 10];
  let cart = loadCart();
  let filter = new URLSearchParams(location.search).get("category") || "all";
  let sort = "featured";
  let activeProduct = null;
  let activeImages = [];
  let activeImage = 0;
  let slideTimer = 0;
  let lastFocus = null;

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item && typeof item.id === "string" && [1, 2, 5, 10].includes(Number(item.weightKg)) && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
        .map(item => ({ id: item.id, weightKg: Number(item.weightKg), quantity: Math.max(1, Math.min(50, Number(item.quantity))) }));
    } catch (_) { return []; }
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (_) { /* Keep this session's cart usable if storage is unavailable. */ }
    renderCart();
  }

  function productPrice(product, weightKg, quantity = 1) {
    return product.regularPricePerKg * weightKg * quantity;
  }

  function recommendedProducts() {
    const inCart = new Set(cart.map(item => item.id));
    const category = products.find(product => product.id === cart[0]?.id)?.category;
    const available = products.filter(product => product.available !== false && !inCart.has(product.id));
    return available.sort((a, b) => {
      const categoryOrder = Number(b.category === category) - Number(a.category === category);
      return categoryOrder || Number(b.featured) - Number(a.featured);
    }).slice(0, 3);
  }

  function recommendationsMarkup() {
    const suggestions = recommendedProducts();
    if (!suggestions.length) return "";
    return `<section class="shop-cart-recommendations" aria-label="Recommended products"><p class="eyebrow">A FEW GOOD ADDITIONS</p><h3>You may also like</h3><div class="shop-cart-recommend-list">${suggestions.map(product => `<article class="shop-cart-recommend-item"><img src="${imageUrl(imageForPack(product, 5))}" alt="" loading="lazy"><div class="shop-cart-recommend-copy"><h4>${escapeHtml(product.name)}</h4><p>1 kg · ${money(productPrice(product, 1))}</p></div><button type="button" class="shop-cart-recommend-add" data-recommend-add="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)}, 1 kg pack">Add <span aria-hidden="true">+</span></button></article>`).join("")}</div></section>`;
  }

  function packButtons(product, selected = 1, attribute = "data-pack-choice", disabledWeights = []) {
    return `<div class="pack-size-picker" role="group" aria-label="${escapeHtml(product.name)} pack size">${packsOptions.map(kg => `<button type="button" class="pack-size-option${kg === selected ? " is-active" : ""}" ${attribute}="${kg}" aria-pressed="${kg === selected}" ${disabledWeights.includes(kg) ? "disabled" : ""}>${kg} kg</button>`).join("")}</div>`;
  }

  function quantityControl(product, value = 1) {
    return `<div class="shop-quantity"><span>Quantity</span><div class="shop-stepper"><button type="button" data-quantity-change="-1" aria-label="Decrease ${escapeHtml(product.name)} quantity">−</button><input data-quantity value="${value}" type="number" min="1" max="50" inputmode="numeric" aria-label="${escapeHtml(product.name)} quantity"><button type="button" data-quantity-change="1" aria-label="Increase ${escapeHtml(product.name)} quantity">+</button></div></div>`;
  }

  function cardMarkup(product) {
    const img = imageForPack(product, 5);
    const alt = product.imageAlt || `${product.name} packaging`;
    return `<article class="product-card shop-cart-card" data-product-card="${escapeHtml(product.id)}" data-category="${escapeHtml(product.category)}" data-price="${product.regularPricePerKg}" data-name="${escapeHtml(product.name.toLowerCase())}">
      <button class="shop-product-image-button" type="button" data-quickview-open="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)} details and images"><div class="product-image"><img src="${imageUrl(img)}" alt="${escapeHtml(alt)}" loading="lazy"><span class="product-label">${escapeHtml(product.label || "Vraj Naturals")}</span><span class="shop-view-hint">Quick view</span></div></button>
      <div class="product-card-info"><h3>${escapeHtml(product.name)}</h3><div class="product-meta"><span>${money(product.regularPricePerKg)} / kg</span></div></div>
      <button class="button button-primary product-order-button" data-add-product="${escapeHtml(product.id)}" type="button">Add to cart <span aria-hidden="true">+</span></button>
    </article>`;
  }

  function drawProducts() {
    if (!form) return;
    let shown = products.filter(p => p.available !== false && (filter === "all" || p.category === filter));
    if (sort === "price-low") shown.sort((a, b) => a.regularPricePerKg - b.regularPricePerKg);
    if (sort === "price-high") shown.sort((a, b) => b.regularPricePerKg - a.regularPricePerKg);
    if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name));
    form.innerHTML = shown.map(cardMarkup).join("") || '<p class="muted">No products in this collection yet. Please check back soon.</p>';
  }

  function clampQuantity(input) {
    const value = Math.max(1, Math.min(50, Math.floor(Number(input?.value || 1))));
    if (input) input.value = value;
    return value;
  }

  function addProduct(id, weightKg, quantity) {
    const product = products.find(p => p.id === id && p.available !== false);
    if (!product || !packsOptions.includes(Number(weightKg))) return;
    const returnTarget = quickview.open ? document.querySelector(`[data-quickview-open="${CSS.escape(id)}"]`) : document.activeElement;
    const key = cart.find(item => item.id === id && item.weightKg === Number(weightKg));
    if (key) key.quantity = Math.min(50, key.quantity + Number(quantity));
    else cart.push({ id, weightKg: Number(weightKg), quantity: Math.max(1, Math.min(50, Number(quantity))) });
    saveCart();
    closeQuickview();
    openCart(returnTarget);
  }

  function renderCart() {
    cart = cart.filter(item => products.some(p => p.id === item.id && p.available !== false));
    const units = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + productPrice(products.find(p => p.id === item.id), item.weightKg, item.quantity), 0);
    document.querySelectorAll("[data-cart-count]").forEach(node => node.textContent = String(units));
    drawer.querySelector("[data-cart-heading-count]").textContent = `(${units})`;
    drawer.querySelector("[data-cart-subtotal]").textContent = money(subtotal);
    const list = drawer.querySelector("[data-cart-list]");
    list.innerHTML = (cart.length ? cart.map((item, index) => {
      const product = products.find(p => p.id === item.id);
      const disabledWeights = packsOptions.filter(weight => weight !== item.weightKg && cart.some((other, otherIndex) => otherIndex !== index && other.id === item.id && other.weightKg === weight && other.quantity + item.quantity > 50));
      return `<article class="shop-cart-item" data-cart-index="${index}"><img src="${imageUrl(imageForPack(product, item.weightKg))}" alt="${escapeHtml(product.name)}, ${item.weightKg} kg pack" loading="lazy"><div class="shop-cart-item-copy"><h3>${escapeHtml(product.name)}</h3><p>${item.weightKg} kg pack · ${money(productPrice(product, item.weightKg))} each</p>${packButtons(product, item.weightKg, "data-line-pack-choice", disabledWeights)}<div class="shop-cart-item-actions"><div class="shop-stepper"><button type="button" data-line-change="-1" aria-label="Decrease ${escapeHtml(product.name)} ${item.weightKg} kg quantity">−</button><span aria-live="polite">${item.quantity}</span><button type="button" data-line-change="1" aria-label="Increase ${escapeHtml(product.name)} ${item.weightKg} kg quantity">+</button></div><button class="shop-remove" type="button" data-remove-line>Remove</button></div></div><strong class="shop-cart-line-total">${money(productPrice(product, item.weightKg, item.quantity))}</strong></article>`;
    }).join("") : '<div class="shop-cart-empty"><h3>Your cart is waiting.</h3><p>Add something thoughtful from the collection.</p></div>') + recommendationsMarkup();
    drawer.querySelector("[data-cart-checkout]").disabled = !cart.length;
  }

  function setPageLocked(locked) {
    document.body.classList.toggle("shop-cart-open", locked);
    document.documentElement.classList.toggle("shop-cart-open", locked);
    [document.querySelector("main"), document.querySelector("[data-site-header]"), document.querySelector("[data-site-footer]"), document.querySelector(".whatsapp-float")].filter(Boolean).forEach(node => {
      if (locked) { node.dataset.shopPreviousInert = node.inert ? "1" : "0"; node.inert = true; }
      else if (node.dataset.shopPreviousInert !== undefined) { node.inert = node.dataset.shopPreviousInert === "1"; delete node.dataset.shopPreviousInert; }
    });
  }

  function openCart(returnTarget) {
    lastFocus = returnTarget || document.activeElement;
    drawer.inert = false;
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    setPageLocked(true);
    drawer.querySelector("[data-cart-close]").focus();
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    backdrop.hidden = true;
    setPageLocked(false);
    if (lastFocus?.isConnected) lastFocus.focus();
  }

  function setQuickviewImage(index) {
    if (!activeProduct) return;
    const images = activeImages;
    activeImage = (index + images.length) % images.length;
    const main = quickview.querySelector("[data-quickview-main]");
    if (main) { main.src = imageUrl(images[activeImage]); main.alt = activeProduct.imageAlt || `${activeProduct.name}, product image ${activeImage + 1}`; }
    quickview.querySelectorAll("[data-gallery-index]").forEach((button, i) => {
      button.classList.toggle("is-active", i === activeImage);
      button.setAttribute("aria-pressed", String(i === activeImage));
    });
  }

  function showQuickview(id) {
    activeProduct = products.find(p => p.id === id);
    if (!activeProduct) return;
    lastFocus = document.activeElement;
    activeImage = 0;
    activeImages = imagesForPack(activeProduct, 1);
    const images = activeImages;
    const alt = activeProduct.imageAlt || `${activeProduct.name} packaging`;
    quickview.querySelector("[data-quickview-content]").innerHTML = `<div class="quickview-gallery"><div class="quickview-main-image"><img data-quickview-main src="${imageUrl(images[0])}" alt="${escapeHtml(alt)}"><button class="quickview-arrow quickview-prev" type="button" data-gallery-prev aria-label="Previous product image" ${images.length < 2 ? "hidden" : ""}>‹</button><button class="quickview-arrow quickview-next" type="button" data-gallery-next aria-label="Next product image" ${images.length < 2 ? "hidden" : ""}>›</button></div><div class="quickview-thumbnails" ${images.length < 2 ? "hidden" : ""}>${images.map((path, i) => `<button type="button" data-gallery-index="${i}" aria-label="Show product image ${i + 1}" aria-pressed="${i === 0}" class="${i === 0 ? "is-active" : ""}"><img src="${imageUrl(path)}" alt=""></button>`).join("")}</div></div><div class="quickview-copy"><p class="eyebrow">${escapeHtml(activeProduct.label || "Vraj Naturals")}</p><h2 id="quickview-title">${escapeHtml(activeProduct.name)}</h2><p class="quickview-description">${escapeHtml(activeProduct.description || "")}</p><p class="quickview-price" data-quickview-price>${money(activeProduct.regularPricePerKg)} per kg</p><div class="quickview-controls"><div class="quickview-pack-control"><span>Pack size</span>${packButtons(activeProduct)}</div>${quantityControl(activeProduct, 1)}</div><p class="quickview-total" data-quickview-total>Total ${money(activeProduct.regularPricePerKg)}</p><button class="button button-primary quickview-add" type="button" data-quickview-add>Add to cart <span aria-hidden="true">+</span></button></div>`;
    setQuickviewImage(0);
    quickview.showModal();
    quickview.querySelector("[data-quickview-close]").focus();
    clearInterval(slideTimer);
    if (images.length > 1) slideTimer = setInterval(() => { if (quickview.open) setQuickviewImage(activeImage + 1); }, 4200);
  }

  function closeQuickview() {
    clearInterval(slideTimer);
    if (quickview.open) quickview.close();
    activeProduct = null;
  }

  function updateQuickviewPrice() {
    if (!activeProduct) return;
    const kg = Number(quickview.querySelector('[data-pack-choice][aria-pressed="true"]').dataset.packChoice);
    const quantity = clampQuantity(quickview.querySelector("[data-quantity]"));
    quickview.querySelector("[data-quickview-price]").textContent = `${money(activeProduct.regularPricePerKg)} per kg`;
    quickview.querySelector("[data-quickview-total]").textContent = `Total ${money(productPrice(activeProduct, kg, quantity))}`;
  }

  function updateQuickviewGallery() {
    if (!activeProduct) return;
    const kg = Number(quickview.querySelector('[data-pack-choice][aria-pressed="true"]').dataset.packChoice);
    activeImages = imagesForPack(activeProduct, kg);
    const thumbnails = quickview.querySelector(".quickview-thumbnails");
    thumbnails.innerHTML = activeImages.map((path, i) => `<button type="button" data-gallery-index="${i}" aria-label="Show product image ${i + 1}" aria-pressed="${i === 0}" class="${i === 0 ? "is-active" : ""}"><img src="${imageUrl(path)}" alt=""></button>`).join("");
    thumbnails.hidden = activeImages.length < 2;
    quickview.querySelector("[data-gallery-prev]").hidden = activeImages.length < 2;
    quickview.querySelector("[data-gallery-next]").hidden = activeImages.length < 2;
    setQuickviewImage(0);
  }

  function focusTrap(event, container) {
    if (event.key !== "Tab") return;
    const focusable = [...container.querySelectorAll('button:not([disabled]):not([hidden]), select:not([disabled]), input:not([disabled]), a[href]')].filter(node => node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.addEventListener("click", event => {
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      filter = filterButton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(button => { const active = button === filterButton; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
      drawProducts();
      return;
    }
    if (event.target.closest("[data-cart-open]")) { openCart(); return; }
    if (event.target.closest("[data-cart-close], [data-cart-continue]") || event.target === backdrop) { closeCart(); return; }
    const quickButton = event.target.closest("[data-quickview-open]");
    if (quickButton) { showQuickview(quickButton.dataset.quickviewOpen); return; }
    if (event.target.closest("[data-quickview-close]")) { closeQuickview(); return; }
    if (event.target.closest("[data-gallery-prev]")) { setQuickviewImage(activeImage - 1); return; }
    if (event.target.closest("[data-gallery-next]")) { setQuickviewImage(activeImage + 1); return; }
    const thumb = event.target.closest("[data-gallery-index]");
    if (thumb) { setQuickviewImage(Number(thumb.dataset.galleryIndex)); return; }
    const packChoice = event.target.closest("[data-pack-choice]");
    if (packChoice) {
      packChoice.closest(".pack-size-picker").querySelectorAll("[data-pack-choice]").forEach(button => { const selected = button === packChoice; button.classList.toggle("is-active", selected); button.setAttribute("aria-pressed", String(selected)); });
      updateQuickviewPrice();
      updateQuickviewGallery();
      return;
    }
    const linePackChoice = event.target.closest("[data-line-pack-choice]");
    if (linePackChoice) {
      const index = Number(linePackChoice.closest("[data-cart-index]").dataset.cartIndex);
      const item = cart[index];
      const weightKg = Number(linePackChoice.dataset.linePackChoice);
      if (!item || !packsOptions.includes(weightKg)) return;
      const duplicate = cart.findIndex((entry, i) => i !== index && entry.id === item.id && entry.weightKg === weightKg);
      if (duplicate >= 0) {
        if (cart[duplicate].quantity + item.quantity > 50) return;
        cart[duplicate].quantity += item.quantity;
        cart.splice(index, 1);
      } else item.weightKg = weightKg;
      saveCart(); return;
    }
    const add = event.target.closest("[data-add-product]");
    if (add) { showQuickview(add.dataset.addProduct); return; }
    const recommendation = event.target.closest("[data-recommend-add]");
    if (recommendation) { addProduct(recommendation.dataset.recommendAdd, 1, 1); return; }
    if (event.target.closest("[data-quickview-add]")) { addProduct(activeProduct.id, quickview.querySelector('[data-pack-choice][aria-pressed="true"]').dataset.packChoice, clampQuantity(quickview.querySelector("[data-quantity]"))); return; }
    const qtyButton = event.target.closest("[data-quantity-change]");
    if (qtyButton) { const wrapper = qtyButton.closest(".shop-stepper"); const input = wrapper.querySelector("[data-quantity]"); input.value = Math.max(1, Math.min(50, Number(input.value || 1) + Number(qtyButton.dataset.quantityChange))); input.dispatchEvent(new Event("input", { bubbles: true })); return; }
    const change = event.target.closest("[data-line-change]");
    if (change) {
      const index = Number(change.closest("[data-cart-index]").dataset.cartIndex);
      cart[index].quantity = Math.max(0, Math.min(50, cart[index].quantity + Number(change.dataset.lineChange)));
      if (!cart[index].quantity) cart.splice(index, 1);
      saveCart(); return;
    }
    const remove = event.target.closest("[data-remove-line]");
    if (remove) { cart.splice(Number(remove.closest("[data-cart-index]").dataset.cartIndex), 1); saveCart(); return; }
    if (event.target.closest("[data-cart-checkout]")) {
      if (!cart.length) return;
      try { sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(cart.map(item => ({ id: item.id, weightKg: item.weightKg, packs: item.quantity })))); }
      catch (_) { /* The checkout URL still works when session storage is blocked for a single line. */ }
      if (cart.length === 1) location.href = `/checkout.html?item=${encodeURIComponent(cart[0].id)}&kg=${cart[0].weightKg}&packs=${cart[0].quantity}`;
      else location.href = "/checkout.html";
    }
  });

  document.addEventListener("change", event => {
    if (event.target.matches("[data-sort-products]")) { sort = event.target.value; drawProducts(); }
    else if (event.target.matches("[data-quantity]")) {
      if (quickview.contains(event.target)) updateQuickviewPrice();
    }
  });
  document.addEventListener("input", event => {
    if (!event.target.matches("[data-quantity]")) return;
    if (quickview.contains(event.target)) updateQuickviewPrice();
  });
  document.addEventListener("keydown", event => {
    if (drawer.classList.contains("is-open")) {
      if (event.key === "Escape") { event.preventDefault(); closeCart(); }
      else focusTrap(event, drawer);
    }
  });
  drawer.addEventListener("keydown", event => focusTrap(event, drawer));
  quickview.addEventListener("keydown", event => focusTrap(event, quickview));
  quickview.addEventListener("close", () => clearInterval(slideTimer));
  quickview.addEventListener("click", event => { if (event.target === quickview) closeQuickview(); });
  document.querySelector("#sort-products")?.addEventListener("change", event => { sort = event.target.value; drawProducts(); });

  function updateViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--shop-viewport-height", `${height}px`);
  }
  window.visualViewport?.addEventListener("resize", updateViewportHeight);
  window.addEventListener("resize", updateViewportHeight);
  updateViewportHeight();

  fetch("/products.json", { cache: "no-cache" }).then(response => {
    if (!response.ok) throw new Error("Catalogue unavailable");
    return response.json();
  }).then(catalogue => {
    products = Array.isArray(catalogue.products) ? catalogue.products : [];
    packsOptions = Array.isArray(catalogue.packOptionsKg) ? catalogue.packOptionsKg.filter(kg => [1, 2, 5, 10].includes(kg)) : [1, 2, 5, 10];
    const sortControl = document.querySelector("#sort-products");
    if (sortControl) sort = sortControl.value;
    document.querySelectorAll("[data-filter]").forEach(button => { const active = button.dataset.filter === filter; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
    if (!["all", "food", "handicrafts"].includes(filter)) filter = "all";
    drawProducts();
    renderCart();
  }).catch(() => { if (form) form.innerHTML = '<p class="muted">We could not load the collection. Please refresh and try again.</p>'; });
})();
