(() => {
  "use strict";

  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));

  const articleDate = value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    }).format(date);
  };

  const imageUrl = path => `/images/${String(path).split("/").map(encodeURIComponent).join("/")}`;

  function articleCard(article) {
    return `<article class="journal-card">
      <a class="journal-card-image" href="${escapeHtml(article.url)}" tabindex="-1" aria-hidden="true">
        <img src="${imageUrl(article.image)}" alt="" loading="lazy">
      </a>
      <div class="journal-card-content">
        <div class="journal-card-meta"><span>${escapeHtml(article.category)}</span><time datetime="${escapeHtml(article.date)}">${escapeHtml(articleDate(article.date))}</time></div>
        <h3><a href="${escapeHtml(article.url)}">${escapeHtml(article.title)}</a></h3>
        <p>${escapeHtml(article.excerpt)}</p>
        <a class="journal-read-more" href="${escapeHtml(article.url)}">Read more <span aria-hidden="true">↗</span></a>
      </div>
    </article>`;
  }

  function featuredCard(article) {
    return `<article class="journal-featured-card">
      <a class="journal-featured-image" href="${escapeHtml(article.url)}" tabindex="-1" aria-hidden="true"><img src="${imageUrl(article.image)}" alt="" loading="lazy"></a>
      <div class="journal-featured-copy">
        <p class="eyebrow">${escapeHtml(article.category)} · FEATURED</p>
        <h3>${escapeHtml(article.title)}</h3>
        <p class="journal-byline">${escapeHtml(articleDate(article.date))} <span aria-hidden="true">·</span> ${escapeHtml(article.author)}</p>
        <p>${escapeHtml(article.excerpt)}</p>
        <a class="button button-primary" href="${escapeHtml(article.url)}">Read the article <span aria-hidden="true">↗</span></a>
      </div>
    </article>`;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const featuredSection = document.querySelector(".journal-featured-section");
    const featuredTarget = document.querySelector("[data-featured-article]");
    const filtersTarget = document.querySelector("[data-blog-filters]");
    const grid = document.querySelector("[data-blog-grid]");
    const status = document.querySelector("[data-blog-status]");
    if (!featuredTarget || !filtersTarget || !grid || !status) return;

    try {
      const response = await fetch("/data/blogs.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Could not load the journal index.");
      const data = await response.json();
      const articles = (Array.isArray(data.articles) ? data.articles : [])
        .filter(article => article && article.title && article.url && article.date)
        .sort((first, second) => new Date(second.date) - new Date(first.date));
      if (!articles.length) throw new Error("There are no journal articles to display yet.");

      const featured = articles.find(article => article.featured) || articles[0];
      const categories = [...new Set(articles.map(article => article.category).filter(Boolean))];
      featuredTarget.innerHTML = featuredCard(featured);
      filtersTarget.innerHTML = ["All articles", ...categories].map((category, index) =>
        `<button class="journal-filter${index === 0 ? " is-active" : ""}" type="button" data-blog-category="${index === 0 ? "all" : escapeHtml(category)}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`
      ).join("");

      const renderArticles = category => {
        const allArticles = category === "all";
        const visible = articles.filter(article => allArticles
          ? article.id !== featured.id
          : article.category === category);
        featuredSection.hidden = !allArticles;
        grid.innerHTML = visible.map(articleCard).join("");
        status.textContent = `${visible.length + (allArticles ? 1 : 0)} article${visible.length + (allArticles ? 1 : 0) === 1 ? "" : "s"} shown`;
      };

      filtersTarget.addEventListener("click", event => {
        const button = event.target.closest("[data-blog-category]");
        if (!button) return;
        filtersTarget.querySelectorAll("[data-blog-category]").forEach(filter => {
          const active = filter === button;
          filter.classList.toggle("is-active", active);
          filter.setAttribute("aria-pressed", String(active));
        });
        renderArticles(button.dataset.blogCategory);
      });

      renderArticles("all");
    } catch (error) {
      status.textContent = "The journal could not be loaded. Please refresh the page to try again.";
      console.error(error);
    }
  });
})();
