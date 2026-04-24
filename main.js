const dataUrl = "./data/report-data.json";
const authStorageKey = "automoto-report-auth";
const authStorage = window.localStorage;
const defaultPasswords = {
  admin: "Epi123!",
  viewer: ["GAreport997!", "IAB227!"]
};

const formatNumber = new Intl.NumberFormat("sl-SI", {
  maximumFractionDigits: 1
});
const formatColors = ["#e6542a", "#78bce8", "#58b87a"];
const themeColors = ["#58b87a", "#ffc857", "#eaa0a0"];
const commentSentiments = new Set(["positive", "neutral", "negative"]);
const brandLogos = [
  {
    aliases: ["ga adriatic"],
    src: "./assets/content/GA-logo.png",
    alt: "GA Adriatic logo",
    background: "light",
    scale: 1.9
  },
  {
    aliases: ["vw", "volkswagen"],
    src: "./assets/content/VW-logo.png",
    alt: "VW logo",
    background: "light"
  },
  {
    aliases: ["toyota", "toyota slovenija"],
    src: "./assets/content/Toyota-logo.png",
    alt: "Toyota logo",
    background: "light"
  },
  {
    aliases: ["peugeot", "peugeot slovenija"],
    src: "./assets/content/Peugeot-logo.png",
    alt: "Peugeot logo",
    background: "dark"
  },
  {
    aliases: ["skoda", "skoda slovenija", "škoda", "škoda slovenija"],
    src: "./assets/content/skoda-logo.png",
    alt: "Skoda logo",
    background: "light"
  },
  {
    aliases: ["renault", "renault slovenija"],
    src: "./assets/content/renault-logo.png",
    alt: "Renault logo",
    background: "light"
  },
  {
    aliases: ["dacia", "dacia slovenija"],
    src: "./assets/content/Dacia-logo.png",
    alt: "Dacia logo",
    background: "light"
  },
  {
    aliases: ["alpine", "alpine cars", "alpine slovenija"],
    src: "./assets/content/Alpine-Cars-Logo.png",
    alt: "Alpine logo",
    background: "light"
  }
];
const brandLogoImageCache = new Map();

const state = {
  data: null,
  auth: null,
  activePeriodId: null,
  activeTab: "overview",
  comparison: {
    enabled: false,
    brandName: ""
  },
  typeChart: null,
  heroMiniChart: null,
  brandFormatChart: null,
  brandThemeChart: null,
  competitorChart: null,
  competitorImpressionsChart: null,
  competitorInfluencerChart: null
};

let currentTabRoutes = new Map();

const nodes = {
  body: document.body,
  authGate: document.querySelector("#authGate"),
  authForm: document.querySelector("#authForm"),
  passwordInput: document.querySelector("#passwordInput"),
  authError: document.querySelector("#authError"),
  reportShell: document.querySelector("#reportShell"),
  accessBadge: document.querySelector("#accessBadge"),
  compareControls: document.querySelector("#compareControls"),
  compareToggle: document.querySelector("#compareToggle"),
  compareBrandSelect: document.querySelector("#compareBrandSelect"),
  shareButton: document.querySelector("#shareButton"),
  logoutButton: document.querySelector("#logoutButton"),
  periodSelect: document.querySelector("#periodSelect"),
  fileInput: document.querySelector("#fileInput"),
  reportTabs: document.querySelector("#reportTabs"),
  panels: document.querySelectorAll(".tab-panel"),
  clientLabel: document.querySelector("#clientLabel"),
  reportTitle: document.querySelector("#reportTitle"),
  periodSummary: document.querySelector("#periodSummary"),
  periodLabel: document.querySelector("#periodLabel"),
  marketLabel: document.querySelector("#marketLabel"),
  brandLabel: document.querySelector("#brandLabel"),
  contentCount: document.querySelector("#contentCount"),
  kpis: document.querySelector("#kpis"),
  highlights: document.querySelector("#highlights"),
  chartFootnote: document.querySelector("#chartFootnote"),
  brandList: document.querySelector("#brandList"),
  brandPanel: document.querySelector("#brandPanel"),
  competitorMap: document.querySelector("#competitorMap"),
  competitorChart: document.querySelector("#competitorChart"),
  competitorImpressionsMap: document.querySelector("#competitorImpressionsMap"),
  competitorImpressionsChart: document.querySelector("#competitorImpressionsChart"),
  competitorInfluencerMap: document.querySelector("#competitorInfluencerMap"),
  competitorInfluencerChart: document.querySelector("#competitorInfluencerChart"),
  competitorPostsTable: document.querySelector("#competitorPostsTable"),
  competitorInfluencerTable: document.querySelector("#competitorInfluencerTable"),
  typeChart: document.querySelector("#typeChart"),
  heroMiniChart: document.querySelector("#heroMiniChart")
};

init();

async function init() {
  nodes.authForm.addEventListener("submit", handleLogin);
  nodes.shareButton.addEventListener("click", handleShareReport);
  nodes.logoutButton.addEventListener("click", handleLogout);
  nodes.compareToggle?.addEventListener("change", handleComparisonToggle);
  nodes.compareBrandSelect?.addEventListener("change", handleComparisonBrandChange);
  restoreStoredAuth();
  await restoreServerAuth();

  nodes.periodSelect?.addEventListener("change", (event) => {
    state.activePeriodId = event.target.value;
    state.activeTab = "overview";
    updatePathForActiveTab();
    render();
  });

  nodes.fileInput?.addEventListener("change", handleFileImport);
  nodes.reportTabs.addEventListener("click", handleTabClick);
  window.addEventListener("popstate", () => {
    applyTabFromPath();
    render();
  });
  window.addEventListener("hashchange", () => {
    applyTabFromPath();
    render();
  });
  renderHeroMiniChart();

  if (state.auth) {
    try {
      await loadReport();
      unlockReport();
      render();
    } catch {
      clearStoredAuth();
      state.auth = null;
      lockReport();
    }
    return;
  }

  lockReport();
}

function getActivePeriod() {
  return state.data.periods.find((period) => period.id === state.activePeriodId) || state.data.periods[0];
}

async function loadReport() {
  if (state.data) return;

  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Report data could not be loaded.");
  }

  state.data = await response.json();
  state.activePeriodId = state.data.activePeriodId || state.data.periods[0]?.id;
}

function restoreStoredAuth() {
  try {
    const storedAuth = JSON.parse(authStorage.getItem(authStorageKey) || "null");
    if (storedAuth?.role === "admin" || storedAuth?.role === "viewer") {
      state.auth = {
        role: storedAuth.role,
        serverBacked: false
      };
    }
  } catch {
    clearStoredAuth();
  }
}

async function restoreServerAuth() {
  try {
    const response = await fetch("./api/session", {
      credentials: "same-origin"
    });
    if (!response.ok) return;

    const auth = await response.json();
    if (auth?.role === "admin" || auth?.role === "viewer") {
      setAuth(auth);
    }
  } catch {
    // Static hosting fallback uses browser storage-based access.
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const password = nodes.passwordInput.value;
  clearAuthError();

  try {
    const auth = await loginWithServer(password);
    if (!auth) {
      showAuthError("Napačno geslo.");
      return;
    }
    setAuth(auth);
  } catch {
    const role = roleForPassword(password);
    if (!role) {
      showAuthError("Napačno geslo.");
      return;
    }
    setAuth({ role, serverBacked: false });
  }

  nodes.passwordInput.value = "";

  try {
    await loadReport();
    unlockReport();
    render();
  } catch {
    showAuthError("Poročila ni bilo mogoče naložiti.");
    state.auth = null;
    clearStoredAuth();
    lockReport();
  }
}

async function loginWithServer(password) {
  const response = await fetch("./api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password })
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Server login failed.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Server login unavailable.");
  }

  return response.json();
}

function roleForPassword(password) {
  if (password === defaultPasswords.admin) return "admin";
  if (defaultPasswords.viewer.includes(password)) return "viewer";
  return null;
}

function setAuth(auth) {
  state.auth = {
    role: auth.role,
    serverBacked: auth.serverBacked !== false
  };
  authStorage.setItem(authStorageKey, JSON.stringify(state.auth));
}

async function handleLogout() {
  state.auth = null;
  state.data = null;
  clearStoredAuth();

  try {
    await fetch("./api/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } catch {
    // Static hosting fallback has no logout endpoint.
  }

  lockReport();
}

async function handleShareReport() {
  const defaultLabel = "Share report";
  nodes.shareButton.disabled = true;
  nodes.shareButton.textContent = "Creating...";

  try {
    const response = await fetch("./api/share-links", {
      method: "POST",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Share link could not be created.");
    }

    const share = await response.json();
    const shareUrl = resolveShareUrl(share);
    shareUrl.hash = window.location.hash;

    await copyText(shareUrl.toString());
    nodes.shareButton.textContent = "Link copied";
    window.setTimeout(() => {
      nodes.shareButton.textContent = defaultLabel;
    }, 2200);
  } catch {
    nodes.shareButton.textContent = "Share unavailable";
    window.setTimeout(() => {
      nodes.shareButton.textContent = defaultLabel;
    }, 2600);
  } finally {
    nodes.shareButton.disabled = false;
  }
}

function resolveShareUrl(share) {
  if (share?.token) {
    return new URL(`share/${share.token}`, getAppBaseUrl());
  }

  if (share?.path) {
    const normalizedPath = String(share.path).replace(/^\/+/, "");
    return new URL(normalizedPath, getAppBaseUrl());
  }

  if (share?.url) {
    return new URL(share.url, window.location.href);
  }

  throw new Error("Share link payload missing.");
}

function getAppBaseUrl() {
  const currentUrl = new URL(window.location.href);
  const pathname = currentUrl.pathname.endsWith("/")
    ? currentUrl.pathname
    : `${currentUrl.pathname.replace(/\/[^/]*$/, "/")}`;

  return new URL(pathname, currentUrl.origin);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function clearStoredAuth() {
  authStorage.removeItem(authStorageKey);
}

function isAdmin() {
  return state.auth?.role === "admin";
}

function unlockReport() {
  nodes.body.classList.remove("is-locked");
  nodes.body.classList.toggle("is-viewer", !isAdmin());
  nodes.reportShell.removeAttribute("aria-hidden");
  nodes.authGate.setAttribute("hidden", "");
  nodes.accessBadge.textContent = isAdmin() ? "Admin mode" : "View only";
  nodes.compareControls?.classList.toggle("is-hidden", !isAdmin());
  nodes.shareButton.classList.toggle("is-hidden", !isAdmin());
  nodes.shareButton.disabled = !isAdmin();
  nodes.fileInput?.closest(".file-button")?.classList.toggle("is-hidden", !isAdmin());
  syncComparisonControls();
}

function lockReport() {
  nodes.body.classList.add("is-locked");
  nodes.body.classList.remove("is-viewer");
  nodes.reportShell.setAttribute("aria-hidden", "true");
  nodes.authGate.removeAttribute("hidden");
  nodes.accessBadge.textContent = "";
  state.comparison.enabled = false;
  state.comparison.brandName = "";
  nodes.compareControls?.classList.add("is-hidden");
  nodes.shareButton.classList.add("is-hidden");
  nodes.shareButton.disabled = true;
  nodes.shareButton.textContent = "Share report";
  nodes.fileInput?.closest(".file-button")?.classList.add("is-hidden");
  syncComparisonControls();
  nodes.passwordInput.focus();
}

function showAuthError(message) {
  nodes.authError.textContent = message;
}

function clearAuthError() {
  nodes.authError.textContent = "";
}

function render() {
  const period = getActivePeriod();
  const brands = getBrands(period);
  const totals = calculateTotals(brands);
  const leaders = calculateLeaders(brands);
  const periodRange = `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`;
  const reviewedBrands = collectReviewedBrands(brands);
  syncTabRoutes(brands);
  applyTabFromPath();
  ensureActiveTab(brands);

  document.title = `${state.data.brand} | ${period.label}`;
  nodes.clientLabel.textContent = state.data.client;
  nodes.reportTitle.textContent = state.data.brand;
  nodes.periodSummary.textContent = period.summary;
  nodes.periodLabel.textContent = periodRange;
  nodes.marketLabel.textContent = period.market || "Market not set";
  nodes.brandLabel.innerHTML = renderBrandLine(reviewedBrands);
  nodes.contentCount.innerHTML = `<strong>${formatNumber.format(totals.posts)}</strong> pieces of content were created.`;
  syncComparisonBrandOptions(brands);
  syncComparisonControls();

  if (nodes.periodSelect) {
    nodes.periodSelect.innerHTML = state.data.periods
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
    nodes.periodSelect.value = period.id;
  }

  nodes.kpis.innerHTML = [
    ["Content", formatNumber.format(totals.posts), "Total posts"],
    ["Impressions", compactNumber(totals.impressions), "Total impressions"],
    ["Likes", compactNumber(totals.likes), "Total likes"],
    ["Comments", compactNumber(totals.comments), "Total comments"]
  ]
    .map(
      ([label, value, description]) => `
        <article class="kpi">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${description}</small>
        </article>
      `
    )
    .join("");

  nodes.highlights.innerHTML = [
    ["Most active brand", leaders.mostActive?.name, `${formatNumber.format(leaders.mostActive?.posts || 0)} posts`],
    ["Brand with the highest ER", leaders.highestEr?.name, `${formatPercent(engagementRate(leaders.highestEr))}%`],
    [
      "Brand with the highest impressions",
      leaders.highestImpressions?.name,
      formatNumber.format(leaders.highestImpressions?.impressions || 0)
    ]
  ]
    .map(renderHighlight)
    .join("");

  nodes.chartFootnote.textContent = `Includes ${formatNumber.format(totals.videoPosts)} video and ${formatNumber.format(
    totals.photoPosts
  )} photo posts in the selected period.`;
  renderTypeChart(totals);

  nodes.brandList.innerHTML = brands
    .map(
      (brand) => `
        <article class="brand-row">
          <div>
            ${renderBrandIdentity(brand.name, { tag: "h3" })}
          </div>
          <dl>
            <div><dt>Posts</dt><dd>${formatNumber.format(toNumber(brand.posts))}</dd></div>
            <div><dt>Impressions</dt><dd>${formatNumber.format(toNumber(brand.impressions))}</dd></div>
            <div><dt>ER</dt><dd>${formatPercent(engagementRate(brand))}%</dd></div>
          </dl>
        </article>
      `
    )
    .join("");

  renderTabs(brands);
  renderBrandPanel(brands);
  renderCompetitorMap(brands);
  renderCompetitorSourceData(brands);
  syncActivePanel();
}

function getBrands(period) {
  return period.brands || period.creators || [];
}

function calculateTotals(brands) {
  return brands.reduce(
    (total, item) => ({
      posts: total.posts + toNumber(item.posts),
      videoPosts: total.videoPosts + toNumber(item.videoPosts || item.reels),
      photoPosts: total.photoPosts + toNumber(item.photoPosts || item.staticPosts || item.posts),
      impressions: total.impressions + toNumber(item.impressions),
      likes: total.likes + toNumber(item.likes),
      comments: total.comments + toNumber(item.comments)
    }),
    {
      posts: 0,
      videoPosts: 0,
      photoPosts: 0,
      impressions: 0,
      likes: 0,
      comments: 0
    }
  );
}

function calculateLeaders(brands) {
  return {
    mostActive: maxBy(brands, (brand) => toNumber(brand.posts)),
    highestEr: maxBy(brands, engagementRate),
    highestImpressions: maxBy(brands, (brand) => toNumber(brand.impressions))
  };
}

function ensureActiveTab(brands) {
  if (!state.activeTab.startsWith("brand:")) return;
  const brandIndex = Number(state.activeTab.split(":")[1]);
  if (!brands[brandIndex]) {
    state.activeTab = "overview";
  }
}

function renderTabs(brands) {
  const tabs = buildTabs(brands);

  nodes.reportTabs.innerHTML = tabs
    .map(
      (tab) => `
        <button class="tab-button${tab.id === state.activeTab ? " is-active" : ""}" type="button" data-tab="${escapeHtml(
        tab.id
      )}" aria-selected="${tab.id === state.activeTab}">
          ${tab.brandName ? renderBrandIdentity(tab.label, { className: "brand-identity--tab" }) : escapeHtml(tab.label)}
        </button>
      `
    )
    .join("");
}

function handleTabClick(event) {
  const button = event.target.closest("[data-tab]");
  if (!button) return;

  state.activeTab = button.dataset.tab;
  updatePathForActiveTab();
  render();
}

function buildTabs(brands) {
  return [
    { id: "overview", label: "Overview" },
    ...brands.map((brand, index) => ({ id: `brand:${index}`, label: brand.name, slug: slugify(brand.name), brandName: brand.name })),
    { id: "competitor", label: "Competitor map" }
  ];
}

function syncTabRoutes(brands) {
  currentTabRoutes = new Map(buildTabs(brands).map((tab) => [tab.slug || tab.id, tab.id]));
}

function syncActivePanel() {
  const activePanel = state.activeTab.startsWith("brand:") ? "brand" : state.activeTab;
  nodes.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === activePanel);
  });

  if (state.activeTab === "overview" && state.typeChart) {
    state.typeChart.resize();
  }

  if (state.activeTab === "competitor") {
    state.competitorChart?.resize();
    state.competitorImpressionsChart?.resize();
    state.competitorInfluencerChart?.resize();
  }
}

function renderBrandPanel(brands) {
  if (!state.activeTab.startsWith("brand:")) return;

  const brand = brands[Number(state.activeTab.split(":")[1])];
  if (!brand) {
    nodes.brandPanel.innerHTML = "";
    return;
  }

  const totalEngagement = toNumber(brand.likes) + toNumber(brand.comments);
  const videoPosts = toNumber(brand.videoPosts || brand.reels);
  const photoPosts = toNumber(brand.photoPosts || brand.staticPosts || brand.posts);
  const report = buildBrandReport(brand, { totalEngagement, videoPosts, photoPosts });
  const comparisonBrand = getComparisonBrand(brands, brand);
  const brandCompare = buildBrandComparison(brand, report, comparisonBrand);

  nodes.brandPanel.innerHTML = `
    <section class="section section--brand-detail" aria-labelledby="brandDetailTitle">
      <div class="brand-detail__intro">
        <p class="eyebrow">Brand report</p>
        <h2 id="brandDetailTitle">${escapeHtml(brand.name)}</h2>
        <p class="summary-note">${escapeHtml(report.summary)}</p>
        ${
          report.contentPreviewUrl
            ? `
              <div class="brand-report__meta">
                <a href="${escapeHtml(report.contentPreviewUrl)}" target="_blank" rel="noreferrer">Content preview</a>
              </div>
            `
            : ""
        }
      </div>

      <div class="brand-detail__metrics">
        ${renderMetric("Posts", formatNumber.format(toNumber(brand.posts)), "Published content", brandCompare.posts)}
        ${renderMetric("Impressions", compactNumber(brand.impressions), "Total reach signal", brandCompare.impressions)}
        ${renderMetric("Engagement", compactNumber(totalEngagement), "Likes and comments", brandCompare.engagement)}
        ${renderMetric("ER", `${formatPercent(engagementRate(brand))}%`, "Engagement rate", brandCompare.engagementRate)}
      </div>

      <div class="brand-report-grid">
        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Content volume and formats</h3>
            <p>Format split for the selected period.</p>
          </div>
          <div class="format-layout">
            ${renderFormatTable(report.formats, brandCompare.formats)}
            <div class="report-chart-stack">
              ${renderChartCanvas("brandFormatChart", "Format split")}
              ${renderLegend(report.formats, { labelKey: "type", colors: formatColors, variant: "compact", showValue: false })}
            </div>
          </div>
        </article>

        <article class="brand-report-block">
          <div>
            <h3>Performance</h3>
            <p>Total value and average value per post.</p>
          </div>
          ${renderPerformanceTable(report.performance, brandCompare.performance)}
        </article>

        <article class="brand-report-block">
          <div>
            <h3>Creator activity</h3>
            <p>${escapeHtml(report.creatorActivity.activeCreators)} creators published ${formatNumber.format(
              toNumber(report.creatorActivity.contentCount)
            )} pieces of content for this brand.</p>
          </div>
          <dl class="creator-list">
            <div><dt>Average content per creator</dt><dd>${renderMetricValueWithComparison(`${escapeHtml(report.creatorActivity.averagePosts)} pieces`, brandCompare.creatorActivity.averagePosts, { compact: true })}</dd></div>
            <div><dt>Average posts per creator</dt><dd>${renderMetricValueWithComparison(`${escapeHtml(report.creatorActivity.averagePostsPerCreator)} posts`, brandCompare.creatorActivity.averagePostsPerCreator, { compact: true })}</dd></div>
            <div>
              <dt>Most active creator</dt>
              <dd>
                ${
                  getCreatorAnalyticsUrl(report.creatorActivity.mostActive.url, report.creatorActivity.mostActive.name)
                    ? `<a href="${escapeHtml(getCreatorAnalyticsUrl(report.creatorActivity.mostActive.url, report.creatorActivity.mostActive.name))}" target="_blank" rel="noreferrer">${escapeHtml(
                        report.creatorActivity.mostActive.name
                      )}</a>`
                    : escapeHtml(report.creatorActivity.mostActive.name)
                }
                <span>${renderMetricValueWithComparison(`${formatNumber.format(toNumber(report.creatorActivity.mostActive.posts))} content`, brandCompare.creatorActivity.mostActivePosts, { compact: true })}</span>
              </dd>
            </div>
          </dl>
        </article>

        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Best performing content</h3>
            <p>Top creative slots by format.</p>
          </div>
          <div class="best-content-grid">
            ${report.bestContent.map((item, index) => renderBestContent(item, Number(state.activeTab.split(":")[1]), index)).join("")}
          </div>
        </article>

        <article class="brand-report-block">
          <div>
            <h3>Promoted models</h3>
            <p>Models or product lines detected in the content set.</p>
          </div>
          ${renderModelTable(report.promotedModels)}
        </article>

        <article class="brand-report-block">
          <div>
            <h3>Content themes</h3>
            <p>Main theme distribution across reviewed posts.</p>
          </div>
          <div class="theme-layout">
            ${renderChartCanvas("brandThemeChart", "Theme split")}
            ${renderLegend(report.themes, { colors: themeColors })}
          </div>
        </article>

        <article class="brand-report-block brand-report-block--wide brand-report-block--community">
          <div>
            <h3>Community feedback analysis</h3>
            <p>Comment volume and sentiment readout for the selected brand.</p>
          </div>
          ${renderCommunityStatus(report.community)}
          ${renderCommunityDetails(report.community)}
        </article>

        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Creator breakdown</h3>
            <p>Publishing mix and performance by creator for this brand.</p>
          </div>
          ${renderCreatorBreakdownTable(report.creatorBreakdown)}
        </article>
      </div>
    </section>
  `;

  renderBrandDoughnutCharts(report);
}

function renderMetric(label, value, description, comparison) {
  return `
    <article class="kpi">
      <span>${escapeHtml(label)}</span>
      <strong class="metric-emphasis">${renderMetricValueWithComparison(escapeHtml(value), comparison, { compact: false })}</strong>
      <small>${escapeHtml(description)}</small>
    </article>
  `;
}

function buildBrandReport(brand, metrics) {
  const report = brand.report || {};
  const posts = toNumber(brand.posts);
  const videoPosts = toNumber(metrics.videoPosts);
  const photoPosts = toNumber(metrics.photoPosts);
  const creatorBreakdown = buildCreatorBreakdown(report);
  const formatFallback = [
    { type: "Video", posts: videoPosts, share: percentShare(videoPosts, posts) },
    { type: "Photo", posts: photoPosts, share: percentShare(photoPosts, posts) }
  ];
  const includedBrands = brand.brandsIncluded || [brand.name];

  return {
    summary:
      report.summary ||
      `${brand.name} published ${formatNumber.format(posts)} pieces of content in the selected period. The tab is structured for the same brand-level readout as the GA Adriatic reference report.`,
    contentPreviewUrl: report.contentPreviewUrl || "",
    formats: report.formats || formatFallback,
    performance:
      report.performance ||
      [
        { metric: "Impressions", total: toNumber(brand.impressions), average: averagePerPost(brand.impressions, posts) },
        { metric: "Likes", total: toNumber(brand.likes), average: averagePerPost(brand.likes, posts) },
        { metric: "Comments", total: toNumber(brand.comments), average: averagePerPost(brand.comments, posts) },
        { metric: "Engagement", total: metrics.totalEngagement, average: averagePerPost(metrics.totalEngagement, posts) },
        { metric: "Engagement rate", total: engagementRate(brand), average: engagementRate(brand), suffix: "%" }
      ],
    creatorActivity: {
      activeCreators: report.creatorActivity?.activeCreators || "Source needed",
      contentCount: report.creatorActivity?.contentCount || brand.posts || 0,
      averagePosts: report.creatorActivity?.averagePosts || "Source needed",
      averagePostsPerCreator:
        report.creatorActivity?.averagePostsPerCreator ??
        calculateAveragePostsPerCreator(creatorBreakdown, report.formats, report.creatorActivity?.activeCreators),
      mostActive: report.creatorActivity?.mostActive || {
        name: "Source needed",
        posts: 0,
        url: ""
      }
    },
    creatorBreakdown,
    bestContent: report.bestContent || [
      { label: "Best performing video", creator: "Source needed", primaryMetric: "-", secondaryMetric: "-", mediaType: "Video" },
      { label: "Best performing photo", creator: "Source needed", primaryMetric: "-", secondaryMetric: "-", mediaType: "Photo" }
    ],
    promotedModels:
      report.promotedModels ||
      includedBrands.map((model) => ({
        model,
        posts: 0,
        impressions: 0
      })),
    themes: report.themes || [
      { name: "Video", share: percentShare(videoPosts, posts) },
      { name: "Photo", share: percentShare(photoPosts, posts) }
    ],
    community: buildCommunityFeedback(report, brand)
  };
}

function calculateAveragePostsPerCreator(rows, formats, activeCreators) {
  const creatorCount = toNumber(activeCreators) || rows.length;
  if (!creatorCount) return "Source needed";

  const breakdownPosts = rows.reduce((sum, row) => sum + toNumber(row.reels) + toNumber(row.photos), 0);
  if (breakdownPosts > 0 || rows.length) return roundToSingleDecimal(breakdownPosts / creatorCount);

  const formatPosts = (Array.isArray(formats) ? formats : []).reduce((sum, item) => {
    const type = String(item.type || item.name || "").toLowerCase();
    if (type === "reel" || type === "reels" || type === "post" || type === "posts" || type === "photo" || type === "photos") {
      return sum + toNumber(item.posts);
    }
    return sum;
  }, 0);

  if (formatPosts > 0) return roundToSingleDecimal(formatPosts / creatorCount);
  return "Source needed";
}

function roundToSingleDecimal(value) {
  return Math.round(value * 10) / 10;
}

function buildCommunityFeedback(report, brand) {
  const community = report.community || {};
  const rawSentiment = community.sentiment ?? report.commentSentiment ?? brand.commentSentiment ?? "";
  const sentiment = normalizeCommentSentiment(rawSentiment);

  return {
    commentsAnalysed:
      community.commentsAnalysed ?? community.commentsAnalyzed ?? report.commentsAnalysed ?? report.commentsAnalyzed ?? brand.comments,
    sentiment,
    sentimentNote: sentiment ? "" : community.sentimentNote || "sentimenta ni mogoče razbrati",
    sentimentSummary: community.sentimentSummary || "",
    positiveExamples: Array.isArray(community.positiveExamples) ? community.positiveExamples : [],
    negativeExamples: Array.isArray(community.negativeExamples) ? community.negativeExamples : [],
    constructiveExamples: Array.isArray(community.constructiveExamples) ? community.constructiveExamples : []
  };
}

function renderFormatTable(formats, comparisons = new Map()) {
  const totalPosts = formats.reduce((sum, item) => sum + toNumber(item.posts), 0);
  return `
    <div class="mini-table">
      <div class="mini-table__head"><span>Content type</span><span>No. of posts</span><span>Share</span></div>
      ${formats
        .map(
          (item) => `
            <div class="mini-table__row">
              <span>${escapeHtml(item.type || item.name)}</span>
              <strong>${renderMetricValueWithComparison(formatNumber.format(toNumber(item.posts)), comparisons.get(normalizeMetricKey(item.type || item.name)))}</strong>
              <span>${formatPercent(item.share ?? percentShare(item.posts, totalPosts))}%</span>
            </div>
          `
        )
        .join("")}
      <div class="mini-table__row mini-table__row--total">
        <span>Total</span>
        <strong>${renderMetricValueWithComparison(formatNumber.format(totalPosts), comparisons.get("total"))}</strong>
        <span>100%</span>
      </div>
    </div>
  `;
}

function buildCreatorBreakdown(report) {
  const rows = report.creatorBreakdown || report.creators || report.profiles;
  if (Array.isArray(rows) && rows.length) return rows;
  return [];
}

function renderCreatorBreakdownTable(rows) {
  return `
    <div class="profile-table">
      <table>
        <thead>
          <tr>
            <th>Creator</th>
            <th>Total posts</th>
            <th>Reels</th>
            <th>Stories</th>
            <th>Photos</th>
            <th>Impressions</th>
            <th>Likes</th>
            <th>Comments</th>
            <th>Engagement</th>
            <th>ER</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows.map(renderCreatorBreakdownRow).join("")
              : `<tr><td class="profile-table__empty" colspan="10">Creator-level source data is needed for this brand.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderCreatorBreakdownRow(row) {
  const engagement =
    row.engagement ??
    (hasMetricValue(row.likes) || hasMetricValue(row.comments) ? toNumber(row.likes) + toNumber(row.comments) : null);
  const er =
    row.engagementRate ??
    row.er ??
    (hasMetricValue(engagement) && toNumber(row.impressions) ? (toNumber(engagement) / toNumber(row.impressions)) * 100 : null);
  const analyticsUrl = getCreatorAnalyticsUrl(row.url, row.name, row.profile);
  const name = analyticsUrl
    ? `<a href="${escapeHtml(analyticsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.name || row.profile || "Source needed")}</a>`
    : escapeHtml(row.name || row.profile || "Source needed");

  return `
    <tr>
      <td>${name}</td>
      <td>${formatOptionalNumber(row.posts ?? row.totalPosts)}</td>
      <td>${formatOptionalNumber(row.reels ?? row.videoPosts)}</td>
      <td>${formatOptionalNumber(row.stories ?? row.storyPosts)}</td>
      <td>${formatOptionalNumber(row.photos ?? row.photoPosts ?? row.staticPosts)}</td>
      <td>${formatOptionalNumber(row.impressions)}</td>
      <td>${formatOptionalNumber(row.likes)}</td>
      <td>${formatOptionalNumber(row.comments)}</td>
      <td>${formatOptionalNumber(engagement)}</td>
      <td>${hasMetricValue(er) ? `${formatPercent(er)}%` : "-"}</td>
    </tr>
  `;
}

function renderPerformanceTable(rows, comparisons = new Map()) {
  return `
    <div class="mini-table mini-table--performance">
      <div class="mini-table__head"><span>Metric</span><span>Total value</span><span>Avg. value per post</span></div>
      ${rows
        .map(
          (row) => `
            <div class="mini-table__row">
              <span>${escapeHtml(row.metric)}</span>
              <strong>${renderMetricValueWithComparison(formatReportValue(row.total, row.suffix), comparisons.get(normalizeMetricKey(row.metric))?.total)}</strong>
              <span>${renderMetricValueWithComparison(formatReportValue(row.average, row.suffix), comparisons.get(normalizeMetricKey(row.metric))?.average)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function handleComparisonToggle(event) {
  const brands = getBrands(getActivePeriod());
  if (event.target.checked && !state.comparison.brandName) {
    state.comparison.brandName = getDefaultComparisonBrandName(brands);
  }
  state.comparison.enabled = Boolean(event.target.checked) && Boolean(state.comparison.brandName);
  syncComparisonControls();
  render();
}

function handleComparisonBrandChange(event) {
  state.comparison.brandName = event.target.value;
  if (!state.comparison.brandName) {
    state.comparison.enabled = false;
  }
  if (nodes.compareToggle) {
    nodes.compareToggle.checked = state.comparison.enabled;
  }
  syncComparisonControls();
  render();
}

function syncComparisonBrandOptions(brands) {
  if (!nodes.compareBrandSelect) return;

  const brandNames = brands.map((brand) => brand.name);
  if (state.comparison.brandName && !brandNames.includes(state.comparison.brandName)) {
    state.comparison.brandName = "";
    state.comparison.enabled = false;
  }

  nodes.compareBrandSelect.innerHTML = `
    <option value="">Select brand</option>
    ${brandNames
      .map((brandName) => `<option value="${escapeHtml(brandName)}">${escapeHtml(brandName)}</option>`)
      .join("")}
  `;
  nodes.compareBrandSelect.value = state.comparison.brandName;
}

function getDefaultComparisonBrandName(brands) {
  const brandNames = brands.map((brand) => brand.name);
  if (brandNames.includes("GA Adriatic")) return "GA Adriatic";
  return brandNames[0] || "";
}

function syncComparisonControls() {
  if (!nodes.compareControls || !nodes.compareToggle || !nodes.compareBrandSelect) return;

  const admin = isAdmin();
  nodes.compareControls.classList.toggle("is-hidden", !admin);
  nodes.compareToggle.checked = admin && state.comparison.enabled;
  nodes.compareBrandSelect.disabled = !admin;
}

function getComparisonBrand(brands, currentBrand) {
  if (!isAdmin() || !state.comparison.enabled || !state.comparison.brandName) return null;
  const comparisonBrand = brands.find((brand) => brand.name === state.comparison.brandName) || null;
  if (!comparisonBrand || comparisonBrand.name === currentBrand.name) return null;
  return comparisonBrand;
}

function buildBrandComparison(brand, report, comparisonBrand) {
  const empty = {
    posts: null,
    impressions: null,
    engagement: null,
    engagementRate: null,
    formats: new Map(),
    performance: new Map(),
    creatorActivity: {
      averagePosts: null,
      averagePostsPerCreator: null,
      mostActivePosts: null
    }
  };
  if (!comparisonBrand) return empty;

  const comparisonMetrics = {
    totalEngagement: toNumber(comparisonBrand.likes) + toNumber(comparisonBrand.comments),
    videoPosts: toNumber(comparisonBrand.videoPosts || comparisonBrand.reels),
    photoPosts: toNumber(comparisonBrand.photoPosts || comparisonBrand.staticPosts || comparisonBrand.posts)
  };
  const comparisonReport = buildBrandReport(comparisonBrand, comparisonMetrics);

  return {
    posts: compareMetricValue(toNumber(brand.posts), toNumber(comparisonBrand.posts)),
    impressions: compareMetricValue(toNumber(brand.impressions), toNumber(comparisonBrand.impressions)),
    engagement: compareMetricValue(
      toNumber(brand.likes) + toNumber(brand.comments),
      comparisonMetrics.totalEngagement
    ),
    engagementRate: compareMetricValue(engagementRate(brand), engagementRate(comparisonBrand)),
    formats: buildFormatComparisons(report.formats, comparisonReport.formats),
    performance: buildPerformanceComparisons(report.performance, comparisonReport.performance),
    creatorActivity: {
      averagePosts: compareMetricValue(report.creatorActivity.averagePosts, comparisonReport.creatorActivity.averagePosts),
      averagePostsPerCreator: compareMetricValue(
        report.creatorActivity.averagePostsPerCreator,
        comparisonReport.creatorActivity.averagePostsPerCreator
      ),
      mostActivePosts: compareMetricValue(
        report.creatorActivity.mostActive?.posts,
        comparisonReport.creatorActivity.mostActive?.posts
      )
    }
  };
}

function buildFormatComparisons(currentFormats = [], comparisonFormats = []) {
  const map = new Map();
  const comparisonByType = new Map(
    comparisonFormats.map((item) => [normalizeMetricKey(item.type || item.name), toNumber(item.posts)])
  );

  currentFormats.forEach((item) => {
    map.set(normalizeMetricKey(item.type || item.name), compareMetricValue(toNumber(item.posts), comparisonByType.get(normalizeMetricKey(item.type || item.name))));
  });

  map.set(
    "total",
    compareMetricValue(
      currentFormats.reduce((sum, item) => sum + toNumber(item.posts), 0),
      comparisonFormats.reduce((sum, item) => sum + toNumber(item.posts), 0)
    )
  );

  return map;
}

function buildPerformanceComparisons(currentRows = [], comparisonRows = []) {
  const map = new Map();
  const comparisonByMetric = new Map(comparisonRows.map((row) => [normalizeMetricKey(row.metric), row]));

  currentRows.forEach((row) => {
    const comparisonRow = comparisonByMetric.get(normalizeMetricKey(row.metric));
    map.set(normalizeMetricKey(row.metric), {
      total: compareMetricValue(row.total, comparisonRow?.total),
      average: compareMetricValue(row.average, comparisonRow?.average)
    });
  });

  return map;
}

function normalizeMetricKey(value) {
  return String(value || "").trim().toLowerCase();
}

function compareMetricValue(currentValue, comparisonValue) {
  if (!hasMetricValue(currentValue) || !hasMetricValue(comparisonValue)) return null;
  const current = toNumber(currentValue);
  const comparison = toNumber(comparisonValue);
  if (!Number.isFinite(current) || !Number.isFinite(comparison) || current === 0) return null;
  const delta = ((comparison - current) / current) * 100;
  if (!Number.isFinite(delta)) return null;
  if (Math.abs(delta) < 0.05) {
    return { tone: "neutral", value: 0 };
  }
  return {
    tone: delta > 0 ? "positive" : "negative",
    value: delta
  };
}

function renderMetricValueWithComparison(value, comparison, options = {}) {
  const compact = options.compact !== false;
  if (!comparison) {
    return `<span class="metric-value-stack${compact ? " metric-value-stack--compact" : ""}"><span class="metric-value-stack__value">${value}</span></span>`;
  }

  return `
    <span class="metric-value-stack${compact ? " metric-value-stack--compact" : ""}">
      <span class="metric-value-stack__value">${value}</span>
      ${renderComparisonBadge(comparison)}
    </span>
  `;
}

function renderComparisonBadge(comparison) {
  const sign = comparison.value > 0 ? "+" : "";
  return `<span class="comparison-pill comparison-pill--${escapeHtml(comparison.tone)}">${sign}${formatRoundedComparisonPercent(comparison.value)}%</span>`;
}

function formatRoundedComparisonPercent(value) {
  return String(Math.round(toNumber(value)));
}

function renderBestContent(item, brandIndex, contentIndex) {
  const mediaLabel = item.mediaType || "Post";
  const extraMetrics = Array.isArray(item.extraMetrics) ? item.extraMetrics.filter((metric) => metric?.label) : [];

  return `
    <div class="content-card" data-brand-index="${escapeHtml(brandIndex)}" data-content-index="${escapeHtml(contentIndex)}">
      <div class="content-card__media">
        ${renderBestContentMedia(item, mediaLabel)}
        <span class="content-card__badge">${escapeHtml(mediaLabel)}</span>
      </div>
      <div>
        <h4>${escapeHtml(item.label)}</h4>
        <p>${escapeHtml(item.creator || "Source needed")}</p>
        <dl>
          <div><dt>${escapeHtml(item.primaryLabel || "Primary")}</dt><dd>${escapeHtml(item.primaryMetric)}</dd></div>
          <div><dt>${escapeHtml(item.secondaryLabel || "Secondary")}</dt><dd>${escapeHtml(item.secondaryMetric)}</dd></div>
          ${extraMetrics
            .map(
              (metric) => `
                <div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value ?? metric.metric ?? "-")}</dd></div>
              `
            )
            .join("")}
        </dl>
      </div>
    </div>
  `;
}

function renderBestContentMedia(item, mediaLabel) {
  if (!item.mediaUrl) return "";
  const url = escapeHtml(item.mediaUrl);
  const alt = escapeHtml(`${mediaLabel} by ${item.creator || "creator"}`);
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(item.mediaUrl);

  if (isVideo) {
    return `<video src="${url}" muted playsinline preload="metadata" controls></video>`;
  }

  return `<img src="${url}" alt="${alt}" loading="lazy">`;
}

function renderCommunityDetails(community = {}) {
  const positiveExamples = Array.isArray(community.positiveExamples) ? community.positiveExamples.slice(0, 5) : [];
  const negativeExamples = Array.isArray(community.negativeExamples) ? community.negativeExamples.slice(0, 5) : [];
  const constructiveExamples = Array.isArray(community.constructiveExamples) ? community.constructiveExamples.slice(0, 5) : [];
  const hasDetails = positiveExamples.length || negativeExamples.length || constructiveExamples.length;
  if (!hasDetails) return "";

  return `
    <div class="community-details">
      ${renderCommentExampleSlot("Positive signals", positiveExamples)}
      ${renderCommentExampleSlot("Negative signals", negativeExamples)}
      ${renderCommentExampleSlot("Constructive questions and feedback", constructiveExamples)}
    </div>
  `;
}

function renderCommunityStatus(community = {}) {
  const hasSentiment = Boolean(community.sentiment);
  const statusLabel = hasSentiment ? community.sentiment : "not available";
  const statusSummary =
    community.sentimentSummary || community.sentimentNote || "No clear sentiment pattern was available for this brand.";

  return `
    <div class="community-status${hasSentiment ? ` community-status--${escapeHtml(community.sentiment)}` : " community-status--unknown"}">
      <div class="community-status__body">
        <span class="community-status__eyebrow">Comment sentiment</span>
        <div class="community-status__headline">
          <span class="community-status__dot" aria-hidden="true"></span>
          <strong>${escapeHtml(statusLabel)}</strong>
        </div>
        <p>${escapeHtml(statusSummary)}</p>
      </div>
    </div>
  `;
}

function renderCommentExampleSlot(title, comments) {
  const modifier = title.toLowerCase().includes("negative")
    ? "comment-examples--negative"
    : title.toLowerCase().includes("constructive")
      ? "comment-examples--constructive"
      : "comment-examples--positive";
  return `
    <div class="comment-examples ${modifier}${comments.length ? "" : " comment-examples--empty"}">
      <h4>${escapeHtml(title)}</h4>
      ${comments.length ? `<div class="comment-example-grid">${comments.map(renderCommentExample).join("")}</div>` : ""}
    </div>
  `;
}

function renderCommentExample(comment) {
  const text = typeof comment === "string" ? comment : comment.text || comment.comment || "";
  const target = typeof comment === "string" ? "" : comment.target || comment.topic || "";

  return `
    <figure class="comment-example-card">
      ${target ? `<figcaption>${escapeHtml(target)}</figcaption>` : ""}
      <blockquote>${escapeHtml(text)}</blockquote>
    </figure>
  `;
}

function ensureBestContent(brand) {
  brand.report = brand.report || {};
  if (Array.isArray(brand.report.bestContent)) return brand.report.bestContent;

  const totalEngagement = toNumber(brand.likes) + toNumber(brand.comments);
  const videoPosts = toNumber(brand.videoPosts || brand.reels);
  const photoPosts = toNumber(brand.photoPosts || brand.staticPosts || brand.posts);
  brand.report.bestContent = buildBrandReport(brand, { totalEngagement, videoPosts, photoPosts }).bestContent;
  return brand.report.bestContent;
}

function renderModelTable(models) {
  return `
    <div class="mini-table-wrap">
      <div class="mini-table">
        <div class="mini-table__head"><span>Model</span><span>No. of posts</span><span>Total impressions</span></div>
        ${models
          .map(
            (item) => `
              <div class="mini-table__row">
                <span>${escapeHtml(item.model)}</span>
                <strong>${formatNumber.format(toNumber(item.posts))}</strong>
                <span>${compactNumber(item.impressions)}</span>
              </div>
            `
          )
          .join("")}
      </div>
      <p class="mini-table-note">* Includes only Reels and feed posts. Story data does not provide enough detail for model attribution.</p>
    </div>
  `;
}

function renderChartCanvas(id, label) {
  return `
    <div class="report-chart-wrap report-chart-wrap--donut" aria-label="${escapeHtml(label)}">
      <canvas id="${escapeHtml(id)}"></canvas>
    </div>
  `;
}

function renderLegend(items, options = {}) {
  const labelKey = options.labelKey || "name";
  const valueKey = options.valueKey || "share";
  const colors = options.colors || [];
  const showValue = options.showValue !== false;
  const className = options.variant === "compact" ? "theme-legend theme-legend--compact" : "theme-legend";
  return `
    <ul class="${className}">
      ${items
        .map(
          (item, index) => `
            <li>
              <span><i style="--legend-color: ${escapeHtml(colors[index % colors.length] || "#b9b2a7")}"></i>${escapeHtml(
                item[labelKey] || item.name || item.type
              )}</span>
              ${showValue ? `<strong>${formatPercent(item[valueKey] ?? item.share)}%</strong>` : ""}
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function buildCompetitorChartData(brands, metricKey) {
  return brands.map((brand, index) => ({
    x: metricKey === "impressions" ? toNumber(brand.impressions) : toNumber(brand.posts),
    y: engagementRate(brand),
    brandIndex: index,
    label: brand.name,
    impressions: toNumber(brand.impressions),
    posts: toNumber(brand.posts)
  }));
}

function updateCompetitorChart(chart, chartData, maxX, maxEr) {
  chart.data.datasets[0].data = chartData;
  chart.options.scales.x.max = maxX;
  chart.options.scales.y.max = maxEr;
  chart.update();
}

function buildInfluencerMatrix(brands) {
  const creatorsByKey = new Map();

  brands.forEach((brand, brandIndex) => {
    const creatorRows = Array.isArray(brand.report?.creatorBreakdown) ? brand.report.creatorBreakdown : [];

    creatorRows.forEach((creator) => {
      const name = String(creator.name || "").trim();
      const username = extractCreatorUsername(creator.url, name);
      const key = username || name.toLowerCase();
      if (!key) return;

      const posts = toNumber(creator.posts);
      const existing = creatorsByKey.get(key) || {
        key,
        name: name || `@${username}`,
        username,
        url: creator.url || "",
        totalPosts: 0,
        brandPosts: new Map()
      };

      existing.name = existing.name || name || `@${username}`;
      existing.url = existing.url || creator.url || "";
      existing.totalPosts += posts;
      existing.brandPosts.set(brandIndex, toNumber(existing.brandPosts.get(brandIndex)) + posts);
      creatorsByKey.set(key, existing);
    });
  });

  const influencers = [...creatorsByKey.values()]
    .map((entry) => ({
      ...entry,
      brandCount: entry.brandPosts.size
    }))
    .sort((a, b) => b.totalPosts - a.totalPosts || a.name.localeCompare(b.name, "sl"));

  const points = [];

  influencers.forEach((influencer) => {
    influencer.brandPosts.forEach((posts, brandIndex) => {
      if (posts <= 0) return;

      points.push({
        x: brands[brandIndex]?.name || "",
        y: influencer.name,
        r: Math.max(5, Math.min(21, 2 + posts * 0.32)),
        posts,
        brand: brands[brandIndex]?.name || "",
        brandIndex,
        influencer: influencer.name,
        totalPosts: influencer.totalPosts,
        url: influencer.url || ""
      });
    });
  });

  return { influencers, points };
}

function createCompetitorChart(canvas, chartStateKey, chartData, config) {
  window.Chart.getChart?.(canvas)?.destroy();

  return new window.Chart(canvas, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Brands",
          data: chartData,
          parsing: false,
          pointBackgroundColor: scatterPointFill,
          pointBorderColor: "rgba(230, 84, 42, 0)",
          pointBorderWidth: 0,
          pointRadius: 6,
          pointHoverBackgroundColor: "#ffc857",
          pointHoverBorderColor: "rgba(230, 84, 42, 0)",
          pointHoverBorderWidth: 0,
          pointHoverRadius: 7.5,
          pointHitRadius: 12
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 650,
        easing: "easeOutQuart"
      },
      onClick: (_event, elements) => {
        const element = elements[0];
        if (!element) return;

        const item = state[chartStateKey].data.datasets[element.datasetIndex].data[element.index];
        state.activeTab = `brand:${item.brandIndex}`;
        updatePathForActiveTab();
        render();
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.raw?.label || "",
            label: (context) => config.tooltipLabels(context.raw)
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: config.maxX,
          title: {
            display: true,
            text: config.xTitle,
            color: "#f4f0e8",
            font: chartFont(12, 800)
          },
          grid: {
            color: "rgba(244, 240, 232, 0.075)",
            drawTicks: false
          },
          border: {
            display: false
          },
          ticks: {
            color: "#b9b2a7",
            font: chartFont(11),
            padding: 10,
            callback: config.xTick || ((value) => compactNumber(value))
          }
        },
        y: {
          min: 0,
          max: config.maxEr,
          title: {
            display: true,
            text: "Higher ER",
            color: "#f4f0e8",
            font: chartFont(12, 800)
          },
          grid: {
            color: "rgba(244, 240, 232, 0.075)",
            drawTicks: false
          },
          border: {
            display: false
          },
          ticks: {
            color: "#b9b2a7",
            font: chartFont(11),
            padding: 10,
            callback: (value) => `${formatPercent(value)}%`
          }
        }
      }
    },
    plugins: [scatterPointShadowPlugin(), scatterLabelPlugin()]
  });
}

function renderCompetitorMap(brands) {
  if (!window.Chart || !nodes.competitorChart || !nodes.competitorImpressionsChart) return;

  const postsChartData = buildCompetitorChartData(brands, "posts");
  const impressionsChartData = buildCompetitorChartData(brands, "impressions");
  const influencerMatrix = buildInfluencerMatrix(brands);
  const maxPosts = Math.max(...postsChartData.map((item) => item.x), 1);
  const maxImpressions = Math.max(...impressionsChartData.map((item) => item.x), 1);
  const maxEr = Math.max(...postsChartData.map((item) => item.y), 1);
  const normalizedMaxEr = Math.ceil(maxEr * 1.18 * 10) / 10;
  const normalizedMaxPosts = Math.ceil(maxPosts * 1.12);
  const normalizedMaxImpressions = Math.ceil(maxImpressions * 1.12);

  if (state.competitorChart) {
    updateCompetitorChart(state.competitorChart, postsChartData, normalizedMaxPosts, normalizedMaxEr);
  } else {
    state.competitorChart = createCompetitorChart(nodes.competitorChart, "competitorChart", postsChartData, {
      maxX: normalizedMaxPosts,
      maxEr: normalizedMaxEr,
      xTitle: "More posts",
      tooltipLabels: (raw) => [
        `Posts: ${compactNumber(raw.posts)}`,
        `ER: ${formatPercent(raw.y)}%`,
        `Impressions: ${compactNumber(raw.impressions)}`
      ]
    });
  }

  if (state.competitorImpressionsChart) {
    updateCompetitorChart(state.competitorImpressionsChart, impressionsChartData, normalizedMaxImpressions, normalizedMaxEr);
  } else {
    state.competitorImpressionsChart = createCompetitorChart(
      nodes.competitorImpressionsChart,
      "competitorImpressionsChart",
      impressionsChartData,
      {
        maxX: normalizedMaxImpressions,
        maxEr: normalizedMaxEr,
        xTitle: "More impressions",
        xTick: (value) => compactNumber(value),
        tooltipLabels: (raw) => [
          `Impressions: ${compactNumber(raw.impressions)}`,
          `ER: ${formatPercent(raw.y)}%`,
          `Posts: ${compactNumber(raw.posts)}`
        ]
      }
    );
  }

  renderCompetitorInfluencerMap(brands, influencerMatrix);
}

function renderCompetitorInfluencerMap(brands, influencerMatrix) {
  if (!window.Chart || !nodes.competitorInfluencerChart || !nodes.competitorInfluencerMap) return;

  const influencers = influencerMatrix?.influencers || [];
  const points = influencerMatrix?.points || [];
  const minHeight = Math.max(420, influencers.length * 30 + 120);
  nodes.competitorInfluencerMap.style.height = `${Math.min(minHeight, 980)}px`;

  if (state.competitorInfluencerChart) {
    updateCompetitorInfluencerChart(state.competitorInfluencerChart, brands, influencers, points);
    return;
  }

  state.competitorInfluencerChart = new window.Chart(nodes.competitorInfluencerChart, {
    type: "bubble",
    data: {
      datasets: [
        {
          label: "Influencer content",
          data: points,
          parsing: false,
          pointRadius: (context) => context.raw?.r || 7,
          pointHoverRadius: (context) => (context.raw?.r || 7) + 1.5,
          backgroundColor: (context) => influencerBubbleFill(context),
          borderColor: (context) => influencerBubbleStroke(context),
          borderWidth: 1.5,
          hoverBorderWidth: 2,
          hoverBackgroundColor: "#ffc857",
          pointHitRadius: 12
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 700,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.raw?.influencer || "",
            label: (context) => {
              const raw = context.raw || {};
              return [`Brand: ${raw.brand}`, `Content: ${formatNumber.format(raw.posts)}`, `Creator total: ${formatNumber.format(raw.totalPosts)}`];
            }
          }
        }
      },
      scales: {
        x: {
          type: "category",
          position: "top",
          labels: brands.map((brand) => brand.name),
          offset: true,
          title: {
            display: true,
            text: "Brand",
            color: "#f4f0e8",
            font: chartFont(12, 800),
            padding: {
              bottom: 18
            }
          },
          grid: {
            color: "rgba(244, 240, 232, 0.075)",
            drawTicks: false
          },
          border: {
            display: false
          },
          ticks: {
            color: "rgba(244, 240, 232, 0)",
            font: chartFont(11, 700),
            maxRotation: 0,
            autoSkip: false,
            padding: 14,
            callback: () => ""
          }
        },
        y: {
          type: "category",
          labels: influencers.map((item) => item.name),
          offset: true,
          title: {
            display: true,
            text: "Influencer",
            color: "#f4f0e8",
            font: chartFont(12, 800)
          },
          grid: {
            color: "rgba(244, 240, 232, 0.06)",
            drawTicks: false
          },
          border: {
            display: false
          },
          ticks: {
            color: "#b9b2a7",
            font: chartFont(11, 600),
            padding: 12,
            autoSkip: false
          }
        }
      }
    },
    plugins: [bubblePointShadowPlugin(), competitorAxisLogoPlugin()]
  });
}

function updateCompetitorInfluencerChart(chart, brands, influencers, points) {
  chart.data.datasets[0].data = points;
  chart.options.scales.x.labels = brands.map((brand) => brand.name);
  chart.options.scales.y.labels = influencers.map((item) => item.name);
  chart.update();
}

function applyTabFromPath() {
  const slug = getCurrentPathSlug();
  if (!slug) {
    state.activeTab = "overview";
    return;
  }

  state.activeTab = currentTabRoutes.get(slug) || state.activeTab;
}

function updatePathForActiveTab() {
  const nextHash = `#${tabToSlug(state.activeTab)}`;
  if (window.location.hash === nextHash) return;

  window.history.pushState({ activeTab: state.activeTab }, "", nextHash);
}

function tabToSlug(tabId) {
  if (tabId.startsWith("brand:")) {
    return [...currentTabRoutes.entries()].find(([, id]) => id === tabId)?.[0] || "overview";
  }

  return tabId;
}

function getCurrentPathSlug() {
  return window.location.hash.replace(/^#+|\/+$/g, "");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBrandKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getBrandLogo(name) {
  const normalized = normalizeBrandKey(name);
  if (!normalized) return null;
  return (
    brandLogos.find((item) => item.aliases.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized))) ||
    null
  );
}

function getBrandLogoImage(name, chart = null) {
  const logo = getBrandLogo(name);
  if (!logo?.src) return null;

  let cached = brandLogoImageCache.get(logo.src);
  if (!cached) {
    const image = new Image();
    cached = { image, loaded: false, failed: false, pendingCharts: new Set() };
    image.addEventListener("load", () => {
      cached.loaded = true;
      cached.pendingCharts.forEach((pendingChart) => pendingChart.draw());
      cached.pendingCharts.clear();
    });
    image.addEventListener("error", () => {
      cached.failed = true;
      cached.pendingCharts.clear();
    });
    image.src = logo.src;
    brandLogoImageCache.set(logo.src, cached);
  }

  if (!cached.loaded && !cached.failed && chart) {
    cached.pendingCharts.add(chart);
  }

  return { ...logo, image: cached.loaded ? cached.image : null };
}

function formatBrandDisplayName(name) {
  const normalized = normalizeBrandKey(name);
  if (normalized === "vw") return "Volkswagen";
  return name || "-";
}

function renderBrandIdentity(name, options = {}) {
  const { tag = "span", className = "", id = "" } = options;
  const logo = getBrandLogo(name);
  const classes = ["brand-identity", className].filter(Boolean).join(" ");
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  const logoBadgeClass =
    logo?.background === "light" ? "brand-identity__logo-badge brand-identity__logo-badge--light" : "brand-identity__logo-badge brand-identity__logo-badge--dark";
  const logoStyle = logo?.scale ? ` style="--brand-logo-scale:${escapeHtml(String(logo.scale))}"` : "";

  return `
    <${tag} class="${classes}"${idAttribute}>
      ${
        logo
          ? `<span class="${logoBadgeClass}"><img class="brand-identity__logo" src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt)}"${logoStyle}></span>`
          : ""
      }
      <span class="brand-identity__text">${escapeHtml(formatBrandDisplayName(name))}</span>
    </${tag}>
  `;
}

function renderBrandLine(brands) {
  return `Brands: ${brands.map((brand) => renderBrandIdentity(brand, { className: "brand-identity--inline" })).join('<span class="brand-line__separator">·</span>')}`;
}

function renderHighlight([label, brand, value]) {
  return `
    <article class="highlight">
      <h3>${escapeHtml(label)}</h3>
      <div>
        ${renderBrandIdentity(brand || "-", { tag: "strong", className: "brand-identity--highlight" })}
        <span>${escapeHtml(value)}</span>
      </div>
    </article>
  `;
}

function renderTypeChart(totals) {
  if (!window.Chart || !nodes.typeChart) return;

  const chartData = [totals.videoPosts, totals.photoPosts];

  if (state.typeChart) {
    state.typeChart.data.datasets[0].data = chartData;
    state.typeChart.update();
    return;
  }

  state.typeChart = new window.Chart(nodes.typeChart, {
    type: "doughnut",
    data: {
      labels: ["Video", "Photo"],
      datasets: [
        {
          data: chartData,
          backgroundColor: ["#e6542a", "#58b87a"],
          borderColor: "#191919",
          borderWidth: 3,
          hoverOffset: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 700,
        easing: "easeOutQuart"
      },
      cutout: "58%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: "#f4f0e8",
            font: {
              size: 12,
              family: "Inter, system-ui, sans-serif"
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${formatNumber.format(context.parsed)}`
          }
        }
      }
    }
  });
}

function renderHeroMiniChart() {
  if (!window.Chart || !nodes.heroMiniChart || state.heroMiniChart) return;

  state.heroMiniChart = new window.Chart(nodes.heroMiniChart, {
    type: "bar",
    data: {
      labels: ["", "", "", "", ""],
      datasets: [
        {
          data: [46, 72, 58, 91, 64],
          backgroundColor: "#58b87a",
          borderRadius: {
            topLeft: 8,
            topRight: 8
          },
          borderSkipped: "bottom",
          barPercentage: 0.72,
          categoryPercentage: 0.82
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 700,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          display: false,
          min: 0,
          max: 100
        }
      }
    }
  });
}

function renderBrandDoughnutCharts(report) {
  const formatCanvas = document.querySelector("#brandFormatChart");
  const themeCanvas = document.querySelector("#brandThemeChart");

  renderDoughnutChart("brandFormatChart", formatCanvas, report.formats, formatColors, {
    labelKey: "type",
    valueKey: "posts",
    tooltipSuffix: " posts"
  });
  renderDoughnutChart("brandThemeChart", themeCanvas, report.themes, themeColors, {
    labelKey: "name",
    valueKey: "share",
    tooltipSuffix: "%"
  });
}

function renderDoughnutChart(stateKey, canvas, items, colors, config) {
  if (!window.Chart || !canvas) return;

  if (state[stateKey]) {
    state[stateKey].destroy();
    state[stateKey] = null;
  }

  const labels = items.map((item) => item[config.labelKey] || item.name || item.type);
  const values = items.map((item) => toNumber(item[config.valueKey]));

  state[stateKey] = new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, index) => colors[index % colors.length]),
          borderColor: "#191919",
          borderWidth: 3,
          hoverOffset: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: {
        duration: 650,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const suffix = config.tooltipSuffix || "";
              const value = suffix === "%" ? formatPercent(context.parsed) : formatNumber.format(context.parsed);
              return `${context.label}: ${value}${suffix}`;
            }
          }
        }
      }
    }
  });
}

function chartFont(size, weight = 600) {
  return {
    size,
    weight,
    family: "Inter, system-ui, sans-serif"
  };
}

function influencerBubbleFill(context) {
  const palette = [
    ["rgba(120, 188, 232, 0.92)", "rgba(47, 111, 255, 0.5)"],
    ["rgba(230, 84, 42, 0.92)", "rgba(159, 45, 34, 0.5)"],
    ["rgba(88, 184, 122, 0.92)", "rgba(41, 115, 77, 0.45)"],
    ["rgba(255, 200, 87, 0.92)", "rgba(184, 114, 18, 0.44)"],
    ["rgba(234, 160, 160, 0.92)", "rgba(148, 59, 88, 0.44)"]
  ];
  const { chart } = context;
  const point = chart.getDatasetMeta(context.datasetIndex)?.data?.[context.dataIndex];
  const raw = context.raw || {};
  const [inner, outer] = palette[(raw.brandIndex || 0) % palette.length];

  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return inner;

  const gradient = chart.ctx.createRadialGradient(point.x - 4, point.y - 4, 1, point.x, point.y, Math.max(raw.r || 8, 10));
  gradient.addColorStop(0, "#fff1c7");
  gradient.addColorStop(0.38, inner);
  gradient.addColorStop(1, outer);
  return gradient;
}

function influencerBubbleStroke(context) {
  const palette = ["#9bd4f7", "#ff8f68", "#75d29b", "#ffd372", "#f2b6b6"];
  return palette[(context.raw?.brandIndex || 0) % palette.length];
}

function scatterPointFill(context) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  const meta = chart.getDatasetMeta(context.datasetIndex);
  const point = meta?.data?.[context.dataIndex];

  if (!chartArea || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return "#e6542a";

  const gradient = ctx.createRadialGradient(point.x - 3, point.y - 4, 1, point.x, point.y, 11);
  gradient.addColorStop(0, "#ffc857");
  gradient.addColorStop(0.42, "#e6542a");
  gradient.addColorStop(1, "#9f2d22");
  return gradient;
}

function scatterPointShadowPlugin() {
  return {
    id: "scatterPointShadowPlugin",
    beforeDatasetDraw(chart, args) {
      if (args.index !== 0) return;

      chart.ctx.save();
      chart.ctx.shadowColor = "rgba(230, 84, 42, 0.92)";
      chart.ctx.shadowBlur = 28;
      chart.ctx.shadowOffsetX = 0;
      chart.ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw(chart, args) {
      if (args.index !== 0) return;

      chart.ctx.restore();
    }
  };
}

function bubblePointShadowPlugin() {
  return {
    id: "bubblePointShadowPlugin",
    beforeDatasetDraw(chart, args) {
      if (args.index !== 0) return;

      chart.ctx.save();
      chart.ctx.shadowColor = "rgba(8, 8, 8, 0.34)";
      chart.ctx.shadowBlur = 24;
      chart.ctx.shadowOffsetX = 0;
      chart.ctx.shadowOffsetY = 10;
    },
    afterDatasetDraw(chart, args) {
      if (args.index !== 0) return;

      chart.ctx.restore();
    }
  };
}

function drawChartBrandBadge(ctx, x, y, size, logo) {
  if (!logo?.image) return;

  const radius = size / 2;
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  if (logo.background === "light") {
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    gradient.addColorStop(1, "rgba(236, 236, 236, 0.96)");
  } else {
    gradient.addColorStop(0, "rgba(38, 38, 38, 0.98)");
    gradient.addColorStop(1, "rgba(20, 20, 20, 0.96)");
  }

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.24)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = gradient;
  ctx.strokeStyle = logo.background === "light" ? "rgba(17, 17, 17, 0.08)" : "rgba(244, 240, 232, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const padding = size * 0.22;
  const availableSize = size - padding * 2;
  const imageWidth = logo.image.naturalWidth || logo.image.width || availableSize;
  const imageHeight = logo.image.naturalHeight || logo.image.height || availableSize;
  const logoScale = logo.scale || 1;
  const scale = Math.min(availableSize / imageWidth, availableSize / imageHeight) * logoScale;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = x + padding + (availableSize - drawWidth) / 2;
  const drawY = y + padding + (availableSize - drawHeight) / 2;

  ctx.drawImage(logo.image, drawX, drawY, drawWidth, drawHeight);
}

function ensureChartHoverTooltip(chart) {
  const container = chart.canvas?.parentElement;
  if (!container) return null;

  let tooltip = container.querySelector(".chart-hover-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-hover-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    container.appendChild(tooltip);
  }

  return tooltip;
}

function hideChartHoverTooltip(chart) {
  const tooltip = ensureChartHoverTooltip(chart);
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.textContent = "";
  tooltip.setAttribute("aria-hidden", "true");
}

function showChartHoverTooltip(chart, text, region) {
  const tooltip = ensureChartHoverTooltip(chart);
  if (!tooltip || !region) return;

  const canvasOffsetLeft = chart.canvas?.offsetLeft || 0;
  const canvasOffsetTop = chart.canvas?.offsetTop || 0;
  tooltip.textContent = formatBrandDisplayName(text);
  tooltip.style.left = `${canvasOffsetLeft + region.x + region.size / 2}px`;
  tooltip.style.top = `${canvasOffsetTop + region.y + 2}px`;
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
}

function competitorAxisLogoPlugin() {
  return {
    id: "competitorAxisLogoPlugin",
    afterDraw(chart) {
      const xScale = chart.scales?.x;
      const labels = xScale?.getLabels?.() || [];
      if (!xScale || !labels.length) return;

      const { ctx } = chart;
      const badgeSize = 30;
      const y = xScale.top + 22;
      const regions = [];

      ctx.save();
      labels.forEach((label, index) => {
        const logo = getBrandLogoImage(label, chart);
        if (!logo?.image) return;

        const centerX = xScale.getPixelForTick(index);
        const x = centerX - badgeSize / 2;
        drawChartBrandBadge(ctx, x, y, badgeSize, logo);
        regions.push({ label, x, y, size: badgeSize });
      });
      ctx.restore();
      chart.$competitorAxisLogoRegions = regions;
    },
    afterEvent(chart, args) {
      const event = args.event;
      const regions = chart.$competitorAxisLogoRegions || [];
      if (!event || !regions.length) {
        hideChartHoverTooltip(chart);
        return;
      }

      const hoveredRegion = regions.find(
        (region) =>
          event.x >= region.x &&
          event.x <= region.x + region.size &&
          event.y >= region.y &&
          event.y <= region.y + region.size
      );

      if (hoveredRegion) {
        chart.canvas.style.cursor = "pointer";
        showChartHoverTooltip(chart, hoveredRegion.label, hoveredRegion);
        return;
      }

      chart.canvas.style.cursor = "";
      hideChartHoverTooltip(chart);
    },
    afterDestroy(chart) {
      chart.canvas.style.cursor = "";
      hideChartHoverTooltip(chart);
      delete chart.$competitorAxisLogoRegions;
    }
  };
}

function scatterLabelPlugin() {
  return {
    id: "scatterLabelPlugin",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      const items = chart.data.datasets[0].data;
      const labelHeight = 24;
      const gapX = 10;
      const gapY = 8;

      ctx.save();
      ctx.font = "800 12px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";

      meta.data.forEach((point, index) => {
        const item = items[index];
        const label = item?.label;
        if (!label) return;

        const prefersAbove = point.y - gapY - labelHeight >= chartArea.top;
        const boxY = prefersAbove
          ? point.y - gapY - labelHeight
          : Math.min(point.y + gapY, chartArea.bottom - labelHeight);
        const logo = getBrandLogoImage(label, chart);

        if (logo?.image) {
          const badgeSize = 28;
          const badgeY = prefersAbove
            ? point.y - gapY - badgeSize
            : Math.min(point.y + gapY, chartArea.bottom - badgeSize);
          const badgeX = Math.min(point.x + gapX, chartArea.right - badgeSize - 4);
          drawChartBrandBadge(ctx, badgeX, badgeY, badgeSize, logo);
        } else {
          const width = ctx.measureText(label).width + 14;
          const boxX = Math.min(point.x + gapX, chartArea.right - width - 4);
          const textX = boxX + 7;
          const textY = boxY + labelHeight / 2;

          ctx.fillStyle = "rgba(17, 17, 17, 0.78)";
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, width, labelHeight, 4);
          ctx.fill();

          ctx.fillStyle = "#f4f0e8";
          ctx.fillText(label, textX, textY);
        }

        // Repaint the point above the label so it never gets hidden by the tag.
        ctx.save();
        ctx.shadowColor = "rgba(230, 84, 42, 0.92)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = scatterPointFill({ chart, raw: item, element: point });
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();
    }
  };
}

function renderCompetitorSourceData(brands) {
  if (!nodes.competitorPostsTable || !nodes.competitorInfluencerTable) return;

  const comparisonBrand = getCompetitorTableComparisonBrand(brands);
  nodes.competitorPostsTable.innerHTML = renderCompetitorMetricTable(brands, buildCompetitorPostMetrics(), comparisonBrand);
  nodes.competitorInfluencerTable.innerHTML = renderCompetitorMetricTable(brands, buildCompetitorInfluencerMetrics(), comparisonBrand);
}

function renderCompetitorMetricTable(brands, metrics, comparisonBrand = null) {
  const sortedBrands = brands.slice().sort((a, b) => toNumber(b.impressions) - toNumber(a.impressions));

  return `
    <thead>
      <tr>
        <th scope="col" class="competitor-table__metric-head">Metric</th>
        ${sortedBrands
          .map(
            (brand) => `
              <th scope="col" class="competitor-table__brand-cell">
                <div class="competitor-table__brand">
                  ${renderBrandIdentity(brand.name, { tag: "strong", className: "brand-identity--table competitor-table__brand-name" })}
                </div>
              </th>
            `
          )
          .join("")}
      </tr>
    </thead>
    <tbody>
      ${metrics
        .map(
          (metric) => `
            <tr>
              <th scope="row">${escapeHtml(metric.label)}</th>
              ${sortedBrands
                .map((brand) => {
                  const value = metric.value(brand);
                  const comparison =
                    comparisonBrand && comparisonBrand.name !== brand.name
                      ? compareMetricValue(value.raw, metric.value(comparisonBrand).raw)
                      : null;
                  return `<td>${renderCompetitorMetricValue(value, comparison)}</td>`;
                })
                .join("")}
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;
}

function renderCompetitorMetricValue(value, comparison = null) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.missing) {
      return `<span class="competitor-table__missing">Source needed</span>`;
    }

    const content = value.html ? value.display : escapeHtml(String(value.display ?? ""));
    if (!comparison) return content;

    return `
      <span class="metric-value-stack metric-value-stack--compact">
        <span class="metric-value-stack__value">${content}</span>
        ${renderComparisonBadge(comparison)}
      </span>
    `;
  }

  if (value === null || value === undefined || value === "" || value === "Source needed") {
    return `<span class="competitor-table__missing">Source needed</span>`;
  }

  if (typeof value === "string" && value.includes("competitor-table__er")) return value;
  return escapeHtml(String(value));
}

function buildCompetitorPostMetrics() {
  return [
    { label: "Total posts", value: (brand) => buildCompetitorValue(formatCompetitorCompact(toNumber(brand.posts)), toNumber(brand.posts)) },
    { label: "Reels & feed posts", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getFeedAndReelPosts(brand)), getFeedAndReelPosts(brand)) },
    { label: "Stories", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getStoryPosts(brand)), getStoryPosts(brand)) },
    { label: "Photos (only reels & feed posts)", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getPhotoPosts(brand)), getPhotoPosts(brand)) },
    { label: "Videos (only reels & feed posts)", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getVideoPosts(brand)), getVideoPosts(brand)) },
    { label: "Total engagement", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getTotalEngagement(brand)), getTotalEngagement(brand)) },
    { label: "Avg. engagement rate", value: (brand) => buildCompetitorValue(renderErPill(engagementRate(brand)), engagementRate(brand), { html: true }) },
    { label: "Total likes", value: (brand) => buildCompetitorValue(formatCompetitorCompact(toNumber(brand.likes)), toNumber(brand.likes)) },
    { label: "Avg. likes", value: (brand) => buildCompetitorValue(formatCompetitorCompact(averagePerPost(brand.likes, brand.posts)), averagePerPost(brand.likes, brand.posts)) },
    { label: "Total comments", value: (brand) => buildCompetitorValue(formatCompetitorCompact(toNumber(brand.comments)), toNumber(brand.comments)) },
    { label: "Avg. comments", value: (brand) => buildCompetitorValue(formatCompetitorCompact(averagePerPost(brand.comments, brand.posts)), averagePerPost(brand.comments, brand.posts)) },
    { label: "Total impressions", value: (brand) => buildCompetitorValue(formatCompetitorCompact(toNumber(brand.impressions)), toNumber(brand.impressions)) },
    { label: "Avg. impressions", value: (brand) => buildCompetitorValue(formatCompetitorCompact(averagePerPost(brand.impressions, brand.posts)), averagePerPost(brand.impressions, brand.posts)) }
  ];
}

function buildCompetitorInfluencerMetrics() {
  return [
    { label: "Active influencers", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getActiveCreators(brand)), getActiveCreators(brand)) },
    { label: "Avg. posts per influencer", value: (brand) => buildCompetitorValue(formatCompetitorCompact(getAveragePostsPerInfluencer(brand)), getAveragePostsPerInfluencer(brand)) },
    {
      label: "Avg. posts per influencer (only reels & feed posts)",
      value: (brand) => buildCompetitorValue(formatCompetitorCompact(getAverageFeedPostsPerInfluencer(brand)), getAverageFeedPostsPerInfluencer(brand))
    }
  ];
}

function getCompetitorTableComparisonBrand(brands) {
  if (!state.comparison.enabled || !state.comparison.brandName) return null;
  return brands.find((brand) => brand.name === state.comparison.brandName) || null;
}

function buildCompetitorValue(display, raw = null, options = {}) {
  const missing = display === null || display === undefined || display === "" || display === "Source needed";
  const rawNumber = raw === null || raw === undefined ? null : toNumber(raw);
  return {
    display,
    raw: Number.isFinite(rawNumber) ? rawNumber : null,
    html: Boolean(options.html),
    missing
  };
}

function getBrandReport(brand) {
  return brand.report || {};
}

function getActiveCreators(brand) {
  return toNumber(getBrandReport(brand).creatorActivity?.activeCreators) || buildCreatorBreakdown(getBrandReport(brand)).length;
}

function getStoryPosts(brand) {
  const report = getBrandReport(brand);
  const fromFormats = findFormatPosts(report.formats, ["story", "stories"]);
  if (fromFormats !== null) return fromFormats;

  const rows = buildCreatorBreakdown(report);
  const fromRows = rows.reduce((sum, row) => sum + toNumber(row.stories || row.storyPosts), 0);
  return fromRows || Math.max(0, toNumber(brand.posts) - getFeedAndReelPosts(brand));
}

function getPhotoPosts(brand) {
  const report = getBrandReport(brand);
  const fromFormats = findFormatPosts(report.formats, ["post", "posts", "photo", "photos"]);
  if (fromFormats !== null) return fromFormats;

  return buildCreatorBreakdown(report).reduce((sum, row) => sum + toNumber(row.photos || row.photoPosts || row.staticPosts), 0);
}

function getVideoPosts(brand) {
  const report = getBrandReport(brand);
  const fromFormats = findFormatPosts(report.formats, ["reel", "reels"]);
  if (fromFormats !== null) return fromFormats;

  return toNumber(brand.videoPosts || brand.reels);
}

function getFeedAndReelPosts(brand) {
  return getPhotoPosts(brand) + getVideoPosts(brand);
}

function findFormatPosts(formats = [], keys = []) {
  if (!Array.isArray(formats) || !formats.length) return null;

  const total = formats.reduce((sum, item) => {
    const type = normalizeMetricKey(item.type || item.name);
    return keys.includes(type) ? sum + toNumber(item.posts) : sum;
  }, 0);

  return total > 0 ? total : null;
}

function getTotalEngagement(brand) {
  return toNumber(brand.likes) + toNumber(brand.comments);
}

function getAveragePostsPerInfluencer(brand) {
  return averagePerPost(brand.posts, getActiveCreators(brand));
}

function getAverageFeedPostsPerInfluencer(brand) {
  return averagePerPost(getFeedAndReelPosts(brand), getActiveCreators(brand));
}

function renderErPill(value) {
  return `<span class="competitor-table__er">${formatPercent(value)}%</span>`;
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Source needed";
  return formatNumber.format(roundToSingleDecimal(Number(value)));
}

async function handleFileImport(event) {
  if (!isAdmin()) {
    event.target.value = "";
    return;
  }

  const file = event.target.files?.[0];
  if (!file) return;

  const extension = file.name.split(".").pop().toLowerCase();
  const rows = extension === "csv" ? await readCsv(file) : await readWorkbook(file);
  const brands = rows.map(normalizeImportRow).filter((row) => row.name);
  const importedPeriod = {
    id: `import-${Date.now()}`,
    label: file.name.replace(/\.(csv|xls|xlsx)$/i, ""),
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    market: "Imported market",
    summary: "Imported data is previewed in the browser. To keep it permanently, move the cleaned rows into data/report-data.json.",
    brands
  };

  state.data.periods = [importedPeriod, ...state.data.periods];
  state.activePeriodId = importedPeriod.id;
  state.activeTab = "overview";
  updatePathForActiveTab();
  render();
}

function readCsv(file) {
  return file.text().then((text) => {
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    const headers = parseCsvLine(headerLine);
    return lines.filter(Boolean).map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    });
  });
}

async function readWorkbook(file) {
  if (!window.XLSX) {
    throw new Error("XLS/XLSX import needs the SheetJS browser library from the CDN.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
}

function normalizeImportRow(row) {
  const name = valueFor(row, "brand", "name", "page", "profile");
  const commentSentiment = valueFor(row, "commentSentiment", "comment_sentiment", "sentiment");
  const commentsAnalysed = numberFor(row, "commentsAnalysed", "comments_analysed", "commentsAnalyzed", "comments_analyzed");
  const normalized = {
    name,
    brandsIncluded: splitList(valueFor(row, "brandsIncluded", "brands_included", "subBrands", "sub_brands")) || [name],
    posts: numberFor(row, "posts", "content", "pieces_of_content"),
    videoPosts: numberFor(row, "videoPosts", "video_posts", "video", "reels"),
    photoPosts: numberFor(row, "photoPosts", "photo_posts", "photo", "staticPosts", "static_posts"),
    impressions: numberFor(row, "impressions"),
    likes: numberFor(row, "likes"),
    comments: numberFor(row, "comments")
  };

  if (commentSentiment || commentsAnalysed) {
    normalized.report = {
      community: {
        commentsAnalysed: commentsAnalysed || normalized.comments,
        sentiment: commentSentiment
      }
    };
  }

  return normalized;
}

function collectReviewedBrands(brands) {
  const names = brands.flatMap((brand) => brand.brandsIncluded || [brand.name]).filter(Boolean);
  return [...new Set(names)];
}

function maxBy(items, getter) {
  return items.reduce((winner, item) => (getter(item) > getter(winner || {}) ? item : winner), null);
}

function engagementRate(item) {
  const impressions = toNumber(item?.impressions);
  if (!impressions) return 0;
  return ((toNumber(item.likes) + toNumber(item.comments)) / impressions) * 100;
}

function formatPercent(value) {
  return formatNumber.format(toNumber(value));
}

function percentShare(value, total) {
  const totalNumber = toNumber(total);
  if (!totalNumber) return 0;
  return (toNumber(value) / totalNumber) * 100;
}

function averagePerPost(value, posts) {
  const postsNumber = toNumber(posts);
  if (!postsNumber) return 0;
  return toNumber(value) / postsNumber;
}

function formatReportValue(value, suffix = "") {
  const number = toNumber(value);
  const formatted = suffix === "%" ? formatPercent(number) : compactNumber(number);
  return `${formatted}${suffix}`;
}

function formatOptionalNumber(value) {
  return hasMetricValue(value) ? formatNumber.format(toNumber(value)) : "-";
}

function normalizeCommentSentiment(value) {
  const sentiment = String(value || "").trim().toLowerCase();
  return commentSentiments.has(sentiment) ? sentiment : "";
}

function getCreatorAnalyticsUrl(...values) {
  const username = extractCreatorUsername(...values);
  return username ? `https://be.epidemic.co/analytics/${encodeURIComponent(username)}` : "";
}

function extractCreatorUsername(...values) {
  for (const value of values) {
    const username = extractUsernameCandidate(value);
    if (username) return username;
  }

  return "";
}

function extractUsernameCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.hostname.includes("instagram.com") || url.hostname.includes("epidemic.co")) {
      const segment = url.pathname.split("/").filter(Boolean)[0];
      return sanitizeUsername(segment);
    }
  } catch {
    // Not a URL; continue with plain-text parsing.
  }

  return sanitizeUsername(raw.replace(/^@+/, ""));
}

function sanitizeUsername(value) {
  const sanitized = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^a-zA-Z0-9._]/g, "");

  return sanitized || "";
}

function hasMetricValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function compactNumber(value) {
  const number = toNumber(value);
  if (number >= 1000000) return `${formatNumber.format(number / 1000000)} M`;
  if (number >= 1000) return `${formatNumber.format(number / 1000)} k`;
  return formatNumber.format(number);
}

function formatCompetitorCompact(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1000) return compactNumber(number);
  return Number.isInteger(number) ? formatNumber.format(number) : formatDecimal(number);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function valueFor(row, ...keys) {
  const normalized = normalizeKeys(row);
  const match = keys.map(normalizeKey).find((key) => normalized[key] !== undefined);
  return match ? String(normalized[match]).trim() : "";
}

function numberFor(row, ...keys) {
  return toNumber(valueFor(row, ...keys));
}

function normalizeKeys(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function normalizeKey(key) {
  return String(key).trim().replace(/[\s-]+/g, "_").toLowerCase();
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
}

function splitList(value) {
  const items = String(value || "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function toNumber(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
