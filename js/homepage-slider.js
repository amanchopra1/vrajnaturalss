(() => {
  "use strict";

  const carousel = document.querySelector("[data-home-carousel]");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll("[data-home-slide]")];
  const dots = [...carousel.querySelectorAll("[data-home-slide-to]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (slides.length < 2) return;

  let activeIndex = slides.findIndex(slide => slide.classList.contains("is-active"));
  let timer = 0;
  let userPaused = false;

  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === activeIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    dots.forEach((dot, i) => {
      const active = i === activeIndex;
      dot.classList.toggle("is-active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function stopAutoplay() {
    window.clearInterval(timer);
    timer = 0;
  }

  function startAutoplay() {
    stopAutoplay();
    if (userPaused || reducedMotion.matches || document.hidden || carousel.matches(":hover, :focus-within")) return;
    timer = window.setInterval(() => showSlide(activeIndex + 1), 5500);
  }

  carousel.addEventListener("click", event => {
    const toggle = event.target.closest("[data-home-toggle]");
    if (toggle) {
      userPaused = !userPaused;
      toggle.setAttribute("aria-pressed", String(userPaused));
      toggle.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
      if (userPaused) stopAutoplay(); else startAutoplay();
      return;
    }
    const dot = event.target.closest("[data-home-slide-to]");
    if (dot) showSlide(Number(dot.dataset.homeSlideTo));
    else if (event.target.closest("[data-home-prev]")) showSlide(activeIndex - 1);
    else if (event.target.closest("[data-home-next]")) showSlide(activeIndex + 1);
    else return;
    startAutoplay();
  });

  carousel.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); showSlide(activeIndex - 1); startAutoplay(); }
    if (event.key === "ArrowRight") { event.preventDefault(); showSlide(activeIndex + 1); startAutoplay(); }
  });
  carousel.addEventListener("mouseenter", stopAutoplay);
  carousel.addEventListener("mouseleave", startAutoplay);
  carousel.addEventListener("focusin", stopAutoplay);
  carousel.addEventListener("focusout", event => { if (!carousel.contains(event.relatedTarget)) startAutoplay(); });
  document.addEventListener("visibilitychange", startAutoplay);
  reducedMotion.addEventListener?.("change", startAutoplay);

  if (activeIndex < 0) showSlide(0);
  startAutoplay();
})();
