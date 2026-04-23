const dataUrl = "./data/report-data.json";
const authStorageKey = "automoto-report-auth";
const mediaStorageKey = "automoto-report-media-urls";
const authStorage = window.localStorage;
const saveStatusDuration = 2400;
const defaultPasswords = {
  admin: "Epi123!",
  viewer: "GAreport997!"
};

const formatNumber = new Intl.NumberFormat("sl-SI", {
  maximumFractionDigits: 1
});
const formatColors = ["#e6542a", "#78bce8", "#58b87a"];
const themeColors = ["#58b87a", "#ffc857", "#eaa0a0"];

const state = {
  data: null,
  auth: null,
  activePeriodId: null,
  activeTab: "overview",
  typeChart: null,
  heroMiniChart: null,
  brandFormatChart: null,
  brandThemeChart: null,
  competitorChart: null,
  saveTimer: null,
  saveStatusTimer: null
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
  dataRows: document.querySelector("#dataRows"),
  typeChart: document.querySelector("#typeChart"),
  heroMiniChart: document.querySelector("#heroMiniChart")
};

init();

async function init() {
  nodes.authForm.addEventListener("submit", handleLogin);
  nodes.logoutButton.addEventListener("click", handleLogout);
  restoreStoredAuth();
  await restoreServerAuth();

  nodes.periodSelect.addEventListener("change", (event) => {
    state.activePeriodId = event.target.value;
    state.activeTab = "overview";
    updatePathForActiveTab();
    render();
  });

  nodes.fileInput.addEventListener("change", handleFileImport);
  nodes.reportTabs.addEventListener("click", handleTabClick);
  nodes.brandPanel.addEventListener("input", handleBestContentInput);
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
  applyStoredMediaUrls();
  state.activePeriodId = state.data.activePeriodId || state.data.periods[0]?.id;
}

function restoreStoredAuth() {
  try {
    const storedAuth = JSON.parse(authStorage.getItem(authStorageKey) || "null");
    if (storedAuth?.role === "admin" || storedAuth?.role === "viewer") {
      state.auth = storedAuth;
    }
  } catch {
    clearStoredAuth();
  }
}

async function restoreServerAuth() {
  try {
    const response = await fetch("./api/session");
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
    setAuth({ role });
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
  if (password === defaultPasswords.viewer) return "viewer";
  return null;
}

function setAuth(auth) {
  state.auth = {
    role: auth.role
  };
  authStorage.setItem(authStorageKey, JSON.stringify(state.auth));
}

async function handleLogout() {
  state.auth = null;
  state.data = null;
  clearStoredAuth();

  try {
    await fetch("./api/logout", { method: "POST" });
  } catch {
    // Static hosting fallback has no logout endpoint.
  }

  lockReport();
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
  nodes.fileInput.disabled = !isAdmin();
  nodes.fileInput.closest(".file-button")?.classList.toggle("is-hidden", !isAdmin());
}

function lockReport() {
  nodes.body.classList.add("is-locked");
  nodes.body.classList.remove("is-viewer");
  nodes.reportShell.setAttribute("aria-hidden", "true");
  nodes.authGate.removeAttribute("hidden");
  nodes.accessBadge.textContent = "";
  nodes.fileInput.disabled = true;
  nodes.fileInput.closest(".file-button")?.classList.add("is-hidden");
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
  nodes.periodLabel.textContent = period.label || periodRange;
  nodes.marketLabel.textContent = period.market || "Market not set";
  nodes.brandLabel.textContent = `Brands: ${reviewedBrands.join(", ")}`;
  nodes.contentCount.innerHTML = `<strong>${formatNumber.format(totals.posts)}</strong> pieces of content were created.`;

  nodes.periodSelect.innerHTML = state.data.periods
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  nodes.periodSelect.value = period.id;

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
            <h3>${escapeHtml(brand.name)}</h3>
            <p>${escapeHtml((brand.brandsIncluded || [brand.name]).join(", "))}</p>
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
  nodes.dataRows.innerHTML = brands.map(renderRow).join("");
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
          ${escapeHtml(tab.label)}
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
    ...brands.map((brand, index) => ({ id: `brand:${index}`, label: brand.name, slug: slugify(brand.name) })),
    { id: "competitor", label: "Competitor map" },
    { id: "source", label: "Source data" }
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

  if (state.activeTab === "competitor" && state.competitorChart) {
    state.competitorChart.resize();
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

  nodes.brandPanel.innerHTML = `
    <section class="section section--brand-detail" aria-labelledby="brandDetailTitle">
      <div class="brand-detail__intro">
        <p class="eyebrow">Brand report</p>
        <h2 id="brandDetailTitle">${escapeHtml(brand.name)}</h2>
        <p class="summary-note">${escapeHtml(report.summary)}</p>
        <div class="brand-report__meta">
          <span>${escapeHtml((brand.brandsIncluded || [brand.name]).join(", "))}</span>
          ${
            report.contentPreviewUrl
              ? `<a href="${escapeHtml(report.contentPreviewUrl)}" target="_blank" rel="noreferrer">Content preview</a>`
              : ""
          }
        </div>
      </div>

      <div class="brand-detail__metrics">
        ${renderMetric("Posts", formatNumber.format(toNumber(brand.posts)), "Published content")}
        ${renderMetric("Impressions", compactNumber(brand.impressions), "Total reach signal")}
        ${renderMetric("Engagement", compactNumber(totalEngagement), "Likes and comments")}
        ${renderMetric("ER", `${formatPercent(engagementRate(brand))}%`, "Engagement rate")}
      </div>

      <div class="brand-report-grid">
        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Content volume and formats</h3>
            <p>Format split for the selected period.</p>
          </div>
          <div class="format-layout">
            ${renderFormatTable(report.formats)}
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
          ${renderPerformanceTable(report.performance)}
        </article>

        <article class="brand-report-block">
          <div>
            <h3>Creator activity</h3>
            <p>${escapeHtml(report.creatorActivity.activeCreators)} profilov je za to znamko naredilo ${formatNumber.format(
              toNumber(report.creatorActivity.contentCount)
            )} vsebin.</p>
          </div>
          <dl class="creator-list">
            <div><dt>Average content per profile</dt><dd>${escapeHtml(report.creatorActivity.averagePosts)} posts</dd></div>
            <div>
              <dt>Most active creator</dt>
              <dd>
                ${
                  report.creatorActivity.mostActive.url
                    ? `<a href="${escapeHtml(report.creatorActivity.mostActive.url)}" target="_blank" rel="noreferrer">${escapeHtml(
                        report.creatorActivity.mostActive.name
                      )}</a>`
                    : escapeHtml(report.creatorActivity.mostActive.name)
                }
                <span>${formatNumber.format(toNumber(report.creatorActivity.mostActive.posts))} posts</span>
              </dd>
            </div>
          </dl>
        </article>

        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Best performing content</h3>
            <p>Top creative slots by format. Add post-level URLs when source exports include them.</p>
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
          <div class="community-strip">
            <div><span>Comment analysis</span><strong>${formatNumber.format(toNumber(report.community.commentsAnalysed))}</strong></div>
            <div><span>Comment sentiment</span><strong>${escapeHtml(report.community.sentiment)}</strong></div>
          </div>
        </article>

        <article class="brand-report-block brand-report-block--wide">
          <div>
            <h3>Creator / profile breakdown</h3>
            <p>Publishing mix and performance by profile for this brand.</p>
          </div>
          ${renderCreatorBreakdownTable(report.creatorBreakdown)}
        </article>
      </div>
    </section>
  `;

  renderBrandDoughnutCharts(report);
}

function renderMetric(label, value, description) {
  return `
    <article class="kpi">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(description)}</small>
    </article>
  `;
}

function buildBrandReport(brand, metrics) {
  const report = brand.report || {};
  const posts = toNumber(brand.posts);
  const videoPosts = toNumber(metrics.videoPosts);
  const photoPosts = toNumber(metrics.photoPosts);
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
      mostActive: report.creatorActivity?.mostActive || {
        name: "Source needed",
        posts: 0,
        url: ""
      }
    },
    creatorBreakdown: buildCreatorBreakdown(report),
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
    community: report.community || {
      commentsAnalysed: toNumber(brand.comments),
      sentiment: toNumber(brand.comments) ? "To classify" : "Source needed"
    }
  };
}

function renderFormatTable(formats) {
  const totalPosts = formats.reduce((sum, item) => sum + toNumber(item.posts), 0);
  return `
    <div class="mini-table">
      <div class="mini-table__head"><span>Content type</span><span>No. of posts</span><span>Share</span></div>
      ${formats
        .map(
          (item) => `
            <div class="mini-table__row">
              <span>${escapeHtml(item.type || item.name)}</span>
              <strong>${formatNumber.format(toNumber(item.posts))}</strong>
              <span>${formatPercent(item.share ?? percentShare(item.posts, totalPosts))}%</span>
            </div>
          `
        )
        .join("")}
      <div class="mini-table__row mini-table__row--total">
        <span>Total</span>
        <strong>${formatNumber.format(totalPosts)}</strong>
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
            <th>Creator / profile</th>
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
              : `<tr><td class="profile-table__empty" colspan="10">Profile-level source data is needed for this brand.</td></tr>`
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
  const name = row.url
    ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.name || row.profile || "Source needed")}</a>`
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

function renderPerformanceTable(rows) {
  return `
    <div class="mini-table mini-table--performance">
      <div class="mini-table__head"><span>Metric</span><span>Total value</span><span>Avg. value per post</span></div>
      ${rows
        .map(
          (row) => `
            <div class="mini-table__row">
              <span>${escapeHtml(row.metric)}</span>
              <strong>${formatReportValue(row.total, row.suffix)}</strong>
              <span>${formatReportValue(row.average, row.suffix)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderBestContent(item, brandIndex, contentIndex) {
  const videoUrl = item.videoUrl || item.video || "";
  const imageUrl = item.imageUrl || item.image || "";
  const mediaLabel = item.mediaType || "Post";
  const mediaClass = imageUrl || videoUrl ? " content-card__media--image" : "";

  return `
    <div class="content-card" data-brand-index="${escapeHtml(brandIndex)}" data-content-index="${escapeHtml(contentIndex)}">
      <div class="content-card__media${mediaClass}">
        ${renderBestContentMedia(item)}
        <span>${escapeHtml(mediaLabel)}</span>
      </div>
      <div>
        <h4>${escapeHtml(item.label)}</h4>
        <p>${escapeHtml(item.creator || "Source needed")}</p>
        <dl>
          <div><dt>Primary</dt><dd>${escapeHtml(item.primaryMetric)}</dd></div>
          <div><dt>Secondary</dt><dd>${escapeHtml(item.secondaryMetric)}</dd></div>
        </dl>
        ${isAdmin() ? renderBestContentEditor(item, brandIndex, contentIndex) : ""}
      </div>
    </div>
  `;
}

function renderBestContentEditor(item, brandIndex, contentIndex) {
  return `
    <div class="content-card__editor" aria-label="Media URLs">
      <label>
        Image URL
        <input
          type="url"
          inputmode="url"
          placeholder="https://.../image.jpg"
          value="${escapeHtml(item.imageUrl || item.image || "")}"
          data-media-field="imageUrl"
          data-brand-index="${escapeHtml(brandIndex)}"
          data-content-index="${escapeHtml(contentIndex)}"
        />
      </label>
      <label>
        Video URL
        <input
          type="url"
          inputmode="url"
          placeholder="https://.../video.mp4"
          value="${escapeHtml(item.videoUrl || item.video || "")}"
          data-media-field="videoUrl"
          data-brand-index="${escapeHtml(brandIndex)}"
          data-content-index="${escapeHtml(contentIndex)}"
        />
      </label>
      <span class="content-card__save" data-save-status="${escapeHtml(brandIndex)}-${escapeHtml(contentIndex)}"></span>
    </div>
  `;
}

function handleBestContentInput(event) {
  const input = event.target.closest("[data-media-field]");
  if (!input || !isAdmin()) return;

  const brandIndex = Number(input.dataset.brandIndex);
  const contentIndex = Number(input.dataset.contentIndex);
  const field = input.dataset.mediaField;
  const item = getEditableBestContentItem(brandIndex, contentIndex);
  if (!item || (field !== "imageUrl" && field !== "videoUrl")) return;

  item[field] = input.value.trim();
  storeMediaUrlOverride(brandIndex, contentIndex, field, item[field]);
  updateBestContentMedia(brandIndex, contentIndex, item);
  showSaveStatus(brandIndex, contentIndex, "Saving...");
  scheduleReportSave(brandIndex, contentIndex);
}

function getEditableBestContentItem(brandIndex, contentIndex) {
  const period = getActivePeriod();
  const brand = getBrands(period)[brandIndex];
  if (!brand) return null;

  ensureBestContent(brand);

  return brand.report.bestContent[contentIndex] || null;
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

function storeMediaUrlOverride(brandIndex, contentIndex, field, value) {
  const period = getActivePeriod();
  if (!period?.id || (field !== "imageUrl" && field !== "videoUrl")) return;

  const overrides = readStoredMediaUrls();
  overrides[period.id] = overrides[period.id] || {};
  overrides[period.id][brandIndex] = overrides[period.id][brandIndex] || {};
  overrides[period.id][brandIndex][contentIndex] = overrides[period.id][brandIndex][contentIndex] || {};
  overrides[period.id][brandIndex][contentIndex][field] = value;

  try {
    authStorage.setItem(mediaStorageKey, JSON.stringify(overrides));
  } catch {
    // The server save path still handles persistence when browser storage is unavailable.
  }
}

function clearStoredMediaUrlOverride(brandIndex, contentIndex) {
  const period = getActivePeriod();
  if (!period?.id) return;

  const overrides = readStoredMediaUrls();
  if (!overrides[period.id]?.[brandIndex]?.[contentIndex]) return;

  delete overrides[period.id][brandIndex][contentIndex];

  if (!Object.keys(overrides[period.id][brandIndex]).length) {
    delete overrides[period.id][brandIndex];
  }
  if (!Object.keys(overrides[period.id]).length) {
    delete overrides[period.id];
  }

  try {
    authStorage.setItem(mediaStorageKey, JSON.stringify(overrides));
  } catch {
    // Nothing else to do; stale fallback data is preferable to losing an unsaved URL.
  }
}

function applyStoredMediaUrls() {
  const overrides = readStoredMediaUrls();
  if (!state.data?.periods?.length) return;

  state.data.periods.forEach((period) => {
    const periodOverrides = overrides[period.id];
    if (!periodOverrides) return;

    getBrands(period).forEach((brand, brandIndex) => {
      const brandOverrides = periodOverrides[brandIndex];
      if (!brandOverrides) return;

      const bestContent = ensureBestContent(brand);
      Object.entries(brandOverrides).forEach(([contentIndex, values]) => {
        const item = bestContent[Number(contentIndex)];
        if (!item || !values) return;

        if (Object.prototype.hasOwnProperty.call(values, "imageUrl")) {
          item.imageUrl = values.imageUrl;
        }
        if (Object.prototype.hasOwnProperty.call(values, "videoUrl")) {
          item.videoUrl = values.videoUrl;
        }
      });
    });
  });
}

function readStoredMediaUrls() {
  try {
    const stored = JSON.parse(authStorage.getItem(mediaStorageKey) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    authStorage.removeItem(mediaStorageKey);
    return {};
  }
}

function updateBestContentMedia(brandIndex, contentIndex, item) {
  const card = nodes.brandPanel.querySelector(
    `.content-card[data-brand-index="${CSS.escape(String(brandIndex))}"][data-content-index="${CSS.escape(String(contentIndex))}"]`
  );
  const media = card?.querySelector(".content-card__media");
  if (!media) return;

  const videoUrl = item.videoUrl || item.video || "";
  const imageUrl = item.imageUrl || item.image || "";
  const mediaLabel = item.mediaType || "Post";

  media.classList.toggle("content-card__media--image", Boolean(imageUrl || videoUrl));
  media.innerHTML = `
    ${renderBestContentMedia(item)}
    <span>${escapeHtml(mediaLabel)}</span>
  `;
}

function renderBestContentMedia(item) {
  const videoUrl = item.videoUrl || item.video || "";
  const imageUrl = item.imageUrl || item.image || "";
  const mediaLabel = item.mediaType || "Post";

  if (videoUrl) {
    const embedUrl = videoEmbedUrl(videoUrl);
    if (embedUrl) {
      return `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(`${item.label || mediaLabel} video`)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    }

    return `<video src="${escapeHtml(videoUrl)}" controls muted playsinline preload="metadata"></video>`;
  }

  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${item.label || mediaLabel} by ${item.creator || "creator"}`)}" loading="lazy" />`;
  }

  return "";
}

function videoEmbedUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const watchId = url.searchParams.get("v");
      const pathParts = url.pathname.split("/").filter(Boolean);
      const id = watchId || (["shorts", "embed"].includes(pathParts[0]) ? pathParts[1] : "");
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : "";
    }
  } catch {
    return "";
  }

  return "";
}

function scheduleReportSave(brandIndex, contentIndex) {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(async () => {
    try {
      await saveReportData();
      clearStoredMediaUrlOverride(brandIndex, contentIndex);
      showSaveStatus(brandIndex, contentIndex, "Saved");
    } catch {
      showSaveStatus(brandIndex, contentIndex, "Saved locally");
    }
  }, 550);
}

async function saveReportData() {
  const response = await fetch("./api/report-data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.data)
  });

  if (!response.ok) {
    throw new Error("Report save failed.");
  }
}

function showSaveStatus(brandIndex, contentIndex, message) {
  const status = nodes.brandPanel.querySelector(`[data-save-status="${CSS.escape(`${brandIndex}-${contentIndex}`)}"]`);
  if (!status) return;

  status.textContent = message;
  window.clearTimeout(state.saveStatusTimer);
  if (message === "Saving...") return;

  state.saveStatusTimer = window.setTimeout(() => {
    status.textContent = "";
  }, saveStatusDuration);
}

function renderModelTable(models) {
  return `
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

function renderCompetitorMap(brands) {
  if (!window.Chart || !nodes.competitorChart) return;

  const chartData = brands.map((brand, index) => ({
    x: toNumber(brand.posts),
    y: engagementRate(brand),
    brandIndex: index,
    label: brand.name,
    impressions: toNumber(brand.impressions)
  }));

  const maxPosts = Math.max(...chartData.map((item) => item.x), 1);
  const maxEr = Math.max(...chartData.map((item) => item.y), 1);

  if (state.competitorChart) {
    state.competitorChart.data.datasets[0].data = chartData;
    state.competitorChart.options.scales.x.max = Math.ceil(maxPosts * 1.12);
    state.competitorChart.options.scales.y.max = Math.ceil(maxEr * 1.18 * 10) / 10;
    state.competitorChart.update();
    return;
  }

  state.competitorChart = new window.Chart(nodes.competitorChart, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Brands",
          data: chartData,
          parsing: false,
          backgroundColor: "#e6542a",
          borderColor: "#f4f0e8",
          borderWidth: 2,
          pointRadius: 8,
          pointHoverRadius: 10
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

        const item = state.competitorChart.data.datasets[element.datasetIndex].data[element.index];
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
            label: (context) => [
              `Posts: ${formatNumber.format(context.raw.x)}`,
              `ER: ${formatPercent(context.raw.y)}%`,
              `Impressions: ${formatNumber.format(context.raw.impressions)}`
            ]
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: Math.ceil(maxPosts * 1.12),
          title: {
            display: true,
            text: "More posts",
            color: "#f4f0e8",
            font: chartFont(12, 800)
          },
          grid: {
            color: "rgba(244, 240, 232, 0.08)"
          },
          ticks: {
            color: "#b9b2a7",
            font: chartFont(11)
          }
        },
        y: {
          min: 0,
          max: Math.ceil(maxEr * 1.18 * 10) / 10,
          title: {
            display: true,
            text: "Higher ER",
            color: "#f4f0e8",
            font: chartFont(12, 800)
          },
          grid: {
            color: "rgba(244, 240, 232, 0.08)"
          },
          ticks: {
            color: "#b9b2a7",
            font: chartFont(11),
            callback: (value) => `${formatPercent(value)}%`
          }
        }
      }
    },
    plugins: [scatterLabelPlugin()]
  });
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

function renderHighlight([label, brand, value]) {
  return `
    <article class="highlight">
      <h3>${escapeHtml(label)}</h3>
      <div>
        <strong>${escapeHtml(brand || "-")}</strong>
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

function scatterLabelPlugin() {
  return {
    id: "scatterLabelPlugin",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      const items = chart.data.datasets[0].data;

      ctx.save();
      ctx.font = "800 12px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";

      meta.data.forEach((point, index) => {
        const label = items[index]?.label;
        if (!label) return;

        const x = Math.min(point.x + 14, chartArea.right - ctx.measureText(label).width - 10);
        const y = Math.max(chartArea.top + 10, Math.min(point.y, chartArea.bottom - 10));

        ctx.fillStyle = "rgba(17, 17, 17, 0.78)";
        const width = ctx.measureText(label).width + 14;
        ctx.beginPath();
        ctx.roundRect(x - 7, y - 12, width, 24, 4);
        ctx.fill();

        ctx.fillStyle = "#f4f0e8";
        ctx.fillText(label, x, y);
      });

      ctx.restore();
    }
  };
}

function renderRow(item) {
  return `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${formatNumber.format(toNumber(item.posts))}</td>
      <td>${formatNumber.format(toNumber(item.videoPosts || item.reels))}</td>
      <td>${formatNumber.format(toNumber(item.photoPosts || item.staticPosts || item.posts))}</td>
      <td>${formatNumber.format(toNumber(item.impressions))}</td>
      <td>${formatNumber.format(toNumber(item.likes))}</td>
      <td>${formatNumber.format(toNumber(item.comments))}</td>
      <td>${formatPercent(engagementRate(item))}%</td>
    </tr>
  `;
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
  return {
    name,
    brandsIncluded: splitList(valueFor(row, "brandsIncluded", "brands_included", "subBrands", "sub_brands")) || [name],
    posts: numberFor(row, "posts", "content", "pieces_of_content"),
    videoPosts: numberFor(row, "videoPosts", "video_posts", "video", "reels"),
    photoPosts: numberFor(row, "photoPosts", "photo_posts", "photo", "staticPosts", "static_posts"),
    impressions: numberFor(row, "impressions"),
    likes: numberFor(row, "likes"),
    comments: numberFor(row, "comments")
  };
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

function hasMetricValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function compactNumber(value) {
  const number = toNumber(value);
  if (number >= 1000000) return `${formatNumber.format(number / 1000000)} M`;
  if (number >= 1000) return `${formatNumber.format(number / 1000)} k`;
  return formatNumber.format(number);
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
