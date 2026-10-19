/* PetersWeb Solutions admin dashboard. Vanilla JS; no client-side secrets or local storage. */
(function () {
  "use strict";

  var $ = function (selector, context) { return (context || document).querySelector(selector); };
  var $$ = function (selector, context) { return Array.prototype.slice.call((context || document).querySelectorAll(selector)); };
  var labels = {
    inbox: "Inbox",
    standby: "Standby Projects",
    ongoing: "On-going Projects",
    finished: "Finished Projects"
  };
  var descriptions = {
    inbox: "New client inquiries waiting for review.",
    standby: "Prospective projects waiting for the next step.",
    ongoing: "Active projects and their payment and domain details.",
    finished: "Completed projects, final payment status, and domain details."
  };
  var state = { inquiries: [], stage: "inbox", counts: {}, unread: 0, selected: null, busy: false };
  var loadingScreen = $("#loading-screen");
  var loginScreen = $("#login-screen");
  var dashboard = $("#admin-shell");
  var loginForm = $("#login-form");
  var loginMessage = $("#login-message");
  var loginButton = $("#login-submit");
  var searchInput = $("#search-input");
  var recordList = $("#record-list");
  var emptyState = $("#empty-state");
  var dashboardMessage = $("#dashboard-message");
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
    renderList();
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(function () {
      if (!document.hidden && !dialog.open) loadDashboard(false);
    }, 30000);
  }

  async function loadDashboard(showErrors) {
    try {
      var data = await api("GET");
      showDashboard(data);
      if (showErrors) message(dashboardMessage, "", "");
      return true;
    } catch (err) {
      if (err.message === "Please sign in to continue.") {
        showLogin("");
      } else if (loginScreen && !loginScreen.hidden) {
        showLogin(err.message);
      } else if (dashboard && dashboard.hidden) {
        showLogin(err.message);
      } else if (showErrors) {
        message(dashboardMessage, err.message, "error");
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

  function readableDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" }).format(date);
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
    ["standby", "ongoing", "finished"].forEach(function (stage) {
      var badge = $("#badge-" + stage);
      if (badge) badge.textContent = String(counts[stage] || 0);
    });
    var unreadSummary = $("#summary-unread");
    var standbySummary = $("#summary-standby");
    var ongoingSummary = $("#summary-ongoing");
    var finishedSummary = $("#summary-finished");
    if (unreadSummary) unreadSummary.textContent = String(state.unread || 0);
    if (standbySummary) standbySummary.textContent = String(counts.standby || 0);
    if (ongoingSummary) ongoingSummary.textContent = String(counts.ongoing || 0);
    if (finishedSummary) finishedSummary.textContent = String(counts.finished || 0);
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
    } else {
      article.appendChild(cell("Package", pkg, "record-cell--first"));
      article.appendChild(cell("Payment", item.payment_status || "Not set", "record-cell--second"));
      article.appendChild(cell("Balance", currency(item.balance), "record-cell--extra"));
      article.appendChild(cell("Domain", item.domain_name || "Not set", "record-cell--extra"));
      article.appendChild(cell("Domain email", item.domain_email || "Not set", "record-cell--extra"));
    }

    var open = document.createElement("button");
    open.className = "record-open";
    open.type = "button";
    open.textContent = "View details";
    open.addEventListener("click", function () { openDetails(item); });
    article.appendChild(open);
    return article;
  }

  function renderList() {
    if (!recordList) return;
    var title = $("#stage-heading");
    var subtitle = $("#stage-description");
    var listTitle = $("#list-title");
    var countLine = $("#list-count");
    if (title) title.textContent = labels[state.stage];
    if (subtitle) subtitle.textContent = descriptions[state.stage];
    if (listTitle) listTitle.textContent = labels[state.stage];
    $$("[data-stage]").forEach(function (button) {
      var active = button.getAttribute("data-stage") === state.stage;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var records = state.inquiries.filter(function (item) { return item.stage === state.stage; });
    if (query) {
      records = records.filter(function (item) {
        return [item.name, item.business, item.email, item.phone, item.reference, item.domain_name]
          .join(" ").toLowerCase().indexOf(query) !== -1;
      });
    }
    recordList.replaceChildren();
    records.forEach(function (item) { recordList.appendChild(makeRecord(item)); });
    if (countLine) countLine.textContent = records.length + (records.length === 1 ? " record" : " records");
    if (emptyState) emptyState.hidden = records.length > 0;
    if (records.length === 0) {
      var emptyTitle = $("#empty-title");
      var emptyCopy = $("#empty-copy");
      if (emptyTitle) emptyTitle.textContent = query ? "No matching records" : (state.stage === "inbox" ? "No new inquiries yet" : "No projects in this section yet");
      if (emptyCopy) emptyCopy.textContent = query
        ? "Try a different name, business, or contact detail."
        : (state.stage === "inbox"
          ? "New website submissions will appear here once secure inquiry storage is connected."
          : "Move an inquiry into this stage and it will appear here.");
    }
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

  function addPaymentRow(payment) {
    var list = $("#payments-list");
    if (!list) return;
    var row = document.createElement("div");
    row.className = "editor-row editor-row--payment";
    row.dataset.id = payment && payment.id ? payment.id : makeId();
    var label = document.createElement("select");
    label.setAttribute("aria-label", "Payment type");
    ["Down payment", "Installment", "Final payment", "Other"].forEach(function (value) {
      var option = document.createElement("option"); option.value = value; option.textContent = value; label.appendChild(option);
    });
    label.value = payment && payment.label ? payment.label : "Down payment";
    var amount = document.createElement("input");
    amount.type = "number"; amount.min = "0"; amount.step = "0.01"; amount.inputMode = "decimal"; amount.placeholder = "₱ amount"; amount.setAttribute("aria-label", "Payment amount in pesos");
    amount.value = payment && payment.amount !== undefined ? String(payment.amount) : "";
    var date = document.createElement("input");
    date.type = "date"; date.setAttribute("aria-label", "Payment date"); date.value = payment && payment.date ? payment.date : new Date().toISOString().slice(0, 10);
    var note = document.createElement("input");
    note.type = "text"; note.maxLength = 160; note.placeholder = "Note (optional)"; note.className = "payment-note-input"; note.setAttribute("aria-label", "Payment note"); note.value = payment && payment.note ? payment.note : "";
    var remove = document.createElement("button");
    remove.type = "button"; remove.className = "remove-row"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove payment entry");
    remove.addEventListener("click", function () { row.remove(); updateBalancePreview(); });
    amount.addEventListener("input", updateBalancePreview);
    row.append(label, amount, date, note, remove);
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
    $$(".editor-row--payment input[type='number']", dialog).forEach(function (input) {
      var value = readAmount(input);
      if (value !== null) paid += value;
    });
    var balance = $("#balance-preview strong");
    if (!balance) return;
    balance.textContent = total === null ? "Set a total price to calculate" : currency(total - paid);
  }

  function stageActionButton(stage, item) {
    var next = {
      inbox: [{ stage: "standby", text: "Move to Standby" }, { stage: "ongoing", text: "Move to On-going" }],
      standby: [{ stage: "ongoing", text: "Move to On-going" }],
      ongoing: [{ stage: "finished", text: "Move to Finished" }],
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
    var payments = $$(".editor-row--payment", dialog).map(function (row) {
      return {
        id: row.dataset.id || makeId(),
        label: $("select", row).value,
        amount: readAmount($("input[type='number']", row)),
        date: $("input[type='date']", row).value,
        note: $(".payment-note-input", row).value.trim()
      };
    });
    if (addons.some(function (item) { return item.amount === null; })) throw new Error("Enter a valid amount for each add-on, or remove the empty row.");
    if (payments.some(function (item) { return item.amount === null; })) throw new Error("Enter a valid amount for each payment, or remove the empty row.");
    if (payments.some(function (item) { return !item.date; })) throw new Error("Add a date for each payment.");
    return {
      agreed_package: $("#agreed-package").value || null,
      total_price: totalValue === "" ? null : Number(totalValue),
      addons: addons,
      payments: payments,
      domain_name: $("#domain-name").value.trim(),
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
      message(dashboardMessage, "", "");
      renderList();
    });
  });
  if (searchInput) searchInput.addEventListener("input", renderList);
  var refreshButton = $("#refresh-button");
  if (refreshButton) refreshButton.addEventListener("click", function () { loadDashboard(true); });

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
