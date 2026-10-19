/* PetersWeb Solutions admin dashboard. Vanilla JS; no client-side secrets or local storage. */
(function () {
  "use strict";

  var $ = function (selector, context) { return (context || document).querySelector(selector); };
  var $$ = function (selector, context) { return Array.prototype.slice.call((context || document).querySelectorAll(selector)); };
  var labels = {
    inbox: "Inbox",
    standby: "Standby Projects",
    ongoing: "On-going Projects",
    finished: "Finished Projects",
    finished_monthly: "Finished Projects with monthly payments",
    search: "Search",
    statistics: "Project Statistics"
  };
  var descriptions = {
    inbox: "New client inquiries waiting for review.",
    standby: "Prospective projects waiting for the next step.",
    ongoing: "Active projects and their payment and domain details.",
    finished: "Completed projects with project payments in full.",
    finished_monthly: "Completed projects with monthly payments still due.",
    search: "Search by business name, payment status, or domain renewal date.",
    statistics: "Current calendar-month inquiries, project movement, income, and receivables."
  };
  var state = { inquiries: [], stage: "inbox", counts: {}, unread: 0, selected: null, busy: false };
  var loadingScreen = $("#loading-screen");
  var loginScreen = $("#login-screen");
  var dashboard = $("#admin-shell");
  var loginForm = $("#login-form");
  var loginMessage = $("#login-message");
  var loginButton = $("#login-submit");
  var searchInput = $("#search-input");
  var searchPaymentFilter = $("#search-payment-filter");
  var searchRenewalFilter = $("#search-renewal-filter");
  var searchFilters = $("#search-filters");
  var recordList = $("#record-list");
  var emptyState = $("#empty-state");
  var dashboardMessage = $("#dashboard-message");
  var listPanel = $("#list-panel");
  var statisticsPanel = $("#statistics-panel");
  var renewalAlerts = $("#renewal-alerts");
  var renewalAlertList = $("#renewal-alert-list");
  var dialog = $("#detail-dialog");
  var saveMessage = $("#detail-save-message");
  var projectForm = $("#project-form");
  var refreshTimer = null;

  function message(el, text, stateName) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("is-error", "is-success");
    if (stateName) el.classList.add("is-" + stateName);
  }

  async function api(method, payload) {
    var response;
    try {
      response = await fetch("/api/admin", {
        method: method || "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: payload ? { "Content-Type": "application/json", "Accept": "application/json" } : { "Accept": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined
      });
    } catch (err) {
      throw new Error("We couldn't reach the admin service. Check your connection and try again.");
    }
    var body = null;
    try { body = await response.json(); } catch (err) { /* Non-JSON response */ }
    if (!response.ok || !body || body.ok !== true) {
      var fallback = response.status === 503
        ? "Admin sign-in hasn't been connected yet. Complete the Supabase and Vercel setup first."
        : response.status === 401
          ? "Please sign in to continue."
          : "The request could not be completed. Please try again.";
      throw new Error(body && body.error ? body.error : fallback);
    }
    return body;
  }

  function showLogin(text) {
    if (loadingScreen) loadingScreen.hidden = true;
    if (dashboard) dashboard.hidden = true;
    if (loginScreen) loginScreen.hidden = false;
    if (text) message(loginMessage, text, "error");
    var email = $("#login-email");
    if (email) email.focus({ preventScroll: true });
  }

  function showDashboard(data) {
    if (loadingScreen) loadingScreen.hidden = true;
    if (loginScreen) loginScreen.hidden = true;
    if (dashboard) dashboard.hidden = false;
    state.inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
    state.counts = data.counts || {};
    state.unread = Number(data.unread_count || 0);
    var signedIn = $("#signed-in-email");
    if (signedIn) signedIn.textContent = data.email || "Admin account";
    updateCounts();
    renderRenewalAlerts();
    renderStatistics();
    renderList();
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(function () {
      if (!document.hidden && !(dialog && dialog.open)) loadDashboard(false);
    }, 30000);
  }

  async function loadDashboard(showErrors) {
    try {
      var data = await api("GET");
      showDashboard(data);
      if (showErrors) {
        message(dashboardMessage, "", "");
        message($("#statistics-message"), "", "");
      }
      return true;
    } catch (err) {
      if (err.message === "Please sign in to continue.") {
        showLogin("");
      } else if (loginScreen && !loginScreen.hidden) {
        showLogin(err.message);
      } else if (dashboard && dashboard.hidden) {
        showLogin(err.message);
      } else if (showErrors) {
        if (state.stage === "statistics") message($("#statistics-message"), err.message, "error");
        else message(dashboardMessage, err.message, "error");
      }
      return false;
    }
  }

  function currency(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "Not set";
    try {
      return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value));
    } catch (err) {
      return "₱" + Number(value).toFixed(2);
    }
  }

  function localDateFromISO(value) {
    if (!value || typeof value !== "string") return null;
    var match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    var result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(result.getTime()) ? null : result;
  }

  function todayISO() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function readableDate(value) {
    if (!value) return "—";
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? localDateFromISO(String(value)) : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function dateInCurrentMonth(value) {
    if (!value) return false;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? localDateFromISO(String(value)) : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return false;
    var now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function daysUntilISO(value) {
    var due = localDateFromISO(String(value || ""));
    if (!due) return null;
    due.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86400000);
  }

  function addOneMonth(value) {
    var date = localDateFromISO(String(value || ""));
    if (!date) date = localDateFromISO(todayISO());
    var nextMonthIndex = date.getMonth() + 1;
    var year = date.getFullYear() + Math.floor(nextMonthIndex / 12);
    var monthIndex = nextMonthIndex % 12;
    var day = date.getDate();
    var lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return year + "-" + String(monthIndex + 1).padStart(2, "0") + "-" + String(Math.min(day, lastDay)).padStart(2, "0");
  }

  function titleCase(value) {
    var mapping = {
      medical: "Medical / Healthcare", resort: "Resort / Hospitality", spa: "Spa / Wellness",
      dental: "Dental Clinic", restaurant: "Restaurant / Food", events: "Events / Weddings",
      services: "Professional Services", retail: "Retail / E-commerce", other: "Other",
      unsure: "Not sure yet", basic: "Basic", pro: "Pro", business: "Business", custom: "Custom"
    };
    return mapping[value] || (value ? String(value) : "Not provided");
  }

  function updateCounts() {
    var counts = state.counts || {};
    var inboxBadge = $("#badge-inbox");
    if (inboxBadge) inboxBadge.textContent = String(state.unread || 0);
    ["standby", "ongoing", "finished", "finished_monthly"].forEach(function (stage) {
      var badge = $("#badge-" + stage.replace("_", "-"));
      if (badge) badge.textContent = String(counts[stage] || 0);
    });
    var values = {
      "#summary-unread": state.unread || 0,
      "#summary-standby": counts.standby || 0,
      "#summary-ongoing": counts.ongoing || 0,
      "#summary-finished": counts.finished || 0,
      "#summary-finished-monthly": counts.finished_monthly || 0
    };
    Object.keys(values).forEach(function (selector) {
      var el = $(selector);
      if (el) el.textContent = String(values[selector]);
    });
  }

  function cell(label, value, extraClass) {
    var wrap = document.createElement("div");
    wrap.className = "record-cell" + (extraClass ? " " + extraClass : "");
    var labelEl = document.createElement("span");
    labelEl.textContent = label;
    var valueEl = document.createElement("strong");
    valueEl.textContent = value || "—";
    wrap.appendChild(labelEl);
    wrap.appendChild(valueEl);
    return wrap;
  }

  function mainCell(item) {
    var wrap = document.createElement("div");
    wrap.className = "record-main";
    var name = document.createElement("strong");
    name.className = "record-name";
    if (item.stage === "inbox" && !item.is_read) {
      var dot = document.createElement("span");
      dot.className = "unread-dot";
      dot.setAttribute("aria-label", "Unread");
      name.appendChild(dot);
    }
    name.appendChild(document.createTextNode(item.name || "Unnamed inquiry"));
    var business = document.createElement("button");
    business.className = "record-business";
    business.type = "button";
    business.textContent = item.business || "Business not provided";
    business.setAttribute("aria-label", "Open details for " + (item.business || item.name || "this client"));
    business.addEventListener("click", function () { openDetails(item); });
    wrap.appendChild(name);
    wrap.appendChild(business);
    return wrap;
  }

  function nextDuePayment(item) {
    var rows = Array.isArray(item.payments) ? item.payments : [];
    var due = rows.filter(function (payment) { return payment && payment.status === "due"; })
      .sort(function (a, b) { return String(a.due_date || "").localeCompare(String(b.due_date || "")); })[0];
    if (!due) return "None due";
    return currency(due.amount) + " · " + readableDate(due.due_date);
  }

  function makeRecord(item) {
    var article = document.createElement("article");
    article.className = "record-card record-card--" + state.stage + (item.stage === "inbox" && !item.is_read ? " is-unread" : "");
    article.appendChild(mainCell(item));
    var pkg = titleCase(item.agreed_package || item.package_interest);
    if (state.stage === "inbox") {
      article.appendChild(cell("Package interest", titleCase(item.package_interest), "record-cell--first"));
      article.appendChild(cell("Received", readableDate(item.created_at), "record-cell--second"));
      article.appendChild(cell("Reference", item.reference || "—", "record-cell--extra"));
    } else if (state.stage === "standby") {
      article.appendChild(cell("Package interest", titleCase(item.package_interest), "record-cell--first"));
      article.appendChild(cell("Received", readableDate(item.created_at), "record-cell--second"));
      article.appendChild(cell("Email", item.email || "—", "record-cell--extra"));
    } else if (state.stage === "ongoing") {
      var addonSummary = Array.isArray(item.addons) && item.addons.length
        ? item.addons.map(function (addon) { return (addon.name || "Add-on") + " · " + currency(addon.amount); }).join(", ")
        : "None";
      article.appendChild(cell("Package", pkg, "record-cell--first"));
      article.appendChild(cell("Agreed total", currency(item.total_price), "record-cell--second"));
      article.appendChild(cell("Paid", currency(item.total_paid), "record-cell--extra"));
      article.appendChild(cell("Balance", currency(item.balance), "record-cell--extra"));
      article.appendChild(cell("Add-ons", addonSummary, "record-cell--extra"));
      article.appendChild(cell("Domain", item.domain_name || "Not set", "record-cell--extra"));
      article.appendChild(cell("Renewal", readableDate(item.domain_renewal_date), "record-cell--extra"));
    } else if (state.stage === "finished_monthly") {
      article.appendChild(cell("Package", pkg, "record-cell--first"));
      article.appendChild(cell("Payment", item.payment_status || "Not set", "record-cell--second"));
      article.appendChild(cell("Next payment", nextDuePayment(item), "record-cell--extra"));
      article.appendChild(cell("Domain", item.domain_name || "Not set", "record-cell--extra"));
      article.appendChild(cell("Renewal", readableDate(item.domain_renewal_date), "record-cell--extra"));
    } else if (state.stage === "search") {
      article.appendChild(cell("Package", pkg, "record-cell--first"));
      article.appendChild(cell("Payment", item.payment_status || "Not set", "record-cell--second"));
      article.appendChild(cell("Balance", currency(item.balance), "record-cell--extra"));
      article.appendChild(cell("Domain", item.domain_name || "Not set", "record-cell--extra"));
      article.appendChild(cell("Renewal", readableDate(item.domain_renewal_date), "record-cell--extra"));
    } else {
      article.appendChild(cell("Package", pkg, "record-cell--first"));
      article.appendChild(cell("Payment", item.payment_status || "Not set", "record-cell--second"));
      article.appendChild(cell("Balance", currency(item.balance), "record-cell--extra"));
      article.appendChild(cell("Domain", item.domain_name || "Not set", "record-cell--extra"));
      article.appendChild(cell("Renewal", readableDate(item.domain_renewal_date), "record-cell--extra"));
    }

    var open = document.createElement("button");
    open.className = "record-open";
    open.type = "button";
    open.textContent = "View details";
    open.addEventListener("click", function () { openDetails(item); });
    article.appendChild(open);
    return article;
  }

  function hasRenewalWithin30Days(item) {
    var days = daysUntilISO(item.domain_renewal_date);
    return days !== null && days <= 30;
  }

  function renewalText(days) {
    if (days < 0) return "Overdue by " + Math.abs(days) + (Math.abs(days) === 1 ? " day" : " days");
    if (days === 0) return "Due today";
    return "Due in " + days + (days === 1 ? " day" : " days");
  }

  function renderRenewalAlerts() {
    if (!renewalAlerts || !renewalAlertList) return;
    var items = state.inquiries.filter(function (item) {
      return item.domain_renewal_date && hasRenewalWithin30Days(item);
    }).sort(function (a, b) { return String(a.domain_renewal_date).localeCompare(String(b.domain_renewal_date)); });
    renewalAlertList.replaceChildren();
    items.forEach(function (item) {
      var days = daysUntilISO(item.domain_renewal_date);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "renewal-alert-item";
      button.setAttribute("aria-label", "Open " + (item.business || item.name || "project") + " domain renewal details");
      var project = document.createElement("strong");
      project.textContent = item.business || item.name || "Unnamed project";
      var domain = document.createElement("span");
      domain.textContent = [item.domain_name || "Domain not set", item.domain_provider || ""].filter(Boolean).join(" · ");
      var status = document.createElement("em");
      status.textContent = renewalText(days) + " · " + readableDate(item.domain_renewal_date);
      button.append(project, domain, status);
      button.addEventListener("click", function () { openDetails(item); });
      renewalAlertList.appendChild(button);
    });
    renewalAlerts.hidden = items.length === 0;
    var count = $("#renewal-alert-count");
    if (count) count.textContent = String(items.length);
  }

  function renderStatistics() {
    var now = new Date();
    var monthLabel = $("#statistics-month");
    if (monthLabel) monthLabel.textContent = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(now);
    var inquiries = 0;
    var ongoing = 0;
    var finished = 0;
    var income = 0;
    var receivable = 0;
    state.inquiries.forEach(function (item) {
      if (dateInCurrentMonth(item.created_at)) inquiries += 1;
      if (dateInCurrentMonth(item.ongoing_at)) ongoing += 1;
      if (dateInCurrentMonth(item.completed_at)) finished += 1;
      (Array.isArray(item.payments) ? item.payments : []).forEach(function (payment) {
        if (!payment || !Number.isFinite(Number(payment.amount))) return;
        if (payment.status === "paid" && dateInCurrentMonth(payment.received_date || payment.date)) income += Number(payment.amount);
        if (payment.status === "due" && dateInCurrentMonth(payment.due_date)) receivable += Number(payment.amount);
      });
    });
    [["#stat-inquiries", inquiries], ["#stat-ongoing", ongoing], ["#stat-finished", finished]].forEach(function (entry) {
      var el = $(entry[0]);
      if (el) el.textContent = String(entry[1]);
    });
    var incomeEl = $("#stat-income");
    var receivableEl = $("#stat-receivable");
    if (incomeEl) incomeEl.textContent = currency(income);
    if (receivableEl) receivableEl.textContent = currency(receivable);
  }

  function renderList() {
    if (!recordList) return;
    var refreshAction = $("#refresh-button");
    if (refreshAction) refreshAction.textContent = state.stage === "statistics" ? "Refresh data" : "Refresh inbox";
    var isStats = state.stage === "statistics";
    if (listPanel) listPanel.hidden = isStats;
    if (statisticsPanel) statisticsPanel.hidden = !isStats;
    if (isStats) {
      var statsTitle = $("#stage-heading");
      var statsSub = $("#stage-description");
      if (statsTitle) statsTitle.textContent = labels.statistics;
      if (statsSub) statsSub.textContent = descriptions.statistics;
    } else {
      var title = $("#stage-heading");
      var subtitle = $("#stage-description");
      var listTitle = $("#list-title");
      var countLine = $("#list-count");
      if (title) title.textContent = labels[state.stage] || labels.inbox;
      if (subtitle) subtitle.textContent = descriptions[state.stage] || descriptions.inbox;
      if (listTitle) listTitle.textContent = labels[state.stage] || labels.inbox;
      $$("[data-stage]").forEach(function (button) {
        var active = button.getAttribute("data-stage") === state.stage;
        button.classList.toggle("is-active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      if (searchFilters) searchFilters.hidden = state.stage !== "search";
      if (searchInput) {
        searchInput.placeholder = state.stage === "search" ? "Search business name" : "Search name or business";
        searchInput.setAttribute("aria-label", state.stage === "search" ? "Search by business name" : "Search this section");
      }
      var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
      var records = state.stage === "search"
        ? state.inquiries.slice()
        : state.inquiries.filter(function (item) { return item.stage === state.stage; });
      if (query) {
        records = records.filter(function (item) {
          var fields = state.stage === "search"
            ? [item.business]
            : [item.name, item.business, item.email, item.phone, item.reference, item.domain_name];
          return fields.join(" ").toLowerCase().indexOf(query) !== -1;
        });
      }
      if (state.stage === "search" && searchPaymentFilter && searchPaymentFilter.value !== "all") {
        records = records.filter(function (item) {
          var paid = item.payment_status === "Paid";
          return searchPaymentFilter.value === "paid" ? paid : !paid;
        });
      }
      if (state.stage === "search" && searchRenewalFilter && searchRenewalFilter.value === "near") {
        records = records.filter(hasRenewalWithin30Days);
      }
      recordList.replaceChildren();
      records.forEach(function (item) { recordList.appendChild(makeRecord(item)); });
      if (countLine) countLine.textContent = records.length + (records.length === 1 ? " record" : " records");
      if (emptyState) emptyState.hidden = records.length > 0;
      if (records.length === 0) {
        var emptyTitle = $("#empty-title");
        var emptyCopy = $("#empty-copy");
        if (emptyTitle) emptyTitle.textContent = query || state.stage === "search" ? "No matching records" : (state.stage === "inbox" ? "No new inquiries yet" : "No projects in this section yet");
        if (emptyCopy) emptyCopy.textContent = query || state.stage === "search"
          ? "Try another business name or adjust the payment and renewal filters."
          : (state.stage === "inbox"
            ? "New website inquiries will appear here as they are submitted."
            : "Move an inquiry into this stage and it will appear here.");
      }
    }
    $$("[data-stage]").forEach(function (button) {
      var active = button.getAttribute("data-stage") === state.stage;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function setDetailValue(key, value) {
    var el = $("[data-detail='" + key + "']", dialog);
    if (!el) return;
    el.replaceChildren();
    if (key === "current_website" && value) {
      try {
        var url = new URL(value);
        if (url.protocol === "http:" || url.protocol === "https:") {
          var a = document.createElement("a");
          a.href = url.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = value;
          el.appendChild(a);
          return;
        }
      } catch (err) { /* show plain text */ }
    }
    if (key === "phone" && value) {
      var phoneValue = String(value);
      var telValue = phoneValue.replace(/[^\d+]/g, "");
      if (/^\+?\d+$/.test(telValue)) {
        var phoneLink = document.createElement("a");
        phoneLink.href = "tel:" + telValue;
        phoneLink.textContent = phoneValue;
        el.appendChild(phoneLink);
        return;
      }
    }
    el.textContent = value || "—";
  }

  function clearEditorRows(container) {
    if (container) container.replaceChildren();
  }

  function addAddonRow(addon) {
    var list = $("#addons-list");
    if (!list) return;
    var row = document.createElement("div");
    row.className = "editor-row editor-row--addon";
    var name = document.createElement("input");
    name.type = "text"; name.maxLength = 100; name.placeholder = "Add-on"; name.setAttribute("aria-label", "Add-on name");
    name.value = addon && addon.name ? addon.name : "";
    var amount = document.createElement("input");
    amount.type = "number"; amount.min = "0"; amount.step = "0.01"; amount.inputMode = "decimal"; amount.placeholder = "Amount ₱"; amount.setAttribute("aria-label", "Add-on amount in pesos");
    amount.value = addon && addon.amount !== undefined ? String(addon.amount) : "";
    var remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove-row"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove add-on");
    remove.addEventListener("click", function () { row.remove(); updateBalancePreview(); });
    name.addEventListener("input", updateBalancePreview);
    amount.addEventListener("input", updateBalancePreview);
    row.append(name, amount, remove);
    list.appendChild(row);
  }

  function paymentField(labelText, control, modifier) {
    var label = document.createElement("label");
    label.className = "payment-field" + (modifier ? " " + modifier : "");
    var span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function paymentRowsInEditor() {
    return $$(".editor-row--payment", dialog);
  }

  function newDueDateFrom(row) {
    var input = $("input[type='date']", row);
    return addOneMonth(input && input.value ? input.value : todayISO());
  }

  function maybeAddNextMonthlyRow(sourceRow) {
    var type = $("select[data-payment-field='type']", sourceRow);
    var amountInput = $("input[data-payment-field='amount']", sourceRow);
    var scope = $("select[data-payment-field='scope']", sourceRow);
    if (!type || type.value !== "monthly" || !amountInput || !scope) return;
    var sourceId = sourceRow.dataset.id;
    var seriesId = sourceRow.dataset.seriesId || sourceId;
    var dueInput = $("input[data-payment-field='due_date']", sourceRow);
    var sourceDate = dueInput && dueInput.value ? dueInput.value : todayISO();
    var rows = paymentRowsInEditor();
    var hasNext = rows.some(function (row) {
      if (row === sourceRow) return false;
      var rowSeries = row.dataset.seriesId || row.dataset.id;
      var rowStatus = $("select[data-payment-field='status']", row);
      var rowDate = $("input[data-payment-field='due_date']", row);
      return rowSeries === seriesId && rowStatus && rowStatus.value === "due" && rowDate && rowDate.value > sourceDate;
    });
    if (hasNext) return;
    var amount = readAmount(amountInput);
    if (amount === null) return;
    var nextType = "monthly";
    var nextAmount = amount;
    if (scope.value === "project") {
      var total = readAmount($("#total-price"));
      if (total !== null) {
        var paid = 0;
        rows.forEach(function (row) {
          var rowStatus = $("select[data-payment-field='status']", row);
          var rowScope = $("select[data-payment-field='scope']", row);
          var rowAmount = readAmount($("input[data-payment-field='amount']", row));
          if (rowStatus && rowStatus.value === "paid" && rowScope && rowScope.value === "project" && rowAmount !== null) paid += rowAmount;
        });
        var remaining = Math.max(0, total - paid);
        if (remaining <= 0.005) return;
        nextAmount = Math.min(amount, remaining);
        if (nextAmount <= remaining && Math.abs(nextAmount - remaining) < 0.005) nextType = "final_payment";
      }
    }
    addPaymentRow({
      id: makeId(),
      series_id: seriesId,
      generated_from: sourceId,
      type: nextType,
      scope: scope.value,
      amount: nextAmount,
      due_date: newDueDateFrom(sourceRow),
      status: "due"
    });
  }

  function removeGeneratedNextRows(sourceId) {
    paymentRowsInEditor().forEach(function (row) {
      var status = $("select[data-payment-field='status']", row);
      if (row.dataset.generatedFrom === sourceId && status && status.value === "due") row.remove();
    });
  }

  function addPaymentRow(payment) {
    var list = $("#payments-list");
    if (!list) return;
    payment = payment || {};
    var row = document.createElement("div");
    row.className = "editor-row editor-row--payment";
    row.dataset.id = payment.id || makeId();
    row.dataset.seriesId = payment.series_id || (payment.type === "monthly" ? row.dataset.id : "");
    row.dataset.generatedFrom = payment.generated_from || "";
    row.dataset.status = payment.status || "due";

    var type = document.createElement("select");
    type.dataset.paymentField = "type";
    type.setAttribute("aria-label", "Payment type");
    [["down_payment", "Down payment"], ["installment", "Installment"], ["final_payment", "Final payment"], ["monthly", "Monthly"]].forEach(function (entry) {
      var option = document.createElement("option"); option.value = entry[0]; option.textContent = entry[1]; type.appendChild(option);
    });
    type.value = payment.type || "installment";
    var dueDate = document.createElement("input");
    dueDate.type = "date"; dueDate.dataset.paymentField = "due_date"; dueDate.setAttribute("aria-label", "Next payment date");
    dueDate.value = payment.due_date || payment.date || todayISO();
    var amount = document.createElement("input");
    amount.type = "number"; amount.min = "0"; amount.step = "0.01"; amount.inputMode = "decimal"; amount.placeholder = "₱ amount"; amount.dataset.paymentField = "amount"; amount.setAttribute("aria-label", "Payment amount in pesos");
    amount.value = payment.amount !== undefined && payment.amount !== null ? String(payment.amount) : "";
    var scope = document.createElement("select");
    scope.dataset.paymentField = "scope"; scope.setAttribute("aria-label", "Payment balance category");
    [["project", "Project balance"], ["recurring", "Separate monthly fee"]].forEach(function (entry) {
      var option = document.createElement("option"); option.value = entry[0]; option.textContent = entry[1]; scope.appendChild(option);
    });
    scope.value = payment.scope || (type.value === "monthly" ? "recurring" : "project");
    row.dataset.scopeExplicit = payment.scope ? "1" : "0";
    row.dataset.paymentType = type.value;
    var status = document.createElement("select");
    status.dataset.paymentField = "status"; status.setAttribute("aria-label", "Payment status");
    [["due", "Due"], ["paid", "Paid"]].forEach(function (entry) {
      var option = document.createElement("option"); option.value = entry[0]; option.textContent = entry[1]; status.appendChild(option);
    });
    status.value = payment.status || "due";
    row.dataset.status = status.value;
    var receivedDate = document.createElement("input");
    receivedDate.type = "date"; receivedDate.dataset.paymentField = "received_date"; receivedDate.setAttribute("aria-label", "Date payment was received");
    receivedDate.value = payment.received_date || (status.value === "paid" ? payment.date || "" : "");
    receivedDate.disabled = status.value !== "paid";
    var remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove-row"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove payment row");
    remove.addEventListener("click", function () { row.remove(); updateBalancePreview(); });
    status.addEventListener("change", function () {
      var previous = row.dataset.status;
      if (status.value === "paid") {
        receivedDate.disabled = false;
        if (!receivedDate.value) receivedDate.value = todayISO();
        row.dataset.status = "paid";
        if (previous !== "paid") maybeAddNextMonthlyRow(row);
      } else {
        receivedDate.value = "";
        receivedDate.disabled = true;
        row.dataset.status = "due";
        if (previous === "paid") removeGeneratedNextRows(row.dataset.id);
      }
      updateBalancePreview();
    });
    type.addEventListener("change", function () {
      if (type.value === "monthly" && !row.dataset.seriesId) row.dataset.seriesId = row.dataset.id;
      if (type.value !== "monthly" && row.dataset.seriesId === row.dataset.id) row.dataset.seriesId = "";
      if (row.dataset.scopeExplicit !== "1") scope.value = type.value === "monthly" ? "recurring" : "project";
      row.dataset.paymentType = type.value;
      updateBalancePreview();
    });
    amount.addEventListener("input", updateBalancePreview);
    scope.addEventListener("change", function () { row.dataset.scopeExplicit = "1"; updateBalancePreview(); });
    row.append(
      paymentField("Type", type),
      paymentField("Next payment date", dueDate),
      paymentField("Amount (₱)", amount),
      paymentField("Counts toward", scope),
      paymentField("Status", status),
      paymentField("Received date", receivedDate, "payment-field--received"),
      remove
    );
    list.appendChild(row);
    updateBalancePreview();
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "pay-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function readAmount(input) {
    if (!input || input.value.trim() === "") return null;
    var value = Number(input.value);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function updateBalancePreview() {
    var total = readAmount($("#total-price"));
    var paid = 0;
    paymentRowsInEditor().forEach(function (row) {
      var status = $("select[data-payment-field='status']", row);
      var scope = $("select[data-payment-field='scope']", row);
      var amount = readAmount($("input[data-payment-field='amount']", row));
      if (status && status.value === "paid" && scope && scope.value === "project" && amount !== null) paid += amount;
    });
    var balance = $("#balance-preview strong");
    if (!balance) return;
    balance.textContent = total === null ? "Set a total price to calculate" : currency(total - paid);
  }

  function stageActionButton(stage, item) {
    var next = {
      inbox: [{ stage: "standby", text: "Move to Standby" }, { stage: "ongoing", text: "Move to On-going" }],
      standby: [{ stage: "ongoing", text: "Move to On-going" }],
      ongoing: [{ stage: "finished", text: "Move to Finished (paid in full)" }, { stage: "finished_monthly", text: "Move to Finished · monthly due" }],
      finished_monthly: [{ stage: "finished", text: "Move to Finished (paid in full)" }],
      finished: []
    }[stage] || [];
    var container = $("#stage-actions");
    if (!container) return;
    container.replaceChildren();
    next.forEach(function (action) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "button button--outline button--small";
      button.textContent = action.text;
      button.addEventListener("click", function () { moveStage(item, action.stage, button); });
      container.appendChild(button);
    });
  }

  async function openDetails(item) {
    state.selected = item;
    if (!dialog) return;
    var title = $("#detail-title");
    var stageLabel = $("#detail-stage-label");
    if (title) title.textContent = item.business || item.name || "Client inquiry";
    if (stageLabel) stageLabel.textContent = labels[item.stage] || "Inquiry details";
    setDetailValue("reference", item.reference);
    setDetailValue("name", item.name);
    setDetailValue("business", item.business);
    setDetailValue("business_type", titleCase(item.business_type));
    setDetailValue("package_interest", titleCase(item.package_interest));
    setDetailValue("email", item.email);
    setDetailValue("phone", item.phone);
    setDetailValue("current_website", item.current_website);
    setDetailValue("message", item.message);
    setDetailValue("created_at", readableDate(item.created_at));
    setDetailValue("consent", item.consent ? "Yes" : "Not recorded");
    $("#agreed-package").value = item.agreed_package || "";
    $("#total-price").value = item.total_price === null || item.total_price === undefined ? "" : String(item.total_price);
    $("#domain-name").value = item.domain_name || "";
    $("#domain-provider").value = item.domain_provider || "";
    $("#domain-renewal-date").value = item.domain_renewal_date || "";
    $("#domain-email").value = item.domain_email || "";
    $("#admin-notes").value = item.admin_notes || "";
    clearEditorRows($("#addons-list"));
    clearEditorRows($("#payments-list"));
    (Array.isArray(item.addons) ? item.addons : []).forEach(addAddonRow);
    (Array.isArray(item.payments) ? item.payments : []).forEach(addPaymentRow);
    updateBalancePreview();
    stageActionButton(item.stage, item);
    message(saveMessage, "", "");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");

    if (item.stage === "inbox" && !item.is_read) {
      item.is_read = true;
      state.unread = Math.max(0, state.unread - 1);
      updateCounts();
      renderList();
      try { await patchInquiry(item.id, { is_read: true }, false); }
      catch (err) { message(dashboardMessage, "Opened inquiry, but its read status could not be saved.", "error"); }
    }
  }

  function readFormChanges() {
    var totalValue = $("#total-price").value.trim();
    var addons = $$(".editor-row--addon", dialog).map(function (row) {
      return {
        name: $("input[type='text']", row).value.trim(),
        amount: readAmount($("input[type='number']", row))
      };
    }).filter(function (row) { return row.name; });
    var payments = paymentRowsInEditor().map(function (row) {
      var status = $("select[data-payment-field='status']", row).value;
      return {
        id: row.dataset.id || makeId(),
        type: $("select[data-payment-field='type']", row).value,
        scope: $("select[data-payment-field='scope']", row).value,
        amount: readAmount($("input[data-payment-field='amount']", row)),
        due_date: $("input[data-payment-field='due_date']", row).value,
        status: status,
        received_date: status === "paid" ? $("input[data-payment-field='received_date']", row).value : null,
        series_id: row.dataset.seriesId || "",
        generated_from: row.dataset.generatedFrom || ""
      };
    });
    if (addons.some(function (item) { return item.amount === null; })) throw new Error("Enter a valid amount for each add-on, or remove the empty row.");
    if (payments.some(function (item) { return item.amount === null; })) throw new Error("Enter a valid amount for each payment, or remove the empty row.");
    if (payments.some(function (item) { return !item.due_date; })) throw new Error("Add a next payment date for each payment row.");
    if (payments.some(function (item) { return item.status === "paid" && !item.received_date; })) throw new Error("Add a received date for each paid payment.");
    var renewalDate = $("#domain-renewal-date").value;
    return {
      agreed_package: $("#agreed-package").value || null,
      total_price: totalValue === "" ? null : Number(totalValue),
      addons: addons,
      payments: payments,
      domain_name: $("#domain-name").value.trim(),
      domain_provider: $("#domain-provider").value.trim(),
      domain_renewal_date: renewalDate || null,
      domain_email: $("#domain-email").value.trim(),
      admin_notes: $("#admin-notes").value.trim()
    };
  }

  async function patchInquiry(id, changes, reload) {
    var result = await api("PATCH", { id: id, changes: changes });
    if (result.inquiry) {
      var index = state.inquiries.findIndex(function (row) { return row.id === id; });
      if (index !== -1) state.inquiries[index] = result.inquiry;
    }
    if (reload !== false) await loadDashboard(false);
    else {
      state.counts.inbox = state.inquiries.filter(function (row) { return row.stage === "inbox"; }).length;
      state.unread = state.inquiries.filter(function (row) { return row.stage === "inbox" && !row.is_read; }).length;
      updateCounts();
    }
    return result.inquiry;
  }

  async function moveStage(item, stage, button) {
    if (!item || state.busy) return;
    state.busy = true;
    button.disabled = true;
    message(saveMessage, "Moving project…", "");
    try {
      await patchInquiry(item.id, { stage: stage, is_read: true }, true);
      if (dialog.open) dialog.close();
      message(dashboardMessage, "Moved to " + labels[stage] + ".", "success");
      window.setTimeout(function () { message(dashboardMessage, "", ""); }, 3500);
    } catch (err) {
      message(saveMessage, err.message, "error");
      button.disabled = false;
    } finally {
      state.busy = false;
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (state.busy) return;
      state.busy = true;
      loginButton.disabled = true;
      loginButton.textContent = "Signing in…";
      message(loginMessage, "", "");
      var email = $("#login-email").value.trim();
      var password = $("#login-password").value;
      try {
        await api("POST", { action: "login", email: email, password: password });
        $("#login-password").value = "";
        var ok = await loadDashboard(true);
        if (!ok && loginScreen && !loginScreen.hidden) message(loginMessage, "Sign-in succeeded, but the dashboard could not load. Check the setup and try again.", "error");
      } catch (err) {
        message(loginMessage, err.message, "error");
      } finally {
        state.busy = false;
        loginButton.disabled = false;
        loginButton.textContent = "Sign in securely";
      }
    });
  }

  async function logout() {
    try { await api("POST", { action: "logout" }); } catch (err) { /* Clear local view even if network is unavailable. */ }
    if (refreshTimer) window.clearInterval(refreshTimer);
    state.inquiries = [];
    state.selected = null;
    if (dialog && dialog.open) dialog.close();
    if (loginForm) loginForm.reset();
    showLogin("You have signed out.");
  }
  [$("#logout-button"), $("#mobile-logout-button")].forEach(function (button) {
    if (button) button.addEventListener("click", logout);
  });

  $$("[data-stage]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.stage = button.getAttribute("data-stage");
      if (searchInput) searchInput.value = "";
      if (searchPaymentFilter) searchPaymentFilter.value = "all";
      if (searchRenewalFilter) searchRenewalFilter.value = "all";
      message(dashboardMessage, "", "");
      renderList();
    });
  });
  if (searchInput) searchInput.addEventListener("input", renderList);
  if (searchPaymentFilter) searchPaymentFilter.addEventListener("change", renderList);
  if (searchRenewalFilter) searchRenewalFilter.addEventListener("change", renderList);
  var refreshButton = $("#refresh-button");
  if (refreshButton) refreshButton.addEventListener("click", function () { loadDashboard(true); });
  var refreshStatsButton = $("#refresh-stats-button");
  if (refreshStatsButton) refreshStatsButton.addEventListener("click", function () { loadDashboard(true); });

  if (dialog) {
    $$('[data-close-dialog]', dialog).forEach(function (button) { button.addEventListener("click", function () { dialog.close(); }); });
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  }
  if (projectForm) {
    projectForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!state.selected || state.busy) return;
      state.busy = true;
      var button = $("#save-project-button");
      button.disabled = true;
      message(saveMessage, "Saving…", "");
      try {
        var changes = readFormChanges();
        await patchInquiry(state.selected.id, changes, true);
        state.selected = state.inquiries.find(function (row) { return row.id === state.selected.id; }) || state.selected;
        message(saveMessage, "Saved.", "success");
      } catch (err) {
        message(saveMessage, err.message, "error");
      } finally {
        state.busy = false;
        button.disabled = false;
      }
    });
  }
  var addAddon = $("#add-addon");
  if (addAddon) addAddon.addEventListener("click", function () { addAddonRow(); });
  var addPayment = $("#add-payment");
  if (addPayment) addPayment.addEventListener("click", function () { addPaymentRow(); });
  var totalInput = $("#total-price");
  if (totalInput) totalInput.addEventListener("input", updateBalancePreview);

  loadDashboard(false).then(function (success) {
    if (!success && loadingScreen && !loadingScreen.hidden) showLogin("");
  });
})();
