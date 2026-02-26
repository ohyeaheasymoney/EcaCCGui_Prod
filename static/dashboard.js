// ─────────────────────────────────────────────────────────────
// dashboard.js — Job list, dashboard KPIs, health polling
// ─────────────────────────────────────────────────────────────

// Connection state (shared with job-panel.js)
let _connectionLost = false;
let _reconnectAttempts = 0;

function showConnectionBanner(lost) {
  let banner = $("connection-banner");
  if (lost) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "connection-banner";
      banner.className = "connection-banner connection-lost";
      banner.innerHTML = "Connection lost &mdash; reconnecting...";
      document.body.appendChild(banner);
    } else {
      banner.className = "connection-banner connection-lost";
      banner.innerHTML = "Connection lost &mdash; reconnecting...";
      banner.style.display = "block";
    }
    // (#12) Disable panel close button during disconnect
    const closeBtn = qs(".job-panel .panel-header .modal-close");
    if (closeBtn) { closeBtn.disabled = true; closeBtn.title = "Reconnecting..."; }
  } else {
    if (banner) {
      banner.className = "connection-banner connection-ok";
      banner.innerHTML = "Reconnected";
      banner.style.display = "block";
      setTimeout(() => { if (banner) banner.style.display = "none"; }, 3000);
    }
    // (#12) Re-enable panel close button
    const closeBtn = qs(".job-panel .panel-header .modal-close");
    if (closeBtn) { closeBtn.disabled = false; closeBtn.title = ""; }
  }
}

const debouncedSearchJobs = debounce(function (val) {
  saveFilterState();
  renderJobsFiltered(val, window._activeJobFilter || "all");
}, 300);

window.debouncedSearchJobs = debouncedSearchJobs;
window._activeJobFilter = "all";
window._sortCol = "created";
window._sortDir = "desc";
window._workflowFilter = "all";
window._customerFilter = "all";

// ─── Filter Persistence (Feature 6) ───
function saveFilterState() {
  try {
    const searchInput = $("job-search-input");
    const dateFrom = $("job-date-from");
    const dateTo = $("job-date-to");
    const state = {
      status: window._activeJobFilter || "all",
      sortCol: window._sortCol || "created",
      sortDir: window._sortDir || "desc",
      text: searchInput ? searchInput.value : "",
      dateFrom: dateFrom ? dateFrom.value : "",
      dateTo: dateTo ? dateTo.value : "",
      workflow: window._workflowFilter || "all",
      customer: window._customerFilter || "all",
    };
    localStorage.setItem("eca_job_filters", JSON.stringify(state));
  } catch { /* localStorage may be full */ }
}

function loadFilterState() {
  try {
    const raw = localStorage.getItem("eca_job_filters");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// Favorites (localStorage)
// ─────────────────────────────────────────────────────────────
window._favorites = JSON.parse(localStorage.getItem("eca_favorites") || "[]");

window.toggleFavorite = function (jobId) {
  const idx = window._favorites.indexOf(jobId);
  if (idx >= 0) {
    window._favorites.splice(idx, 1);
  } else {
    window._favorites.push(jobId);
  }
  localStorage.setItem("eca_favorites", JSON.stringify(window._favorites));
  loadJobs();
};

function isFavorite(jobId) {
  return window._favorites.includes(jobId);
}

// ─────────────────────────────────────────────────────────────
// Styled Confirm Modal (replaces browser confirm)
// ─────────────────────────────────────────────────────────────
window.showConfirm = function (message, onConfirm, options = {}) {
  const container = $("confirm-modal-container");
  if (!container) { if (confirm(message)) onConfirm(); return; }

  const title = options.title || "Confirm";
  const confirmText = options.confirmText || "Confirm";
  const cancelText = options.cancelText || "Cancel";
  const danger = options.danger || false;
  const onCancel = options.onCancel || null;

  container.innerHTML = `
    <div class="confirm-overlay" id="confirm-overlay" role="dialog" aria-modal="true">
      <div class="confirm-card">
        <div class="confirm-title">${safeText(title)}</div>
        <div class="confirm-message">${options.html ? message : safeText(message)}</div>
        <div class="confirm-actions">
          <button class="btn ghost" id="confirm-cancel">${cancelText}</button>
          <button class="btn ${danger ? "danger" : "primary"}" id="confirm-ok">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    const overlay = $("confirm-overlay");
    if (overlay) {
      overlay.classList.add("closing");
      const clear = () => { container.innerHTML = ""; };
      overlay.addEventListener("animationend", clear, { once: true });
      setTimeout(clear, 300);
    } else container.innerHTML = "";
  };
  $("confirm-cancel").addEventListener("click", () => { dismiss(); if (onCancel) onCancel(); });
  $("confirm-overlay").addEventListener("click", (e) => { if (e.target.id === "confirm-overlay") { dismiss(); if (onCancel) onCancel(); } });
  $("confirm-ok").addEventListener("click", () => { dismiss(); onConfirm(); });
};

// Promise-based wrapper for use in async flows
window.showConfirmAsync = function (message, options = {}) {
  return new Promise((resolve) => {
    showConfirm(message, () => resolve(true), { ...options, onCancel: () => resolve(false) });
  });
};

// ─────────────────────────────────────────────────────────────
// Nav Badges
// ─────────────────────────────────────────────────────────────
function updateNavBadges(jobs) {
  const badge = $("nav-badge-jobs");
  if (!badge) return;
  const running = jobs.filter(j => j.status === "running").length;
  if (running > 0) {
    badge.textContent = running;
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

// ─────────────────────────────────────────────────────────────
// Export Jobs to CSV
// ─────────────────────────────────────────────────────────────
window.exportJobsCSV = function () {
  const jobs = window._allJobs || [];
  if (!jobs.length) { showToast("No jobs to export", "info"); return; }

  const headers = ["Job Name", "Workflow", "Project", "Rack ID", "SKU", "P.O.", "Hosts", "Status", "Last Result", "Created"];
  const wfLabels = window.WORKFLOW_LABELS || {};
  const rows = jobs.map(j => [
    j.jobName || j.name || "",
    wfLabels[(j.workflow || "").toLowerCase()] || j.workflow || "",
    j.customer || "",
    j.rackId || "",
    j.sku || "",
    j.po || "",
    j.hostCount || 0,
    j.status || "",
    j.lastRunResult || "",
    j.createdAt || "",
  ]);

  let csv = headers.join(",") + "\n";
  rows.forEach(row => {
    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `eca-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Jobs exported to CSV", "success");
};


// ─────────────────────────────────────────────────────────────
// Ops Banner (greeting + live status)
// ─────────────────────────────────────────────────────────────
// Pick one random idle quip per page load
const _idleQuips = [
  "All systems operational. Coffee is not.",
  "Zero fires detected. Suspicious, but we'll take it.",
  "Servers are vibing. No complaints.",
  "Nothing is broken. Yet. Knock on wood.",
  "All quiet on the data center front.",
  "Uptime looking good. Your fantasy football, less so.",
  "No alerts. Go touch grass.",
  "Everything's green. Even the intern's code.",
  "Systems nominal. Time to look busy.",
  "All clear. The servers send their regards.",
  "Smooth sailing. Don't jinx it.",
  "No issues found. We checked twice.",
  "Running like a dream. Somebody pinch us.",
  "All systems go. Launch the snacks.",
  "0 problems detected. That IS the problem.",
  "Servers are happy. Treat yourself too.",
  "Peace and quiet. The logs are boring today.",
  "Nothing to fix. Are we even needed here?",
  "All green across the board. Nap time?",
  "Operational status: suspiciously perfect.",
];
const _idleQuip = _idleQuips[Math.floor(Math.random() * _idleQuips.length)];

function renderOpsBanner(jobs) {
  const banner = $("ops-banner");
  if (!banner) return;

  const running = jobs.filter(j => j.status === "running").length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = jobs.filter(j => j.createdAt && new Date(j.createdAt) >= todayStart).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const statusText = running > 0
    ? `${running} job${running > 1 ? "s" : ""} running`
    : _idleQuip;

  let statsHtml = "";
  if (running > 0) statsHtml += `<span class="ops-stat">${running} running</span>`;
  statsHtml += `<span class="ops-stat">${todayCount} today</span>`;
  statsHtml += `<span class="ops-stat">${jobs.length} total</span>`;

  banner.className = running > 0 ? "ops-banner ops-banner-active" : "ops-banner";
  banner.innerHTML = `
    <div class="ops-banner-left">
      <div class="ops-pulse"></div>
      <div>
        <div class="ops-banner-text">${greeting}</div>
        <div class="ops-stat" style="margin-top:2px;">${statusText}</div>
      </div>
    </div>
    <div class="ops-banner-right">${statsHtml}</div>
  `;
}

// ─────────────────────────────────────────────────────────────
// KPI Summary Cards (clickable, 4 cards)
// ─────────────────────────────────────────────────────────────
function renderDashboardKPIs(jobs) {
  const grid = $("kpi-grid");
  if (!grid) return;

  const total = jobs.length;
  const running = jobs.filter(j => j.status === "running").length;
  const completed = jobs.filter(j => j.status === "completed").length;
  const failed = jobs.filter(j => j.lastRunResult === "failed" || j.status === "failed").length;
  const saved = jobs.filter(j => j.status === "saved").length;
  const successRate = total > 0 ? Math.round(((completed) / total) * 100) : 0;

  grid.innerHTML = `
    <div class="kpi-card kpi-card-clickable kpi-card-blue" tabindex="0" onclick="navigateToJobs('running')" title="View active jobs">
      <div class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg></div>
      <div class="kpi-label">Active Jobs</div>
      <div class="kpi-value" style="color:#60a5fa;">${running}</div>
      <div class="kpi-sub">${saved} ready to run</div>
    </div>
    <div class="kpi-card kpi-card-clickable kpi-card-green" tabindex="0" onclick="navigateToJobs('completed')" title="View completed jobs">
      <div class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="kpi-label">Completed</div>
      <div class="kpi-value" style="color:#4ade80;">${completed}</div>
      <div class="kpi-sub">${successRate}% success rate</div>
    </div>
    <div class="kpi-card kpi-card-clickable kpi-card-red" tabindex="0" onclick="navigateToJobs('failed')" title="View failed jobs">
      <div class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="kpi-label">Failed</div>
      <div class="kpi-value" style="color:#f87171;">${failed}</div>
      <div class="kpi-sub">${failed > 0 ? "Needs attention" : "All clear"}</div>
    </div>
    <div class="kpi-card kpi-card-clickable kpi-card-default" tabindex="0" onclick="navigateToJobs('all')" title="View all jobs">
      <div class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
      <div class="kpi-label">Total Jobs</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">${saved} saved &bull; ${running} active</div>
    </div>
  `;
}

// Navigate to Jobs page with optional filter
window.navigateToJobs = function (filter) {
  const jobsNav = qs('[data-page="jobs"]');
  if (jobsNav) jobsNav.click();
  setTimeout(() => {
    window._activeJobFilter = filter || "all";
    const filterBtn = qs(`.filter-tab[data-filter="${filter}"]`);
    if (filterBtn) filterBtn.click();
  }, 100);
};

// ─────────────────────────────────────────────────────────────
// Dashboard job row — card-style row
// ─────────────────────────────────────────────────────────────
window._dashProgress = {};

function buildDashJobCard(job) {
  const jobId = job.jobId || job.id || job.job_id;
  const jobName = safeText(job.jobName || job.name || "(unnamed)");
  const workflow = (job.workflow || "").toLowerCase();
  const wfLabel = safeText((window.WORKFLOW_LABELS && window.WORKFLOW_LABELS[workflow]) || workflow || "\u2014");
  const hostCount = job.hostCount || 0;
  const createdAgo = job.createdAt ? timeAgo(job.createdAt) : "\u2014";
  const status = (job.status || "saved").toLowerCase();

  let progressHtml = "";
  if (status === "running") {
    const prog = window._dashProgress[jobId];
    const pct = prog && prog.pct > 0 ? prog.pct : 0;
    const taskName = prog && prog.lastTask ? prog.lastTask : "";
    const elapsed = prog && prog.elapsed ? prog.elapsed : "";
    const fillClass = pct > 0 ? "" : " inline-progress-indeterminate";

    // Running tags pills (Feature 7)
    let tagsHtml = "";
    const tags = job.lastRunTags || [];
    if (tags.length) {
      tagsHtml = `<div class="dash-running-tags">${tags.map(t =>
        `<span class="dash-tag-pill">${safeText(t)}</span>`
      ).join("")}</div>`;
    }

    // Elapsed + task name
    const taskDisplay = (elapsed ? elapsed + " — " : "") + safeText(taskName || (pct > 0 ? pct + "%" : "Running..."));

    progressHtml = `<div class="job-row-progress" id="dash-prog-${safeText(jobId)}">
      ${tagsHtml}
      <div class="inline-progress"><div class="inline-progress-fill${fillClass}" style="width:${pct}%"></div></div>
      <div class="dash-task-name">${taskDisplay}</div>
    </div>`;
  }

  return `<div class="job-row-card job-row-card-${status}" data-jobid="${safeText(jobId)}">
    <div class="job-row-content">
      <div class="job-row-top">
        <span class="status-dot status-dot-${status}"></span>
        <span class="job-row-name">${jobName}</span>
        ${statusBadge(status, job.updatedAt || job.createdAt)}
      </div>
      <div class="job-row-meta">
        <span>${wfLabel}</span>
        <span class="meta-dot"></span>
        <span>${hostCount ? hostCount + " hosts" : "No hosts"}</span>
        <span class="meta-dot"></span>
        <span>${safeText(createdAgo)}</span>
      </div>
      ${progressHtml}
    </div>
    <div class="job-row-actions">
      <button class="btn ghost" data-jobid="${safeText(jobId)}">View</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// Running-job dashboard poll (lightweight progress updates)
// ─────────────────────────────────────────────────────────────
let _dashPollTimer = null;

async function pollRunningDashboard() {
  const jobs = window._allJobs || [];
  const running = jobs.filter(j => j.status === "running");

  if (!running.length) {
    _dashPollTimer = null;
    return;
  }

  for (const job of running) {
    const jobId = job.jobId || job.id || job.job_id;
    try {
      const log = await apiGet(`/api/jobs/${encodeURIComponent(jobId)}/log`);
      let txt = "";
      if (typeof log === "string") txt = log;
      else if (log && log.log) txt = log.log;
      else if (log && log.text) txt = log.text;
      else txt = "";

      const cleanTxt = stripAnsi(txt);
      const progress = parseLogForProgress(cleanTxt);

      const taskCount = progress.taskCount || 0;
      const completed = progress.completedTasks || 0;
      const pct = taskCount > 0 ? Math.round((completed / taskCount) * 100) : 0;

      // Elapsed from first TASK line
      const startMatch = cleanTxt.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/m);
      let elapsed = "";
      if (startMatch) {
        const startTime = new Date(startMatch[1]);
        const secs = Math.round((Date.now() - startTime.getTime()) / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        elapsed = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }

      window._dashProgress[jobId] = {
        lastTask: progress.lastTask || "Running...",
        pct, taskCount, completed, elapsed,
      };

      // Update inline progress bar for running jobs
      const progEl = $(`dash-prog-${jobId}`);
      if (progEl) {
        const fill = progEl.querySelector('.inline-progress-fill');
        if (fill) {
          fill.style.width = pct + '%';
          fill.classList.toggle('inline-progress-indeterminate', pct === 0);
        }
        const taskEl = progEl.querySelector('.dash-task-name');
        if (taskEl) taskEl.textContent = (elapsed ? elapsed + " — " : "") + (progress.lastTask || (pct > 0 ? pct + '%' : 'Running...'));
      }
    } catch {
      // silent — job may have finished
    }
  }

  _dashPollTimer = setTimeout(pollRunningDashboard, 5000);
}

// ─────────────────────────────────────────────────────────────
// Load and render jobs
// ─────────────────────────────────────────────────────────────
async function loadJobs() {
  const jobsTable = $("jobs-table");
  const savedList = $("saved-jobs-list");

  if (!jobsTable && !savedList) return;

  if (jobsTable) jobsTable.innerHTML = skeletonRows(3);
  if (savedList) savedList.innerHTML = skeletonRows(3);

  try {
    const jobs = await apiGet("/api/jobs");
    window._allJobs = jobs;

    // Render KPIs + nav badges + ops banner
    if (Array.isArray(jobs)) {
      renderOpsBanner(jobs);
      renderDashboardKPIs(jobs);
      updateNavBadges(jobs);
    }

    // Jobs table (full list page)
    if (jobsTable) {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        jobsTable.innerHTML = `<p class="muted">No jobs yet. Create your first job.</p>`;
      } else {
        const running = jobs.filter(j => j.status === "running").length;
        const completed = jobs.filter(j => j.status === "completed").length;
        const failed = jobs.filter(j => j.lastRunResult === "failed" || j.status === "failed").length;
        const saved = jobs.filter(j => j.status === "saved").length;

        jobsTable.innerHTML = `
          <div class="filter-tabs" id="job-filter-tabs">
            <button class="filter-tab active" data-filter="all" onclick="setJobFilter('all')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>All <span class="filter-count">${jobs.length}</span></button>
            <button class="filter-tab" data-filter="running" onclick="setJobFilter('running')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>Running <span class="filter-count">${running}</span></button>
            <button class="filter-tab" data-filter="completed" onclick="setJobFilter('completed')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>Completed <span class="filter-count">${completed}</span></button>
            <button class="filter-tab" data-filter="failed" onclick="setJobFilter('failed')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Failed <span class="filter-count">${failed}</span></button>
            <button class="filter-tab" data-filter="saved" onclick="setJobFilter('saved')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Ready <span class="filter-count">${saved}</span></button>
          </div>
          <div class="jobs-toolbar">
            <div style="position:relative;flex:1;max-width:300px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:0.4;pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="job-search-input" class="inp" placeholder="Search by name, rack ID, workflow, or SKU..."
                aria-label="Search jobs"
                style="width:100%;padding-left:32px;"
                oninput="debouncedSearchJobs(this.value)" />
            </div>
            <select id="job-workflow-filter" class="inp filter-select" onchange="window._workflowFilter=this.value;saveFilterState();applyDateFilter()">
              <option value="all">All Workflows</option>
              ${_WORKFLOWS_STANDARD.map(w => `<option value="${w.value}">${w.label}</option>`).join("")}
            </select>
            <select id="job-customer-filter" class="inp filter-select" onchange="window._customerFilter=this.value;saveFilterState();applyDateFilter()">
              <option value="all">All Customers</option>
              ${Object.entries(CUSTOMER_DEFINITIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}
            </select>
            <input type="date" id="job-date-from" class="inp" style="max-width:140px;font-size:12px;" title="From date" onchange="applyDateFilter()" />
            <input type="date" id="job-date-to" class="inp" style="max-width:140px;font-size:12px;" title="To date" onchange="applyDateFilter()" />
            <div class="bulk-actions" id="bulk-actions" style="display:none;">
              <span class="muted" id="bulk-count">0 selected</span>
              <button class="btn ghost" onclick="bulkCloneJobs()" title="Duplicate selected jobs with the same files and settings">Clone</button>
              <button class="btn ghost" style="color:#f87171;border-color:rgba(248,113,113,0.3);" onclick="bulkDeleteJobs()" title="Permanently delete selected jobs and all their data">Delete</button>
            </div>
          </div>
          <table class="jobs-table-inner">
            <thead>
              <tr>
                <th style="width:30px;"><input type="checkbox" id="bulk-select-all" onchange="toggleBulkSelectAll(this.checked)" /></th>
                <th><span class="sortable-header${window._sortCol === 'name' ? ' sort-active' : ''}" data-sort="name" onclick="toggleJobSort('name')">Name <span class="sort-arrow">${window._sortCol === 'name' ? (window._sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}</span></span></th>
                <th><span class="sortable-header${window._sortCol === 'workflow' ? ' sort-active' : ''}" data-sort="workflow" onclick="toggleJobSort('workflow')">Workflow <span class="sort-arrow">${window._sortCol === 'workflow' ? (window._sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}</span></span></th>
                <th><span class="sortable-header${window._sortCol === 'hosts' ? ' sort-active' : ''}" data-sort="hosts" onclick="toggleJobSort('hosts')">Hosts <span class="sort-arrow">${window._sortCol === 'hosts' ? (window._sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}</span></span></th>
                <th>Last Run</th>
                <th><span class="sortable-header${window._sortCol === 'created' ? ' sort-active' : ''}" data-sort="created" onclick="toggleJobSort('created')">Created <span class="sort-arrow">${window._sortCol === 'created' ? (window._sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC'}</span></span></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="job-table-body"></tbody>
          </table>
        `;
        // Restore saved filter state (Feature 6)
        const savedFilters = loadFilterState();
        if (savedFilters) {
          window._activeJobFilter = savedFilters.status || "all";
          window._sortCol = savedFilters.sortCol || "created";
          window._sortDir = savedFilters.sortDir || "desc";
          window._workflowFilter = savedFilters.workflow || "all";
          window._customerFilter = savedFilters.customer || "all";

          const searchInput = $("job-search-input");
          if (searchInput && savedFilters.text) searchInput.value = savedFilters.text;
          const dateFrom = $("job-date-from");
          if (dateFrom && savedFilters.dateFrom) dateFrom.value = savedFilters.dateFrom;
          const dateTo = $("job-date-to");
          if (dateTo && savedFilters.dateTo) dateTo.value = savedFilters.dateTo;
          const wfSelect = $("job-workflow-filter");
          if (wfSelect && savedFilters.workflow) wfSelect.value = savedFilters.workflow;
          const custSelect = $("job-customer-filter");
          if (custSelect && savedFilters.customer) custSelect.value = savedFilters.customer;

          qsa(".filter-tab").forEach(t => t.classList.toggle("active", t.dataset.filter === window._activeJobFilter));
        }

        renderJobsFiltered(
          savedFilters ? (savedFilters.text || "") : "",
          window._activeJobFilter || "all"
        );
      }
    }

    // Dashboard recent jobs (card rows)
    if (savedList) {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        savedList.innerHTML = `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;margin-bottom:10px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">No jobs yet</div>
            <div class="muted" style="margin-bottom:12px;">Create your first job to get started with automation.</div>
            <button class="btn primary" onclick="launchWizard()">New Job</button>
          </div>`;
      } else {
        const DASH_LIMIT = 10;
        const hasMore = jobs.length > DASH_LIMIT;

        savedList.innerHTML = jobs.map((job, i) => {
          const extra = hasMore && i >= DASH_LIMIT ? ' style="display:none;"' : "";
          return `<div class="dash-job-wrapper"${extra}>${buildDashJobCard(job)}</div>`;
        }).join("");

        if (hasMore) {
          savedList.innerHTML += `<button class="btn ghost" id="dash-see-more-jobs" style="margin-top:8px;font-size:12px;width:100%;text-align:center;">See more (${jobs.length - DASH_LIMIT} more)</button>`;
          const seeMoreBtn = document.getElementById("dash-see-more-jobs");
          if (seeMoreBtn) {
            seeMoreBtn.addEventListener("click", () => {
              const extras = qsa('.dash-job-wrapper[style*="display:none"]', savedList);
              const showing = extras.length === 0;
              qsa('.dash-job-wrapper', savedList).forEach((el, i) => {
                el.style.display = (showing && i >= DASH_LIMIT) ? "none" : "";
              });
              seeMoreBtn.textContent = showing ? `See more (${jobs.length - DASH_LIMIT} more)` : "Show less";
            });
          }
        }

        // Wire click handlers on entire card row
        qsa('.job-row-card[data-jobid]', savedList).forEach(card => {
          card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            openJobPanel(card.getAttribute("data-jobid"));
          });
        });

        // Wire View buttons
        qsa('button[data-jobid]', savedList).forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openJobPanel(btn.getAttribute("data-jobid"));
          });
        });
      }
    }

    // Start running-job polling if any jobs are running
    const hasRunning = Array.isArray(jobs) && jobs.some(j => j.status === "running");
    if (hasRunning && !_dashPollTimer) {
      _dashPollTimer = setTimeout(pollRunningDashboard, 2000);
    }

    // Onboarding guide (Feature 11) — trigger on first visit
    if (!localStorage.getItem("eca_onboarded")) {
      setTimeout(() => { if (typeof showOnboardingGuide === "function") showOnboardingGuide(); }, 500);
    }

  } catch (e) {
    const msg = `<p class="error">Error loading jobs: ${safeText(e.message)}</p>`;
    if (jobsTable) jobsTable.innerHTML = msg;
    if (savedList) savedList.innerHTML = msg;
  }
}

// ─────────────────────────────────────────────────────────────
// Jobs table (filtered view)
// ─────────────────────────────────────────────────────────────
window.setJobFilter = function (filter) {
  window._activeJobFilter = filter;
  qsa(".filter-tab").forEach(t => t.classList.toggle("active", t.dataset.filter === filter));
  const searchInput = $("job-search-input");
  const q = searchInput ? searchInput.value : "";
  saveFilterState();
  renderJobsFiltered(q, filter);
};

window.applyDateFilter = function () {
  const searchInput = $("job-search-input");
  const q = searchInput ? searchInput.value : "";
  saveFilterState();
  renderJobsFiltered(q, window._activeJobFilter || "all");
};

window.renderJobsFiltered = function (textFilter, statusFilter) {
  const tbody = $("job-table-body");
  if (!tbody) return;
  const jobs = window._allJobs || [];
  const q = (textFilter || "").toLowerCase().trim();
  const sf = (statusFilter || "all").toLowerCase();

  let filtered = jobs;

  // Status filter
  if (sf === "running") filtered = filtered.filter(j => j.status === "running");
  else if (sf === "completed") filtered = filtered.filter(j => j.status === "completed");
  else if (sf === "failed") filtered = filtered.filter(j => j.lastRunResult === "failed" || j.status === "failed");
  else if (sf === "saved") filtered = filtered.filter(j => j.status === "saved");

  // Text filter
  if (q) {
    filtered = filtered.filter(j => {
      const name = safeText(j.jobName || j.name).toLowerCase();
      const rack = safeText(j.rackId || "").toLowerCase();
      const sku  = safeText(j.sku || "").toLowerCase();
      const po   = safeText(j.po || "").toLowerCase();
      const wf   = safeText(j.workflow || "").toLowerCase();
      return name.includes(q) || rack.includes(q) || sku.includes(q) || po.includes(q) || wf.includes(q);
    });
  }

  // Workflow filter (Feature 6)
  const wfFilter = window._workflowFilter || "all";
  if (wfFilter && wfFilter !== "all") {
    filtered = filtered.filter(j => (j.workflow || "").toLowerCase() === wfFilter);
  }

  // Customer filter (Feature 6)
  const custFilter = window._customerFilter || "all";
  if (custFilter && custFilter !== "all") {
    filtered = filtered.filter(j => (j.customer || "").toLowerCase() === custFilter);
  }

  // Date filter
  const dateFrom = $("job-date-from")?.value;
  const dateTo = $("job-date-to")?.value;
  if (dateFrom) {
    const from = new Date(dateFrom);
    filtered = filtered.filter(j => j.createdAt && new Date(j.createdAt) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setDate(to.getDate() + 1);
    filtered = filtered.filter(j => j.createdAt && new Date(j.createdAt) < to);
  }

  // Sort: favorites first (primary), then column sort (secondary)
  filtered.sort((a, b) => {
    const aFav = isFavorite(a.jobId || a.id || a.job_id) ? 0 : 1;
    const bFav = isFavorite(b.jobId || b.id || b.job_id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return sortJobs(a, b, window._sortCol, window._sortDir);
  });

  tbody.innerHTML = "";
  filtered.forEach(job => {
    const jobId = job.jobId || job.id || job.job_id;
    const hostCount = job.hostCount || 0;
    const lastResult = job.lastRunResult || "";
    const lastTags = Array.isArray(job.lastRunTags) && job.lastRunTags.length ? job.lastRunTags.join(", ") : "full";
    const workflow = (job.workflow || "").toLowerCase();
    const wfLabel = (window.WORKFLOW_LABELS && window.WORKFLOW_LABELS[workflow]) || workflow || "\u2014";
    const createdAgo = job.createdAt ? timeAgo(job.createdAt) : "\u2014";

    let lastRunHtml = '<span class="muted">\u2014</span>';
    if (lastResult === "passed") {
      lastRunHtml = `<span class="run-result run-result-passed"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>${lastTags} \u2014 passed</span>`;
    } else if (lastResult === "failed") {
      lastRunHtml = `<span class="run-result run-result-failed"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>${lastTags} \u2014 failed</span>`;
    } else if (job.lastRunId) {
      lastRunHtml = `<span class="muted">${lastTags}</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="bulk-cb" data-jobid="${safeText(jobId)}" onchange="updateBulkCount()" /></td>
      <td>${safeText(job.jobName || job.name)} ${statusBadge(job.status)}</td>
      <td>${safeText(wfLabel)}</td>
      <td>${hostCount ? hostCount + " hosts" : '<span class="muted">\u2014</span>'}</td>
      <td>${lastRunHtml}</td>
      <td class="muted">${safeText(createdAgo)}</td>
      <td>
        <button class="btn ghost" data-jobid="${safeText(jobId)}">View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  qsa('button[data-jobid]', tbody).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openJobPanel(btn.getAttribute("data-jobid"));
    });
  });
};

// ─────────────────────────────────────────────────────────────
// Polling
// ─────────────────────────────────────────────────────────────
let jobRefreshTimer = null;

function startJobPolling() {
  if (jobRefreshTimer) clearInterval(jobRefreshTimer);
  jobRefreshTimer = setInterval(loadJobs, 30000);
}

let healthTimer = null;

async function pollHealth() {
  const dot = $("health-dot");
  try {
    await apiGet("/api/health");
    if (dot) { dot.className = "health-dot health-ok"; dot.title = "Backend connected"; }
    if (_connectionLost) {
      _connectionLost = false;
      _reconnectAttempts = 0;
      showConnectionBanner(false);
      showToast("Connection restored", "success");
    }
  } catch {
    if (dot) { dot.className = "health-dot health-err"; dot.title = "Backend unreachable"; }
    if (!_connectionLost) {
      _connectionLost = true;
      showConnectionBanner(true);
    }
    _reconnectAttempts++;
  }
  healthTimer = setTimeout(pollHealth, 15000);
}

// ─────────────────────────────────────────────────────────────
// Bulk actions
// ─────────────────────────────────────────────────────────────
window.toggleBulkSelectAll = function (checked) {
  qsa(".bulk-cb").forEach(cb => { cb.checked = checked; });
  updateBulkCount();
};

window.updateBulkCount = function () {
  const selected = qsa(".bulk-cb:checked");
  const bulkBar = $("bulk-actions");
  const countEl = $("bulk-count");
  if (bulkBar) bulkBar.style.display = selected.length > 0 ? "flex" : "none";
  if (countEl) countEl.textContent = `${selected.length} selected`;
};

window.bulkDeleteJobs = async function () {
  const selected = qsa(".bulk-cb:checked");
  if (!selected.length) return;
  const ok = await showConfirmAsync(`Delete ${selected.length} job(s) permanently? This cannot be undone.`, {
    title: "Bulk Delete", confirmText: "Delete All", danger: true,
  });
  if (!ok) return;

  let deleted = 0;
  for (const cb of selected) {
    try {
      await apiDelete(`/api/jobs/${encodeURIComponent(cb.dataset.jobid)}`);
      deleted++;
    } catch { /* skip */ }
  }
  showToast(`${deleted} job(s) deleted`, "success");
  loadJobs();
};

window.bulkCloneJobs = async function () {
  const selected = qsa(".bulk-cb:checked");
  if (!selected.length) return;
  const ok = await showConfirmAsync(`Clone ${selected.length} job(s)?`, {
    title: "Bulk Clone", confirmText: "Clone All",
  });
  if (!ok) return;

  let cloned = 0;
  for (const cb of selected) {
    try {
      await apiPostJSON(`/api/jobs/${encodeURIComponent(cb.dataset.jobid)}/clone`, {});
      cloned++;
    } catch { /* skip */ }
  }
  showToast(`${cloned} job(s) cloned`, "success");
  loadJobs();
};

// ─────────────────────────────────────────────────────────────
// Sortable column headers (Feature 3)
// ─────────────────────────────────────────────────────────────
function sortJobs(a, b, col, dir) {
  const mult = dir === "asc" ? 1 : -1;
  switch (col) {
    case "name": {
      const an = safeText(a.jobName || a.name).toLowerCase();
      const bn = safeText(b.jobName || b.name).toLowerCase();
      return mult * an.localeCompare(bn);
    }
    case "workflow": {
      const aw = safeText(a.workflow || "").toLowerCase();
      const bw = safeText(b.workflow || "").toLowerCase();
      return mult * aw.localeCompare(bw);
    }
    case "hosts":
      return mult * ((a.hostCount || 0) - (b.hostCount || 0));
    case "created": {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return mult * (ad - bd);
    }
    default:
      return 0;
  }
}

window.toggleJobSort = function (col) {
  if (window._sortCol === col) {
    window._sortDir = window._sortDir === "asc" ? "desc" : "asc";
  } else {
    window._sortCol = col;
    window._sortDir = col === "name" || col === "workflow" ? "asc" : "desc";
  }
  const searchInput = $("job-search-input");
  const q = searchInput ? searchInput.value : "";
  saveFilterState();
  renderJobsFiltered(q, window._activeJobFilter || "all");
};
