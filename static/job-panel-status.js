// ─────────────────────────────────────────────────────────────
// job-panel-status.js — Status bar, log polling, progress parsing, host matrix
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Parse failed task names from log
// ─────────────────────────────────────────────────────────────
function parseFailedTasksFromLog(logText) {
  const failed = [];
  const lines = (logText || "").split("\n");
  let currentTask = "";
  for (const line of lines) {
    const tm = line.match(/^TASK \[(.+?)\]/);
    if (tm) currentTask = tm[1];
    if (/^fatal:/.test(line) && currentTask) {
      if (!failed.includes(currentTask)) failed.push(currentTask);
    }
  }
  return failed;
}

// ─────────────────────────────────────────────────────────────
// Parse error snippets for each failed task (#6)
// ─────────────────────────────────────────────────────────────
function parseFailedSnippets(logText) {
  const snippets = {};
  const lines = (logText || "").split("\n");
  let currentTask = "";
  for (const line of lines) {
    const tm = line.match(/^TASK \[(.+?)\]/);
    if (tm) currentTask = tm[1];
    if (/^fatal:/.test(line) && currentTask) {
      // Extract the msg portion from fatal line
      const msgMatch = line.match(/"msg":\s*"([^"]{0,200})/);
      if (msgMatch) {
        snippets[currentTask] = msgMatch[1];
      } else {
        // Fallback: take first 150 chars after "fatal:"
        const rest = line.replace(/^fatal:\s*\[.*?\]:\s*/, "").substring(0, 150);
        snippets[currentTask] = rest;
      }
    }
  }
  return snippets;
}

// ─────────────────────────────────────────────────────────────
// Status bar + progress
// ─────────────────────────────────────────────────────────────
function updateStatusBar(status, taskInfo, pct) {
  const bar = $("status-progress-bar");
  const taskEl = $("status-current-task");
  const elapsedEl = $("status-elapsed");
  const fill = $("status-progress-fill");

  if (!bar) return;

  if (status === "running" || status === "stopping") {
    bar.style.display = "block";
    if (fill) {
      if (pct && pct > 0) {
        fill.style.animation = "none";
        fill.style.width = pct + "%";
        fill.style.background = "";
      } else {
        fill.style.animation = "progress-indeterminate 1.4s ease-in-out infinite";
        fill.style.width = "40%";
        fill.style.background = "";
      }
    }
  } else if (status === "completed") {
    bar.style.display = "block";
    if (fill) {
      fill.style.animation = "none";
      fill.style.width = "100%";
      fill.style.background = "linear-gradient(90deg, #4ade80, #22c55e)";
    }
  } else if (status === "stopped" || status === "error") {
    bar.style.display = "block";
    if (fill) {
      fill.style.animation = "none";
      fill.style.width = "100%";
      fill.style.background = status === "error" ? "#f87171" : "#fbbf24";
    }
  } else {
    bar.style.display = "none";
  }

  // Update ARIA on progress bar
  if (fill) {
    const barEl = fill.closest('.progress-bar');
    if (barEl) {
      const val = (status === 'completed' || status === 'stopped' || status === 'error') ? 100 : Math.round(pct || 0);
      barEl.setAttribute('aria-valuenow', val);
    }
  }

  if (taskEl && taskInfo) taskEl.textContent = taskInfo;

  if (elapsedEl && _runStartTime) {
    const elapsed = Math.round((Date.now() - _runStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    elapsedEl.textContent = `Elapsed: ${mins}m ${secs}s`;
  }
}

function parseLogForProgress(logText) {
  const lines = (logText || "").split("\n");
  let taskCount = 0;
  let lastTask = "";
  let completedTasks = 0;

  for (const line of lines) {
    if (line.startsWith("TASK [")) {
      taskCount++;
      const m = line.match(/TASK \[(.+?)\]/);
      if (m) lastTask = m[1];
    }
    if (line.match(/^(ok|changed|fatal|skipping|unreachable):/)) {
      completedTasks++;
    }
  }

  const hasRecap = logText.includes("PLAY RECAP");

  let totalFailed = 0;
  let failedHosts = [];
  let passedHosts = [];
  let hostStats = [];
  if (hasRecap) {
    const recapIdx = logText.indexOf("PLAY RECAP");
    const recapBlock = logText.substring(recapIdx);
    const hostLines = recapBlock.split("\n").slice(1);
    for (const hl of hostLines) {
      const hm = hl.match(/^(\S+)\s+.*ok=(\d+)\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)/);
      if (hm) {
        const host = hm[1];
        const ok = parseInt(hm[2], 10);
        const changed = parseInt(hm[3], 10);
        const unreach = parseInt(hm[4], 10);
        const failed = parseInt(hm[5], 10);
        hostStats.push({ host, ok, changed, unreachable: unreach, failed });
        if (failed > 0) {
          totalFailed += failed;
          failedHosts.push(host);
        } else {
          passedHosts.push(host);
        }
      }
    }
  }

  // Live per-host status (streaming, before PLAY RECAP)
  const liveHostStatus = {};
  for (const line of lines) {
    const m = line.match(/^(ok|changed|fatal|unreachable):\s*\[([^\]]+)\]/);
    if (m) {
      const result = m[1];
      const host = m[2];
      if (!liveHostStatus[host]) {
        liveHostStatus[host] = { ok: 0, changed: 0, failed: 0, unreachable: 0, lastResult: "" };
      }
      const h = liveHostStatus[host];
      if (result === "ok") h.ok++;
      else if (result === "changed") h.changed++;
      else if (result === "fatal") h.failed++;
      else if (result === "unreachable") h.unreachable++;
      h.lastResult = result;
    }
  }

  return { taskCount, completedTasks, lastTask, hasRecap, totalFailed, failedHosts, passedHosts, hostStats, liveHostStatus };
}

function renderHostStatusMatrix(hostStats) {
  const section = $("host-status-section");
  const tableEl = $("host-status-table");
  if (!section || !tableEl || !hostStats.length) return;

  section.style.display = "block";
  let html = '<table class="host-picker-table"><thead><tr><th>Host</th><th>OK</th><th>Changed</th><th>Unreachable</th><th>Failed</th><th>Status</th></tr></thead><tbody>';
  hostStats.forEach(h => {
    const badge = h.failed > 0
      ? '<span class="run-result run-result-failed">FAILED</span>'
      : h.unreachable > 0
        ? '<span class="run-result run-result-failed">UNREACHABLE</span>'
        : '<span class="run-result run-result-passed">PASSED</span>';
    const rowClass = h.failed > 0 ? 'host-row-failed' : h.unreachable > 0 ? 'host-row-unreachable' : 'host-row-passed';
    html += `<tr class="${rowClass}">
      <td>${safeText(h.host)}</td>
      <td>${h.ok}</td>
      <td>${h.changed}</td>
      <td>${h.unreachable}</td>
      <td>${h.failed}</td>
      <td>${badge}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  tableEl.innerHTML = html;
  applyTableRowLimit(tableEl);
}

// ─────────────────────────────────────────────────────────────
// Color-coded log output
// ─────────────────────────────────────────────────────────────
function colorizeLog(text) {
  const lines = text.split("\n");
  return lines.map(line => {
    const escaped = safeText(line);
    if (/^ok:/.test(line))                        return `<span class="log-ok">${escaped}</span>`;
    if (/^changed:/.test(line))                   return `<span class="log-changed">${escaped}</span>`;
    if (/^(fatal|failed|unreachable):/.test(line)) return `<span class="log-fatal">${escaped}</span>`;
    if (/^skipping:/.test(line))                  return `<span class="log-skip">${escaped}</span>`;
    if (/^TASK \[/.test(line))                    return `<span class="log-task">${escaped}</span>`;
    if (/^PLAY[ \[]/.test(line))                  return `<span class="log-play">${escaped}</span>`;
    return escaped;
  }).join("\n");
}

// ─────────────────────────────────────────────────────────────
// Log search, host filter, collapse, download
// ─────────────────────────────────────────────────────────────
window._rawLogText = "";
window._logCollapsed = false;

window.filterLogOutput = function () {
  const logEl = $("job_log_output");
  if (!logEl || !window._rawLogText) return;

  const searchVal = ($("log-search-input")?.value || "").toLowerCase();
  const hostVal = $("log-host-filter")?.value || "";

  let lines = window._rawLogText.split("\n");

  // Host filter: show only lines mentioning that host, plus TASK/PLAY headers
  if (hostVal) {
    lines = lines.filter(line => {
      if (/^(TASK \[|PLAY |PLAY RECAP)/.test(line)) return true;
      if (line.includes(`[${hostVal}]`)) return true;
      if (line.includes(hostVal)) return true;
      return false;
    });
  }

  // Search filter
  if (searchVal) {
    lines = lines.filter(line => line.toLowerCase().includes(searchVal));
  }

  const filtered = lines.join("\n");

  if (window._logCollapsed) {
    logEl.innerHTML = collapsifyLog(filtered);
  } else {
    logEl.innerHTML = colorizeLog(filtered);
  }
};

function collapsifyLog(text) {
  const lines = text.split("\n");
  let html = "";
  let inTask = false;
  let taskLines = [];
  let taskHeader = "";

  function flushTask() {
    if (taskHeader) {
      const escapedHeader = safeText(taskHeader);
      const content = taskLines.map(l => {
        const escaped = safeText(l);
        if (/^ok:/.test(l)) return `<span class="log-ok">${escaped}</span>`;
        if (/^changed:/.test(l)) return `<span class="log-changed">${escaped}</span>`;
        if (/^(fatal|failed|unreachable):/.test(l)) return `<span class="log-fatal">${escaped}</span>`;
        if (/^skipping:/.test(l)) return `<span class="log-skip">${escaped}</span>`;
        return escaped;
      }).join("\n");
      html += `<details class="log-task-section"><summary class="log-task">${escapedHeader}</summary>${content}\n</details>`;
    }
    taskHeader = "";
    taskLines = [];
  }

  for (const line of lines) {
    if (/^TASK \[/.test(line)) {
      flushTask();
      taskHeader = line;
      inTask = true;
    } else if (/^PLAY[ \[]/.test(line)) {
      flushTask();
      inTask = false;
      html += `<span class="log-play">${safeText(line)}</span>\n`;
    } else if (inTask) {
      taskLines.push(line);
    } else {
      html += colorizeLog(line) + "\n";
    }
  }
  flushTask();
  return html;
}

window.toggleLogCollapse = function () {
  window._logCollapsed = !window._logCollapsed;
  const btn = $("btn-log-collapse");
  if (btn) btn.textContent = window._logCollapsed ? "Expand" : "Collapse";
  filterLogOutput();
};

window.downloadLogOutput = function () {
  const text = window._rawLogText || "No log available";
  const searchVal = ($("log-search-input")?.value || "").toLowerCase();
  const hostVal = $("log-host-filter")?.value || "";

  let lines = text.split("\n");
  if (hostVal) {
    lines = lines.filter(line => {
      if (/^(TASK \[|PLAY |PLAY RECAP)/.test(line)) return true;
      return line.includes(hostVal);
    });
  }
  if (searchVal) {
    lines = lines.filter(line => line.toLowerCase().includes(searchVal));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `job-log-${currentJobId || "output"}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Log downloaded", "success");
};

function updateHostFilterDropdown(logText) {
  const sel = $("log-host-filter");
  if (!sel) return;
  const hosts = new Set();
  const lines = logText.split("\n");
  for (const line of lines) {
    const m = line.match(/\[([^\]]+)\]/);
    if (m && /^(ok|changed|fatal|unreachable|skipping):/.test(line)) {
      hosts.add(m[1]);
    }
  }
  const current = sel.value;
  sel.innerHTML = '<option value="">All Hosts</option>' +
    Array.from(hosts).sort().map(h => `<option value="${h}" ${h === current ? "selected" : ""}>${h}</option>`).join("");
}

// ─────────────────────────────────────────────────────────────
// Multi-group status state
// ─────────────────────────────────────────────────────────────
window._multiGroupMode = false;
window._groupLogOffsets = {};
window._groupLogTexts = {};
window._activeGroupTab = "all";

function renderGroupStatusTabs(groups, jobId) {
  const container = $("multi-group-status");
  if (!container) {
    // Inject multi-group status container before the live output section
    const statusSection = $("status-progress-bar");
    if (!statusSection) return;
    const div = document.createElement("div");
    div.id = "multi-group-status";
    statusSection.parentNode.insertBefore(div, statusSection.nextSibling);
  }
  const el = $("multi-group-status");
  if (!el) return;

  const gids = Object.keys(groups);

  // Tab bar
  let tabsHtml = '<div class="group-status-tabs">';
  tabsHtml += `<button class="group-tab ${window._activeGroupTab === "all" ? "active" : ""}" onclick="selectGroupTab('all','${jobId}')">All</button>`;
  gids.forEach(gid => {
    const g = groups[gid];
    const statusIcon = g.status === "running" ? "\u25CF" : g.status === "completed" ? "\u2713" : g.status === "failed" ? "\u2718" : "\u25A0";
    const statusCls = g.status === "running" ? "group-tab-running" : g.status === "completed" ? "group-tab-done" : g.status === "failed" ? "group-tab-failed" : "group-tab-stopped";
    tabsHtml += `<button class="group-tab ${statusCls} ${window._activeGroupTab === gid ? "active" : ""}" onclick="selectGroupTab('${gid}','${jobId}')">${safeText(g.label)} <span class="group-tab-icon">${statusIcon}</span></button>`;
  });
  tabsHtml += '</div>';

  // Progress bars for "All" tab
  let progressHtml = '<div class="group-progress-list">';
  gids.forEach(gid => {
    const g = groups[gid];
    const logText = window._groupLogTexts[gid] || "";
    const progress = parseLogForProgress(logText);
    const pct = progress.taskCount > 0 ? Math.round((progress.completedTasks / progress.taskCount) * 100) : 0;
    const pctDisplay = g.status === "completed" ? 100 : g.status === "failed" ? pct : pct;
    const barColor = g.status === "completed" ? "#4ade80" : g.status === "failed" ? "#f87171" : g.status === "stopped" ? "#fbbf24" : "#3b82f6";

    progressHtml += `<div class="group-progress-item">
      <div class="group-progress-label">
        <span>${safeText(g.label)}</span>
        <span class="muted" style="font-size:11px;">${g.tags && g.tags.length ? g.tags.join(", ") : "full"} | ${g.hosts || "all hosts"}</span>
      </div>
      <div class="group-progress-bar-wrap">
        <div class="progress-bar" role="progressbar" style="height:6px;"><div class="progress-bar-inner" style="width:${pctDisplay}%;background:${barColor};animation:none;"></div></div>
        <span class="group-progress-pct">${pctDisplay}%</span>
      </div>
      <div class="group-progress-actions">
        ${g.status === "running" ? `<button class="btn ghost btn-xs" onclick="stopTaskNow('${jobId}','${gid}')">Stop</button>` : `<span class="muted" style="font-size:11px;">${g.status}</span>`}
      </div>
    </div>`;
  });
  progressHtml += '</div>';

  el.innerHTML = tabsHtml + (window._activeGroupTab === "all" ? progressHtml : "");
}

window.selectGroupTab = function (tab, jobId) {
  window._activeGroupTab = tab;
  // Re-render immediately with current data
  if (tab !== "all") {
    const logEl = $("job_log_output");
    if (logEl) {
      const logText = window._groupLogTexts[tab] || "Loading...";
      window._rawLogText = logText;
      logEl.innerHTML = colorizeLog(logText);
      logEl.scrollTop = logEl.scrollHeight;
      updateHostFilterDropdown(logText);
    }
  }
};

async function pollGroupLog(jobId, gid) {
  const offset = window._groupLogOffsets[gid] || 0;
  const sep = offset > 0 ? "&" : "?";
  const url = `/api/jobs/${encodeURIComponent(jobId)}/log?group=${encodeURIComponent(gid)}${offset > 0 ? "&offset=" + offset : ""}`;
  try {
    const log = await apiGet(url);
    let txt = "";
    if (log && log.log) txt = log.log;
    else if (log && log.text) txt = log.text;

    const cleanTxt = stripAnsi(txt);
    if (offset > 0 && window._groupLogTexts[gid] && cleanTxt) {
      window._groupLogTexts[gid] += cleanTxt;
    } else if (cleanTxt) {
      window._groupLogTexts[gid] = cleanTxt;
    }
    if (log && typeof log.offset === "number") window._groupLogOffsets[gid] = log.offset;
  } catch {
    // Network error — skip this poll cycle
  }
}

// ─────────────────────────────────────────────────────────────
// Log polling (with incremental offset support)
// ─────────────────────────────────────────────────────────────
window._logOffset = 0;

async function pollLog(jobId) {
  if (!currentJobId || currentJobId !== jobId) return;

  try {
    const offsetParam = window._logOffset > 0 ? `?offset=${window._logOffset}` : "";
    const log = await apiGet(`/api/jobs/${encodeURIComponent(jobId)}/log${offsetParam}`);

    // ── Multi-group handling ──
    if (log && log.multiGroup) {
      window._multiGroupMode = true;
      const groups = log.groups || {};
      const gids = Object.keys(groups);

      // Poll each group's log individually
      await Promise.all(gids.map(gid => pollGroupLog(jobId, gid)));

      // Render group tabs + progress
      renderGroupStatusTabs(groups, jobId);

      // Show selected group's log
      const logEl = $("job_log_output");
      if (logEl) {
        if (window._activeGroupTab === "all") {
          // Show combined summary
          let combined = "";
          gids.forEach(gid => {
            const g = groups[gid];
            combined += `\n=== ${g.label} (${g.status}) ===\n`;
            combined += (window._groupLogTexts[gid] || "").slice(-5000) + "\n";
          });
          window._rawLogText = combined;
          logEl.innerHTML = colorizeLog(combined);
        } else {
          const txt = window._groupLogTexts[window._activeGroupTab] || "Loading...";
          window._rawLogText = txt;
          const searchVal = ($("log-search-input")?.value || "").trim();
          const hostVal = $("log-host-filter")?.value || "";
          if (searchVal || hostVal || window._logCollapsed) {
            filterLogOutput();
          } else {
            logEl.innerHTML = colorizeLog(txt);
          }
          updateHostFilterDropdown(txt);
        }
        logEl.scrollTop = logEl.scrollHeight;
      }

      // Update status bar
      const anyRunning = gids.some(gid => groups[gid].status === "running");
      const allDone = gids.every(gid => groups[gid].status !== "running");
      const anyFailed = gids.some(gid => groups[gid].status === "failed");

      if (anyRunning) {
        const runningCount = gids.filter(gid => groups[gid].status === "running").length;
        const doneCount = gids.filter(gid => groups[gid].status !== "running").length;
        updateStatusBar("running", `${runningCount} group(s) running, ${doneCount} done`);
      }

      if (allDone) {
        const banner = $("status-result-banner");
        if (anyFailed) {
          updateStatusBar("completed", "Completed with failures");
          if (banner) {
            banner.className = "status-result-banner result-failed";
            const failedGids = gids.filter(gid => groups[gid].status === "failed");
            const failSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            banner.innerHTML = failSvg + `<span>FAILED \u2014 ${failedGids.length} group(s) failed: ${failedGids.map(gid => groups[gid].label).join(", ")}</span>`;
            banner.style.display = "flex";
          }
        } else {
          updateStatusBar("completed", "All groups completed");
          if (banner) {
            banner.className = "status-result-banner result-passed";
            const passSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            banner.innerHTML = passSvg + `<span>PASSED \u2014 all ${gids.length} groups completed successfully</span>`;
            banner.style.display = "flex";
          }
        }
        _runStartTime = null;
        setRunButtonsDisabled(false);
        loadJobs();
        loadRunHistory(jobId);
        updatePreflightChecklist(jobId);
        updateOverviewRunHistory(jobId);
        return; // Stop polling
      }

      // Continue polling
      const elapsed = _runStartTime ? (Date.now() - _runStartTime) / 1000 : 0;
      let pollDelay = elapsed < 30 ? 1500 : elapsed < 120 ? 2500 : 4000;
      logPollTimer = setTimeout(() => pollLog(jobId), pollDelay);
      return;
    }

    // ── Single-run log handling (unchanged below) ──
    window._multiGroupMode = false;
    // Clear multi-group UI if present
    const mgEl = $("multi-group-status");
    if (mgEl) mgEl.innerHTML = "";
    const logEl = $("job_log_output");
    if (logEl) {
      let txt = "";
      if (typeof log === "string") txt = log;
      else if (log && log.log) txt = log.log;
      else if (log && log.text) txt = log.text;
      else if (log && log.note) txt = log.note;
      else txt = JSON.stringify(log, null, 2);

      const cleanTxt = stripAnsi(txt);
      // Incremental: append new content to existing log if using offset
      if (window._logOffset > 0 && window._rawLogText && cleanTxt) {
        window._rawLogText += cleanTxt;
      } else {
        window._rawLogText = cleanTxt;
      }
      // Update offset for next poll
      if (log && typeof log.offset === "number") window._logOffset = log.offset;
      updateHostFilterDropdown(window._rawLogText);

      // Apply filters if active, otherwise show all
      const searchVal = ($("log-search-input")?.value || "").trim();
      const hostVal = $("log-host-filter")?.value || "";
      if (searchVal || hostVal || window._logCollapsed) {
        filterLogOutput();
      } else {
        logEl.innerHTML = colorizeLog(window._rawLogText);
      }
      logEl.scrollTop = logEl.scrollHeight;

      const jobStatus = log.status || "saved";
      const progress = parseLogForProgress(window._rawLogText);
      const banner = $("status-result-banner");

      if (jobStatus === "running") {
        const pct = progress.taskCount > 0 ? Math.round((progress.completedTasks / progress.taskCount) * 100) : 0;
        let info = "Running...";
        if (progress.lastTask) {
          info = progress.taskCount > 0
            ? `Task ${progress.completedTasks} of ~${progress.taskCount} \u2014 ${progress.lastTask}${pct > 0 ? " (" + pct + "%)" : ""}`
            : `Running: ${progress.lastTask}`;
        }
        // Add ETA to info string for Status tab (#3)
        if (_runStartTime && progress.taskCount > 0 && progress.completedTasks > 0) {
          const elSec = Math.round((Date.now() - _runStartTime) / 1000);
          const p = progress.completedTasks / progress.taskCount;
          if (p > 0.05) {
            const remSec = Math.round((elSec / p) - elSec);
            if (remSec > 0) info += ` ~${Math.floor(remSec / 60)}m ${remSec % 60}s left`;
          }
        }
        updateStatusBar("running", info, pct);
        if (banner) banner.style.display = "none";

        // Auto-expand live output when job is running
        const liveContent = $("live-output-content");
        const liveChevron = $("live-output-chevron");
        if (liveContent && liveContent.classList.contains("collapsed")) {
          liveContent.classList.remove("collapsed");
          if (liveChevron) liveChevron.classList.add("expanded");
        }

        // Update Overview tab live status
        const ovStatus = $("overview-running-status");
        if (ovStatus) ovStatus.style.display = "";
        const ovTask = $("overview-running-task");
        if (ovTask) ovTask.textContent = safeText(info);
        const ovElapsed = $("overview-running-elapsed");
        const ovProgress = $("ov-live-progress");
        if (ovElapsed && _runStartTime) {
          const elapsed = Math.round((Date.now() - _runStartTime) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          let elStr = `${mins}m ${secs}s`;
          if (progress.taskCount > 0 && progress.completedTasks > 0) {
            const p = progress.completedTasks / progress.taskCount;
            if (p > 0.05) {
              const totalEstSec = Math.round(elapsed / p);
              const remSec = totalEstSec - elapsed;
              if (remSec > 0) {
                elStr += ` \u2022 ~${Math.floor(remSec / 60)}m ${remSec % 60}s left`;
              }
            }
            if (ovProgress) ovProgress.style.width = `${Math.min(Math.round(p * 100), 100)}%`;
          }
          ovElapsed.textContent = elStr;
        }

        // Throttled refresh of Tasks Completed card (~10s)
        const now = Date.now();
        if (now - _lastPreflightRefresh > 10000) {
          _lastPreflightRefresh = now;
          updatePreflightChecklist(jobId);
          updateOverviewRunHistory(jobId);
        }

        // Live per-host status during run
        const liveHosts = Object.keys(progress.liveHostStatus || {});
        if (liveHosts.length > 0) {
          const liveStats = liveHosts.map(host => {
            const s = progress.liveHostStatus[host];
            return { host, ok: s.ok, changed: s.changed, unreachable: s.unreachable, failed: s.failed };
          });
          renderHostStatusMatrix(liveStats);
        }
      } else if (jobStatus === "completed" || progress.hasRecap) {
        updateStatusBar("completed", "Completed");
        _runStartTime = null;
        setRunButtonsDisabled(false);
        updateTabChecks(jobId);
        updateRunButtonState(jobId);
        updateJobTimeline(jobId);

        const result = progress.totalFailed > 0 ? "failed" : "passed";
        if (banner) {
          if (progress.totalFailed > 0) {
            banner.className = "status-result-banner result-failed";
            let msg = `FAILED \u2014 ${progress.totalFailed} task(s) failed`;
            if (progress.failedHosts.length) msg += ` on ${progress.failedHosts.join(", ")}`;
            _lastFailedTasks = parseFailedTasksFromLog(cleanTxt);
            const failSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            // Build detailed failure info (#6)
            let detailHtml = "";
            if (_lastFailedTasks.length) {
              const snippets = parseFailedSnippets(cleanTxt);
              detailHtml = `<div class="failed-tasks-detail"><h5>Failed Tasks</h5>`;
              _lastFailedTasks.forEach(ft => {
                const snippet = snippets[ft] || "";
                detailHtml += `<div class="failed-task-item"><span class="failed-task-name">\u2718 ${safeText(ft)}</span><span class="failed-task-snippet">${safeText(snippet)}</span></div>`;
              });
              detailHtml += `</div>`;
            }
            if (_lastFailedTasks.length) {
              banner.innerHTML = failSvg + safeText(msg) + ` <button class="btn ghost retry-failed-btn" onclick="retryFailedTasks()">Retry Failed Tasks</button>` + detailHtml;
            } else {
              banner.innerHTML = failSvg + `<span>${safeText(msg)}</span>`;
            }
          } else {
            banner.className = "status-result-banner result-passed";
            const passSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            banner.innerHTML = passSvg + `<span>PASSED \u2014 all tasks completed successfully</span>`;
            _lastFailedTasks = [];
          }
          banner.style.display = "block";
        }

        // Pulse animation on status badges (Feature 11)
        qsa('.status-badge', $("job-panel")).forEach(badge => {
          badge.classList.add("badge-pulse");
          setTimeout(() => badge.classList.remove("badge-pulse"), 600);
        });

        // Browser notification
        if (window.notifyJobComplete) {
          const panelTitle = qs(".title-main");
          const jobName = panelTitle ? panelTitle.textContent.trim() : jobId;
          window.notifyJobComplete(jobName, result);
        }

        if (progress.hostStats.length) renderHostStatusMatrix(progress.hostStats);

        loadJobs();
        loadRunHistory(jobId);
        loadTsrStatus(jobId);
        updatePreflightChecklist(jobId);
        updateOverviewRunHistory(jobId);
        return;
      } else if (jobStatus === "stopped") {
        updateStatusBar("stopped", "Stopped");
        _runStartTime = null;
        setRunButtonsDisabled(false);

        if (banner) {
          banner.className = "status-result-banner result-stopped";
          const stopSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>';
          banner.innerHTML = stopSvg + '<span>STOPPED</span>';
          banner.style.display = "flex";
        }

        loadJobs();
        loadRunHistory(jobId);
        updatePreflightChecklist(jobId);
        updateOverviewRunHistory(jobId);
        return;
      }

      const elapsedEl = $("status-elapsed");
      if (elapsedEl && _runStartTime) {
        const elapsed = Math.round((Date.now() - _runStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        let elapsedStr = `Elapsed: ${mins}m ${secs}s`;

        // Estimated completion
        if (progress.taskCount > 0 && progress.completedTasks > 0) {
          const pct = progress.completedTasks / progress.taskCount;
          if (pct > 0.05) {
            const totalEstSec = Math.round(elapsed / pct);
            const remainingSec = totalEstSec - elapsed;
            if (remainingSec > 0) {
              const rm = Math.floor(remainingSec / 60);
              const rs = remainingSec % 60;
              elapsedStr += ` \u2022 ~${rm}m ${rs}s remaining`;
            }
          }
        }
        elapsedEl.textContent = elapsedStr;
      }
    }

    // Connection restored
    if (_connectionLost) {
      _connectionLost = false;
      _reconnectAttempts = 0;
      showConnectionBanner(false);
      showToast("Connection restored", "success");
    }
  } catch {
    if (!_connectionLost) {
      _connectionLost = true;
      showConnectionBanner(true);
    }
    _reconnectAttempts++;
    // After 3 failures, update banner with attempt count
    if (_reconnectAttempts >= 3) {
      const banner = $("connection-banner");
      if (banner) banner.innerHTML = `Connection lost &mdash; reconnecting (attempt ${_reconnectAttempts})...`;
    }
  }

  // Adaptive polling (#7): faster at start, slower for long-running jobs
  const elapsed = _runStartTime ? (Date.now() - _runStartTime) / 1000 : 0;
  let pollDelay;
  if (_connectionLost) pollDelay = Math.min(5000 + _reconnectAttempts * 2000, 15000);
  else if (elapsed < 30) pollDelay = 1500;
  else if (elapsed < 120) pollDelay = 2500;
  else pollDelay = 4000;
  logPollTimer = setTimeout(() => pollLog(jobId), pollDelay);
}

function startLogPolling(jobId) {
  if (logPollTimer) clearTimeout(logPollTimer);
  window._logOffset = 0;
  window._rawLogText = "";
  window._multiGroupMode = false;
  window._groupLogOffsets = {};
  window._groupLogTexts = {};
  window._activeGroupTab = "all";
  logPollTimer = setTimeout(() => pollLog(jobId), 800);
}
