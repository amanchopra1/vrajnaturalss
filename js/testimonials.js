/* Homepage customer testimonials, loaded from data/testimonials.json. */
(() => {
  "use strict";

  const root = document.querySelector("[data-testimonials-root]");
  if (!root) return;

  const carousel = root.querySelector("[data-testimonials-carousel]");
  const stage = root.querySelector("[data-testimonials-stage]");
  const controls = root.querySelector("[data-testimonials-controls]");
  const previous = root.querySelector("[data-testimonials-prev]");
  const next = root.querySelector("[data-testimonials-next]");
  const pagination = root.querySelector("[data-testimonials-pagination]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const AUTOPLAY_DELAY = 7000;

  let testimonials = [];
  let groups = [];
  let currentGroup = 0;
  let timer = 0;
  let hovered = false;
  let focused = false;
  let currentColumns = 0;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function columnsForViewport() {
    if (window.innerWidth < 640) return 1;
    if (window.innerWidth < 1024) return 2;
    return 3;
  }

  function makeCard(testimonial) {
    return `<article class="testimonial-card">
      <span class="testimonial-quote-mark" aria-hidden="true">“</span>
      <blockquote>${escapeHtml(testimonial.quote)}</blockquote>
      <div class="testimonial-byline">
        <p class="testimonial-name">${escapeHtml(testimonial.name)}</p>
        <p class="testimonial-location">${escapeHtml(testimonial.location)}</p>
      </div>
    </article>`;
  }

  function updateStageHeight() {
    const heights = [...stage.children].map(slide => slide.scrollHeight);
    const height = Math.max(0, ...heights);
    if (height) stage.style.height = `${height}px`;
  }

  function updateControls() {
    const showControls = groups.length > 1;
    controls.hidden = !showControls;
    if (!showControls) {
      pagination.replaceChildren();
      return;
    }

    pagination.innerHTML = groups.map((_, index) => `<button class="testimonial-dot" type="button" data-testimonial-index="${index}" aria-label="Show testimonial group ${index + 1} of ${groups.length}" aria-current="${index === currentGroup ? "true" : "false"}"></button>`).join("");
  }

  function showGroup(index) {
    if (!groups.length) return;
    currentGroup = (index + groups.length) % groups.length;
    [...stage.children].forEach((slide, slideIndex) => {
      const active = slideIndex === currentGroup;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
    });
    pagination.querySelectorAll("[data-testimonial-index]").forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", String(dotIndex === currentGroup));
    });
    updateStageHeight();
  }

  function buildGroups() {
    const activeId = groups[currentGroup]?.[0]?.id;
    const columns = columnsForViewport();
    currentColumns = columns;
    groups = [];
    for (let index = 0; index < testimonials.length; index += columns) {
      groups.push(testimonials.slice(index, index + columns));
    }
    currentGroup = activeId
      ? Math.max(0, groups.findIndex(group => group.some(item => item.id === activeId)))
      : 0;

    stage.style.setProperty("--testimonial-columns", String(columns));
    stage.innerHTML = groups.map((group, index) => `<div class="testimonial-slide${index === currentGroup ? " is-active" : ""}" role="group" aria-roledescription="slide" aria-label="${index + 1} of ${groups.length}" aria-hidden="${index !== currentGroup}"${index !== currentGroup ? " inert" : ""}>${group.map(makeCard).join("")}</div>`).join("");
    updateControls();
    showGroup(currentGroup);
  }

  function stopAutoplay() {
    window.clearInterval(timer);
    timer = 0;
  }

  function startAutoplay() {
    stopAutoplay();
    if (groups.length < 2 || reducedMotion.matches || document.hidden || hovered || focused) return;
    timer = window.setInterval(() => showGroup(currentGroup + 1), AUTOPLAY_DELAY);
  }

  async function loadTestimonials() {
    try {
      const response = await fetch(`/data/testimonials.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Testimonials request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Testimonials data must be a JSON array");
      testimonials = data.filter(item => item && item.active === true
        && typeof item.id === "string"
        && typeof item.name === "string"
        && typeof item.location === "string"
        && typeof item.quote === "string"
        && item.quote.trim());
      if (!testimonials.length) return;

      buildGroups();
      root.hidden = false;
      requestAnimationFrame(updateStageHeight);
      startAutoplay();
    } catch (error) {
      // Keep the rest of the homepage available if this optional section cannot load.
      console.error("Vraj Naturals testimonials could not be loaded.", error);
      root.hidden = true;
    }
  }

  previous.addEventListener("click", () => { showGroup(currentGroup - 1); startAutoplay(); });
  next.addEventListener("click", () => { showGroup(currentGroup + 1); startAutoplay(); });
  pagination.addEventListener("click", event => {
    const button = event.target.closest("[data-testimonial-index]");
    if (!button) return;
    showGroup(Number(button.dataset.testimonialIndex));
    startAutoplay();
  });

  carousel.addEventListener("mouseenter", () => { hovered = true; stopAutoplay(); });
  carousel.addEventListener("mouseleave", () => { hovered = false; startAutoplay(); });
  carousel.addEventListener("focusin", () => { focused = true; stopAutoplay(); });
  carousel.addEventListener("focusout", event => {
    if (!carousel.contains(event.relatedTarget)) {
      focused = false;
      startAutoplay();
    }
  });
  document.addEventListener("visibilitychange", () => document.hidden ? stopAutoplay() : startAutoplay());
  reducedMotion.addEventListener?.("change", startAutoplay);

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      if (columnsForViewport() !== currentColumns) {
        buildGroups();
        startAutoplay();
      } else {
        updateStageHeight();
      }
    });
  }, { passive: true });

  loadTestimonials();
})();
