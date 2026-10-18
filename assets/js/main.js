/* ==========================================================================
   PetersWeb Solutions — interactions
   Vanilla JS. No external dependencies. All business inputs come from
   assets/js/config.js so links can be updated without touching this file.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var cfg = window.PWS_CONFIG || {};
  var contactCfg = cfg.contact || {};
  var socialCfg = cfg.social || {};
  var portfolioCfg = cfg.portfolio || {};
  var formCfg = cfg.form || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var editMode = new URLSearchParams(window.location.search).get("edit") === "1";

  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };

  var state = {
    menuOpen: false,
    modalOpen: false,
    contactVisible: false,
    footerVisible: false,
    pricingVisible: false
  };

  /* ---------- Utilities ---------- */
  function safeUrl(value) {
    if (!value || typeof value !== "string") return "";
    try {
      var url = new URL(value, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (err) { /* invalid */ }
    return "";
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /* Analytics-ready event bus. No vendor script or ID is loaded here.
     Events intentionally contain no name, contact details, free text, or form payload. */
  function emitConversionEvent(eventName, details) {
    var detail = Object.assign({ eventName: eventName }, details || {});
    try {
      window.dispatchEvent(new CustomEvent("pws:conversion", { detail: detail }));
    } catch (err) { /* Tracking integrations are optional. */ }
  }

  function validMessengerDestination(value) {
    var href = safeUrl(value);
    if (!href) return "";
    try {
      var url = new URL(href);
      var host = url.hostname.toLowerCase();
      var parts = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:") return "";
      if (host === "m.me" && parts.length === 1 && /^[A-Za-z0-9._-]+$/.test(parts[0])) return url.href;
      if ((host === "facebook.com" || host === "www.facebook.com") && parts.length === 3 && parts[0] === "messages" && parts[1] === "t" && /^[A-Za-z0-9._-]+$/.test(parts[2])) return url.href;
      if ((host === "messenger.com" || host === "www.messenger.com") && parts.length === 2 && parts[0] === "t" && /^[A-Za-z0-9._-]+$/.test(parts[1])) return url.href;
    } catch (err) { /* invalid URL */ }
    return "";
  }

  function setExternalLink(el, url) {
    if (!el) return;
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    el.hidden = false;
  }

  function setBodyLock() {
    doc.body.classList.toggle("is-locked", state.menuOpen || state.modalOpen);
  }

  function updateSticky() {
    var suppress = state.menuOpen || state.modalOpen || state.pricingVisible || state.contactVisible || state.footerVisible;
    doc.body.classList.toggle("sticky-suppressed", suppress);
  }

  /* ---------- Toast ---------- */
  var toastEl = $("[data-toast]");
  var toastText = $("[data-toast-text]");
  var toastTimer = null;

  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove("is-show");
    window.setTimeout(function () {
      if (!toastEl.classList.contains("is-show")) toastEl.hidden = true;
    }, 280);
  }

  function showToast(message) {
    if (!toastEl || !toastText) return;
    window.clearTimeout(toastTimer);
    toastText.textContent = message;
    toastEl.hidden = false;
    window.requestAnimationFrame(function () { toastEl.classList.add("is-show"); });
    toastTimer = window.setTimeout(hideToast, 6000);
  }

  if (toastEl) {
    $$("[data-toast-close]").forEach(function (btn) {
      btn.addEventListener("click", hideToast);
    });
  }

  /* ---------- Contact details from config ---------- */
  var email = clean(contactCfg.email);
  var validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
  var phone = clean(contactCfg.phone);
  var phoneDisplay = clean(contactCfg.phoneDisplay) || phone;
  var messengerUrl = validMessengerDestination(contactCfg.messengerUrl);
  var messengerSocial = safeUrl(socialCfg.messenger) || messengerUrl;
  var messengerMethodOption = $("#field-contact-method option[value='messenger']");
  if (messengerMethodOption) {
    messengerMethodOption.disabled = !messengerUrl;
    messengerMethodOption.textContent = messengerUrl ? "Messenger" : "Messenger (not connected)";
  }

  function updateMessengerContext() {
    var notes = $$("[data-messenger-note]");
    var select = $("#field-package");
    var value = select ? select.value : "unsure";
    var selected = select && select.selectedOptions ? select.selectedOptions[0] : null;
    var label = selected ? selected.textContent.split(" — ")[0] : "";
    notes.forEach(function (note) {
      note.hidden = !messengerUrl;
      if (!messengerUrl) return;
      note.textContent = label && value !== "unsure"
        ? "You selected " + label + ". Messenger won’t receive this form or package choice automatically; mention it when you start your message."
        : "Messenger opens separately. This site does not send form details or prefill a message.";
    });
  }

  $$("[data-email-label]").forEach(function (el) {
    el.textContent = validEmail || "Use the inquiry form";
  });
  $$("[data-email-link]").forEach(function (link) {
    if (validEmail) {
      link.href = "mailto:" + validEmail;
      link.removeAttribute("target");
    } else {
      link.href = "#inquiry-form-card";
    }
  });

  if (phone && phoneDisplay) {
    var telHref = "tel:" + phone.replace(/[^\d+]/g, "");
    $$("[data-phone-link]").forEach(function (link) {
      link.href = telHref;
      link.hidden = false;
    });
    $$("[data-phone-label]").forEach(function (el) { el.textContent = phoneDisplay; });
  }

  if (clean(contactCfg.hours)) {
    $$("[data-hours]").forEach(function (el) { el.hidden = false; });
    $$("[data-hours-label]").forEach(function (el) { el.textContent = clean(contactCfg.hours); });
  }

  /* Messenger buttons: use the real link when configured, otherwise guide
     the visitor to the form with an honest notice (no dead link). */
  function wireMessengerButton(link) {
    if (messengerUrl) {
      link.href = messengerUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.hidden = false;
      link.addEventListener("click", function () {
        var select = $("#field-package");
        var pkg = select && select.value !== "unsure" ? select.value : "";
        emitConversionEvent("messenger_cta_click", pkg ? { package: pkg } : {});
      });
      return;
    }
    link.href = "#inquiry-form-card";
    link.removeAttribute("target");
    link.addEventListener("click", function (event) {
      event.preventDefault();
      showToast("Messenger isn't connected on this site yet. Please send the inquiry form and we'll reply using your contact details.");
      scrollToForm();
    });
  }
  $$("[data-messenger]").forEach(wireMessengerButton);
  updateMessengerContext();
  $$("[data-footer-messenger]").forEach(function (link) {
    link.hidden = !messengerUrl;
    if (messengerUrl) setExternalLink(link, messengerUrl);
  });

  /* Social icons only render when a destination exists. */
  $$("[data-social]").forEach(function (link) {
    var key = link.getAttribute("data-social");
    var url = key === "messenger" ? messengerSocial : safeUrl(socialCfg[key]);
    if (url) {
      setExternalLink(link, url);
    } else {
      link.hidden = true;
    }
  });
  var socialsWrap = $(".footer__socials");
  if (socialsWrap && $$("[data-social]", socialsWrap).every(function (link) { return link.hidden; })) {
    socialsWrap.hidden = true;
  }

  /* Map links */
  var mapLink = safeUrl(contactCfg.mapLink);
  if (mapLink) {
    $$("[data-map-link]").forEach(function (link) { link.href = mapLink; });
  }

  var mapFrame = $("[data-map-frame]");
  var mapEmbed = safeUrl(contactCfg.mapEmbed);
  if (mapFrame && mapEmbed) mapFrame.setAttribute("data-src", mapEmbed);
  var mapButton = $("[data-load-map]");
  if (mapButton && mapFrame && mapEmbed) {
    mapButton.addEventListener("click", function () {
      mapFrame.hidden = false;
      mapFrame.src = mapEmbed;
      var card = mapFrame.closest("[data-map]");
      if (card) card.classList.add("is-map-loaded");
      mapButton.hidden = true;
    });
  }

  /* ---------- Header, menu & sticky CTA ---------- */
  var header = $("[data-header]");
  var menuToggle = $("[data-menu-toggle]");
  var mobileMenu = $("[data-mobile-menu]");

  var heroCtasEl = $(".hero__ctas");
  function updateHeader() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 6);
    if (!heroCtasEl) {
      doc.body.classList.add("sticky-visible");
      return;
    }
    var ctasRect = heroCtasEl.getBoundingClientRect();
    doc.body.classList.toggle("sticky-visible", ctasRect.bottom < 8);
  }
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
  window.addEventListener("resize", updateHeader);

  function setMenu(open) {
    if (!menuToggle || !mobileMenu) return;
    state.menuOpen = open;
    mobileMenu.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileMenu.setAttribute("aria-hidden", String(!open));
    if (open) {
      mobileMenu.removeAttribute("inert");
      var firstLink = mobileMenu.querySelector("a");
      if (firstLink) firstLink.focus({ preventScroll: true });
    } else {
      mobileMenu.setAttribute("inert", "");
      if (mobileMenu.contains(doc.activeElement)) menuToggle.focus({ preventScroll: true });
    }
    setBodyLock();
    updateSticky();
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function () { setMenu(!state.menuOpen); });
    $$("a", mobileMenu).forEach(function (link) {
      link.addEventListener("click", function () { setMenu(false); });
    });
    var brandLink = $(".brand");
    if (brandLink) brandLink.addEventListener("click", function () { if (state.menuOpen) setMenu(false); });
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.menuOpen) {
        setMenu(false);
      }
    });
    if (window.matchMedia) {
      var desktopQuery = window.matchMedia("(min-width: 900px)");
      var handleDesktop = function (event) { if (event.matches && state.menuOpen) setMenu(false); };
      if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", handleDesktop);
      else if (desktopQuery.addListener) desktopQuery.addListener(handleDesktop);
    }
  }

  var pricingSection = $("#pricing");
  var contactSection = $("#contact");
  var siteFooter = $(".site-footer");
  if ("IntersectionObserver" in window && pricingSection && contactSection && siteFooter) {
    var stickyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === pricingSection) state.pricingVisible = entry.isIntersecting;
        if (entry.target === contactSection) state.contactVisible = entry.isIntersecting;
        if (entry.target === siteFooter) state.footerVisible = entry.isIntersecting;
      });
      updateSticky();
    }, { threshold: 0.04 });
    stickyObserver.observe(pricingSection);
    stickyObserver.observe(contactSection);
    stickyObserver.observe(siteFooter);
  }

  /* ---------- Smooth anchor + package preselection ---------- */
  var packageSelect = $("#field-package");

  function scrollToForm() {
    var card = $("#inquiry-form-card");
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    card.classList.add("is-highlighted");
    window.setTimeout(function () { card.classList.remove("is-highlighted"); }, 1900);
  }

  $$("[data-package]").forEach(function (link) {
    link.addEventListener("click", function () {
      var value = link.getAttribute("data-package");
      if (!packageSelect || !value) return;
      var hasOption = Array.prototype.some.call(packageSelect.options, function (opt) {
        return opt.value === value;
      });
      if (hasOption) {
        packageSelect.value = value;
        updateMessengerContext();
        emitConversionEvent("package_cta_click", { package: value });
      }
    });
  });
  if (packageSelect) {
    packageSelect.addEventListener("change", function () {
      updateMessengerContext();
      emitConversionEvent("package_selected", { package: packageSelect.value });
    });
  }

  $$("[data-focus-form]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      scrollToForm();
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = $$(".reveal");
  function revealAll() {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }
  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealAll();
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -36px 0px" });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
    window.addEventListener("load", function () {
      // Safety net so content can never remain hidden if an element never intersects.
      window.setTimeout(function () {
        $$(".reveal:not(.is-visible)").forEach(function (el) {
          var rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight * 1.4) el.classList.add("is-visible");
        });
      }, 1200);
    });
  }

  /* ---------- Testimonials (hidden until genuine content exists) ---------- */
  var testimonialsSection = $("#testimonials");
  var testimonialsGrid = $("[data-testimonials-grid]");
  var testimonialsNote = $("[data-testimonials-note]");

  function buildTestimonialCard(item, placeholder) {
    var card = doc.createElement("article");
    card.className = "testimonial-card reveal" + (placeholder ? " is-placeholder" : "");
    card.classList.add("is-visible");

    if (placeholder) {
      var flag = doc.createElement("span");
      flag.className = "testimonial-card__flag";
      flag.textContent = "Placeholder — not published";
      card.appendChild(flag);
    }

    var head = doc.createElement("div");
    head.className = "testimonial-card__top";
    var identity = doc.createElement("div");
    identity.className = "testimonial-card__identity";
    var avatar = doc.createElement("span");
    avatar.className = "testimonial-card__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = clean(item.initials) || clean(item.name).split(/\s+/).map(function (part) { return part.charAt(0); }).slice(0, 2).join("").toUpperCase();
    identity.appendChild(avatar);

    var person = doc.createElement("div");
    person.className = "testimonial-card__person";
    var name = doc.createElement("strong");
    name.textContent = item.name;
    person.appendChild(name);
    var attribution = [item.business, item.service].filter(Boolean).join(" · ");
    if (attribution) {
      var business = doc.createElement("span");
      business.textContent = attribution;
      person.appendChild(business);
    }
    var ratingValue = Math.max(0, Math.min(5, Math.round(Number(item.rating) || 0)));
    if (ratingValue > 0) {
      var rating = doc.createElement("span");
      rating.className = "testimonial-card__rating";
      rating.setAttribute("role", "img");
      rating.setAttribute("aria-label", "Rated " + ratingValue + " out of 5 stars");
      rating.textContent = "★".repeat(ratingValue) + "☆".repeat(5 - ratingValue);
      person.appendChild(rating);
    }
    identity.appendChild(person);
    head.appendChild(identity);

    var badge = doc.createElement("span");
    badge.className = "testimonial-card__badge" + (item.verified === true ? " is-verified" : "");
    badge.textContent = item.verified === true ? "Verified" : "Client feedback";
    head.appendChild(badge);
    card.appendChild(head);

    var quote = doc.createElement("blockquote");
    quote.textContent = item.quote;
    card.appendChild(quote);
    return card;
  }

  if (testimonialsSection && testimonialsGrid) {
    var testimonialsCfg = cfg.testimonials || {};
    var realItems = Array.isArray(testimonialsCfg.items)
      ? testimonialsCfg.items.filter(function (item) {
          return item && clean(item.quote) && clean(item.name);
        })
      : [];

    if (testimonialsCfg.enabled && realItems.length) {
      testimonialsSection.hidden = false;
      if (testimonialsNote) testimonialsNote.hidden = true;
      realItems.forEach(function (item) {
        testimonialsGrid.appendChild(buildTestimonialCard(item, false));
      });

      var testimonialScrollButtons = $$("[data-testimonial-scroll]");
      function updateTestimonialControls() {
        var maxScroll = testimonialsGrid.scrollWidth - testimonialsGrid.clientWidth;
        testimonialScrollButtons.forEach(function (button) {
          var direction = Number(button.getAttribute("data-testimonial-scroll"));
          button.disabled = direction < 0 ? testimonialsGrid.scrollLeft <= 2 : testimonialsGrid.scrollLeft >= maxScroll - 2;
        });
      }
      testimonialScrollButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          var direction = Number(button.getAttribute("data-testimonial-scroll"));
          var distance = Math.max(240, testimonialsGrid.clientWidth * 0.82);
          if (testimonialsGrid.scrollBy) {
            testimonialsGrid.scrollBy({ left: direction * distance, behavior: reduceMotion ? "auto" : "smooth" });
          } else {
            testimonialsGrid.scrollLeft += direction * distance;
          }
        });
      });
      testimonialsGrid.addEventListener("scroll", updateTestimonialControls, { passive: true });
      window.addEventListener("resize", updateTestimonialControls);
      window.requestAnimationFrame(updateTestimonialControls);
    } else if (editMode) {
      testimonialsSection.hidden = false;
      if (testimonialsNote) testimonialsNote.hidden = false;
      [
        { quote: "Placeholder testimonial — replace with a genuine client quote after receiving written permission.", name: "Client name", business: "Business type", service: "Service" },
        { quote: "Placeholder testimonial — add the client's own words about their experience working with PetersWeb Solutions.", name: "Client name", business: "Business type", service: "Service" },
        { quote: "Placeholder testimonial — keep it specific and honest. Real endorsements only.", name: "Client name", business: "Business type", service: "Service" }
      ].forEach(function (item) {
        testimonialsGrid.appendChild(buildTestimonialCard(item, true));
      });
    } else {
      testimonialsSection.hidden = true;
    }
  }

  /* ---------- FAQ-style accordions: one open per section ---------- */
  $$(".faq__list").forEach(function (list) {
    var items = $$(".faq__item", list);
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item && other.open) other.open = false;
        });
      });
    });
  });

  /* ---------- Portfolio preview modal ---------- */
  var modal = $("[data-preview-modal]");
  var modalDialog = modal ? $(".preview-modal__dialog", modal) : null;
  var previewFrame = $("[data-preview-frame]");
  var previewUrlLabel = $("[data-preview-url]");
  var previewTitle = $("[data-preview-title]");
  var previewNote = $("[data-preview-note]");
  var previewCaption = $("[data-preview-caption]");
  var previewLoading = $("[data-preview-loading]");
  var previewFallback = $("[data-preview-fallback]");
  var previewFallbackText = $("[data-preview-fallback-text]");
  var previewFallbackImage = $("[data-preview-fallback-image]");
  var previewCloseBtn = modal ? $(".icon-btn", modal) : null;
  var lastFocused = null;
  var loadTimeout = null;
  var modalKeyHandler = null;

  /* Keep each portfolio card's direct anchor aligned with the approved URL. */
  Object.keys(portfolioCfg).forEach(function (key) {
    var live = safeUrl(portfolioCfg[key].liveUrl);
    if (!live) return;
    var card = $('[data-work-card="' + key + '"]');
    if (!card) return;
    var badge = $("[data-work-badge]", card);
    if (badge) badge.textContent = "Live website";
  });

  function hidePreviewLoading() {
    if (previewLoading) previewLoading.hidden = true;
  }

  function showPreviewFallback(message) {
    hidePreviewLoading();
    if (!previewFallback) return;
    previewFallback.hidden = false;
    if (previewFallbackText) previewFallbackText.textContent = message;
  }

  function getFocusable() {
    if (!modalDialog) return [];
    return $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', modalDialog)
      .filter(function (el) {
        if (el.hasAttribute("hidden")) return false;
        if (el.closest("[hidden]")) return false;
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el === previewFrame;
      });
  }

  function closePreview() {
    if (!modal || !state.modalOpen) return;
    state.modalOpen = false;
    modal.classList.remove("is-open");
    window.clearTimeout(loadTimeout);
    if (modalKeyHandler) doc.removeEventListener("keydown", modalKeyHandler);
    modalKeyHandler = null;
    if (previewFrame) {
      previewFrame.onload = null;
      previewFrame.src = "about:blank";
    }
    window.setTimeout(function () {
      modal.hidden = true;
      setBodyLock();
      updateSticky();
      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus({ preventScroll: true });
      }
    }, reduceMotion ? 0 : 220);
  }

  function openPreview(projectId, trigger) {
    if (!modal) return;
    var project = portfolioCfg[projectId] || {};
    // Portfolio previews always target the supplied live site. Never fall back
    // to a local/generated concept page if configuration is missing or stale.
    var live = safeUrl(project.liveUrl);
    var target = live;
    var projectCard = $('[data-work-card="' + projectId + '"]');
    var projectImage = projectCard ? $("img", projectCard) : null;
    if (previewFallbackImage && projectImage) {
      previewFallbackImage.src = projectImage.currentSrc || projectImage.src;
      previewFallbackImage.alt = projectImage.alt || "Screenshot of the live website homepage";
    }

    lastFocused = trigger || doc.activeElement;
    if (state.menuOpen) setMenu(false);

    state.modalOpen = true;
    modal.hidden = false;
    if (previewTitle) previewTitle.textContent = project.title ? project.title + " — preview" : "Website preview";
    if (previewUrlLabel) {
      previewUrlLabel.textContent = live
        ? (project.previewLabel || live.replace(/^https?:\/\//, "").replace(/\/$/, ""))
        : "Preview coming soon";
    }
    if (previewNote) {
      previewNote.hidden = false;
      previewNote.textContent = live
        ? "Live website preview inside this popup. Close the X to return to the portfolio."
        : "A live preview has not been configured for this project yet.";
    }
    if (previewCaption) {
      previewCaption.textContent = live
        ? "Preview the live website here. Close the X to return to PetersWeb Solutions."
        : "Preview coming soon. Ask us for a walkthrough.";
    }

    if (previewFallback) previewFallback.hidden = true;
    if (previewFrame) previewFrame.title = (project.title || "Website") + " preview";

    window.requestAnimationFrame(function () { modal.classList.add("is-open"); });
    setBodyLock();
    updateSticky();

    if (!target) {
      showPreviewFallback("This project's live URL is not configured yet. Close the X to return to the portfolio.");
    } else {
      if (previewLoading) previewLoading.hidden = false;
      window.clearTimeout(loadTimeout);
      loadTimeout = window.setTimeout(function () {
        showPreviewFallback("The live site did not load inside the popup. This genuine homepage screenshot is shown instead, so visitors stay on PetersWeb Solutions.");
      }, 12000);
      if (previewFrame) {
        previewFrame.onload = function () {
          window.clearTimeout(loadTimeout);
          hidePreviewLoading();
          if (previewFallback) previewFallback.hidden = true;
        };
        previewFrame.onerror = function () {
          showPreviewFallback("The live site could not be displayed inside the popup. The genuine homepage screenshot is shown instead.");
        };
        previewFrame.src = target;
      }
    }

    if (previewCloseBtn) {
      window.setTimeout(function () { previewCloseBtn.focus({ preventScroll: true }); }, 50);
    }

    modalKeyHandler = function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.key !== "Tab") return;
      var focusables = getFocusable();
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    doc.addEventListener("keydown", modalKeyHandler);
  }

  if (modal) {
    $$("[data-close-preview]").forEach(function (el) {
      el.addEventListener("click", closePreview);
    });
    $$("[data-preview-project]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPreview(btn.getAttribute("data-preview-project"), btn);
      });
    });
  }

  /* ---------- Inquiry form ---------- */
  var form = $("#inquiry-form");
  if (form) {
    var formStarted = $("#form-started-at");
    var alertBox = $("[data-form-alert]");
    var statusEl = $("[data-form-status]");
    var successPanel = $("[data-form-success]");
    var formHead = $(".form-card__head");
    var successName = $("[data-success-name]");
    var successRef = $("[data-success-ref]");
    var submitBtn = $('button[type="submit"]', form);
    var submitLabel = $("[data-submit-label]", form);
    var resetBtn = $("[data-reset-form]");
    var busy = false;
    var endpointValue = clean(formCfg.endpoint);
    var minFillSeconds = Number(formCfg.minFillSeconds) || 3;
    var formStartValue = Date.now();
    if (formStarted) formStarted.value = String(formStartValue);

    var fieldOrder = ["name", "business", "businessType", "package", "currentWebsite", "email", "phone", "message", "consent"];
    var formStartTracked = false;

    function getField(name) {
      return form.querySelector('[name="' + name + '"]');
    }

    function setError(name, message) {
      var field = getField(name);
      var errorEl = form.querySelector('[data-error-for="' + name + '"]');
      if (!field || !errorEl) return;
      var wrap = field.closest(".field");
      if (wrap) wrap.classList.toggle("has-error", !!message);
      if (message) {
        field.setAttribute("aria-invalid", "true");
        errorEl.textContent = message;
      } else {
        field.removeAttribute("aria-invalid");
        errorEl.textContent = "";
      }
    }

    function clearErrors() {
      fieldOrder.forEach(function (name) { setError(name, ""); });
      if (alertBox) {
        alertBox.hidden = true;
        alertBox.replaceChildren();
      }
    }

    function showAlert(message) {
      if (!alertBox) return;
      alertBox.hidden = false;
      alertBox.replaceChildren();
      var p = doc.createElement("p");
      p.textContent = message;
      alertBox.appendChild(p);
    }

    function validate() {
      clearErrors();
      var errors = {};
      var name = clean(getField("name") ? getField("name").value : "");
      var business = clean(getField("business") ? getField("business").value : "");
      var businessType = getField("businessType") ? getField("businessType").value : "";
      var pkg = getField("package") ? getField("package").value : "";
      var currentWebsite = clean(getField("currentWebsite") ? getField("currentWebsite").value : "");
      var email = clean(getField("email") ? getField("email").value : "");
      var phone = clean(getField("phone") ? getField("phone").value : "");
      var message = clean(getField("message") ? getField("message").value : "");
      var consent = getField("consent") ? getField("consent").checked : false;

      if (name.length < 2) errors.name = "Please enter your full name.";
      if (business.length < 2) errors.business = "Please enter your business name.";
      if (!businessType) errors.businessType = "Please choose a business category.";
      if (!pkg) errors.package = "Please select a package or “Not sure yet”.";
      if (currentWebsite) {
        try {
          var websiteUrl = new URL(currentWebsite);
          if ((websiteUrl.protocol !== "https:" && websiteUrl.protocol !== "http:") || !websiteUrl.hostname) throw new Error("Invalid website URL");
        } catch (err) { errors.currentWebsite = "Enter a full website address starting with https://, or leave this blank."; }
      }
      if (!email) errors.email = "Please enter your email address.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Please enter a valid email address.";
      if (!phone) errors.phone = "Please enter your mobile number.";
      else if (!/^[+()\d.\-\s]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15) errors.phone = "Please enter a valid mobile number, including area or country code.";
      if (message.length < 10) errors.message = "Please add a short description (at least 10 characters).";
      if (!consent) errors.consent = "Please agree to be contacted about your inquiry.";

      var firstError = null;
      fieldOrder.forEach(function (key) {
        if (errors[key]) {
          setError(key, errors[key]);
          if (!firstError) firstError = key;
        }
      });
      if (firstError) {
        var el = getField(firstError);
        if (el) el.focus({ preventScroll: false });
        showAlert("Please check the highlighted fields and try again.");
        return null;
      }

      return {
        name: name,
        business: business,
        businessType: businessType,
        package: pkg,
        currentWebsite: currentWebsite,
        email: email,
        phone: phone,
        message: message,
        consent: consent
      };
    }

    form.addEventListener("focusin", function () {
      if (!formStartTracked) {
        formStartTracked = true;
        emitConversionEvent("lead_form_start");
      }
    });

    function setBusy(isBusy) {
      busy = isBusy;
      if (submitBtn) submitBtn.disabled = isBusy;
      if (submitLabel) submitLabel.textContent = isBusy ? "Sending…" : "Send My Inquiry";
      form.setAttribute("aria-busy", isBusy ? "true" : "false");
    }

    function showSuccess(name, reference) {
      if (!form || !successPanel) return;
      form.hidden = true;
      if (formHead) formHead.hidden = true;
      successPanel.hidden = false;
      if (successName) successName.textContent = (name || "there").split(/\s+/)[0];
      if (successRef) successRef.textContent = reference || "Pending";
      successPanel.focus({ preventScroll: true });
      successPanel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }

    form.addEventListener("input", function (event) {
      var target = event.target;
      if (!target || !target.name) return;
      setError(target.name, "");
      if (alertBox) {
        alertBox.hidden = true;
        alertBox.replaceChildren();
      }
    });
    form.addEventListener("change", function (event) {
      var target = event.target;
      if (target && target.name) setError(target.name, "");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy) return;

      var honeypot = getField("company_website");
      if (honeypot && honeypot.value.trim() !== "") {
        showAlert("We couldn't verify this submission. Please refresh the page and try again.");
        return;
      }

      var data = validate();
      if (!data) return;

      var elapsed = Date.now() - formStartValue;
      if (elapsed < minFillSeconds * 1000) {
        showAlert("Please take a moment to review your details before sending.");
        return;
      }

      if (!endpointValue) {
        showAlert("Online inquiries aren't connected yet. Please contact us through Messenger or the details listed in the contact section.");
        return;
      }

      var endpoint;
      try {
        endpoint = new URL(endpointValue, window.location.href);
      } catch (err) {
        showAlert("The inquiry endpoint is misconfigured. Please contact us through the contact options listed on this page.");
        return;
      }
      if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
        showAlert("The inquiry endpoint is misconfigured. Please contact us through the contact options listed on this page.");
        return;
      }

      var payload = {
        name: data.name,
        business: data.business,
        businessType: data.businessType,
        package: data.package,
        currentWebsite: data.currentWebsite,
        email: data.email,
        phone: data.phone,
        message: data.message,
        consent: data.consent,
        company_website: "",
        formStartedAt: formStartValue,
        source: window.location.origin + window.location.pathname
      };

      var controller = new AbortController();
      var abortTimer = window.setTimeout(function () { controller.abort(); }, 15000);
      setBusy(true);
      clearErrors();
      if (statusEl) statusEl.textContent = "Sending your inquiry…";

      fetch(endpoint.href, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
        .then(function (response) {
          return response.json().catch(function () { return null; }).then(function (json) {
            return { response: response, json: json };
          });
        })
        .then(function (result) {
          var response = result.response;
          var json = result.json;
          if (!response.ok || !json || !json.ok) {
            if (json && json.errors) {
              fieldOrder.forEach(function (key) {
                if (json.errors[key]) setError(key, json.errors[key]);
              });
            }
            var message = (json && json.error) ? json.error : "We couldn't send your inquiry right now. Please try again in a moment.";
            showAlert(message);
            if (statusEl) statusEl.textContent = "Your inquiry wasn't sent.";
            return;
          }
          if (statusEl) statusEl.textContent = "Inquiry received.";
          emitConversionEvent("lead_form_submit_success", { package: data.package });
          showSuccess(data.name, json.reference);
        })
        .catch(function (error) {
          var message = error && error.name === "AbortError"
            ? "The request took too long. Please check your connection and try again."
            : "We couldn't reach the inquiry service. Please check your connection and try again.";
          showAlert(message);
          if (statusEl) statusEl.textContent = "Your inquiry wasn't sent.";
        })
        .then(function () {
          window.clearTimeout(abortTimer);
          setBusy(false);
        });
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!form || !successPanel) return;
        form.hidden = false;
        if (formHead) formHead.hidden = false;
        successPanel.hidden = true;
        form.reset();
        formStartValue = Date.now();
        if (formStarted) formStarted.value = String(formStartValue);
        formStartTracked = false;
        updateMessengerContext();
        clearErrors();
        if (statusEl) statusEl.textContent = "";
        if (packageSelect) packageSelect.value = "unsure";
        setBusy(false);
        var nameField = getField("name");
        if (nameField) nameField.focus({ preventScroll: true });
        form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    }
  }

  /* ---------- Year ---------- */
  $$("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
