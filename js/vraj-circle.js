/* The Vraj Circle - optional marketing lead capture. */
(() => {
  "use strict";

  // Paste the deployed Google Apps Script Web App /exec URL here after setup.
  // Do not place Google credentials or spreadsheet IDs in frontend code.
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwB3_3bXoOipY8rG_PJFnMIAy1wtq0zHc4IyojA7IMTaZWPAZBUGA9Kby6ehnFBJAqJPg/exec";
  const MARKETING_CONSENT = "I agree to receive occasional updates and offers from Vraj Naturals by email and WhatsApp. I can opt out at any time.";
  const CONSENT_VERSION = "v1.0";
  const SESSION_KEY = "vrajCirclePrompted";
  const SUBSCRIBED_KEY = "vrajCircleJoined";
  const PHONE_LIB_VERSION = "29.5.3";
  const PHONE_LIB_BASE = `https://cdn.jsdelivr.net/npm/intl-tel-input@${PHONE_LIB_VERSION}/dist`;
  const ICON = '<svg class="whatsapp-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 3.25A12.25 12.25 0 0 0 5.4 21.65L4 28l6.5-1.35A12.25 12.25 0 1 0 16 3.25Z"/><path d="M11.2 9.7c-.35-.78-.73-.8-1.07-.81h-.9c-.31 0-.82.12-1.25.59-.43.47-1.64 1.6-1.64 3.89s1.68 4.51 1.91 4.82c.24.31 3.25 5.21 8.03 7.1 3.97 1.57 4.78 1.26 5.64 1.18.86-.08 2.77-1.13 3.16-2.22.39-1.1.39-2.03.27-2.22-.12-.2-.43-.32-.9-.55-.47-.24-2.77-1.37-3.2-1.53-.43-.16-.74-.24-1.05.24-.31.47-1.21 1.53-1.48 1.84-.27.31-.55.35-1.02.12-.47-.24-1.99-.73-3.79-2.34-1.4-1.25-2.35-2.8-2.62-3.28-.27-.47-.03-.73.2-.96.21-.21.47-.55.7-.82.24-.27.31-.47.47-.78.16-.31.08-.59-.04-.82-.12-.24-1.05-2.58-1.43-3.45Z"/></svg>';

  const storageGet = (kind, key) => { try { return window[`${kind}Storage`].getItem(key); } catch { return null; } };
  const storageSet = (kind, key, value) => { try { window[`${kind}Storage`].setItem(key, value); } catch { /* Storage can be disabled by browser settings. */ } };

  function init() {
    if (document.querySelector("#vraj-circle-dialog")) return;
    const dialog = document.createElement("dialog");
    dialog.className = "vraj-circle-dialog";
    dialog.id = "vraj-circle-dialog";
    dialog.setAttribute("aria-labelledby", "vraj-circle-title");
    dialog.innerHTML = `
      <div class="vraj-circle-panel">
        <button class="vraj-circle-close" type="button" data-circle-close aria-label="Close The Vraj Circle form">×</button>
        <div class="vraj-circle-heading"><p class="eyebrow">THE VRAJ CIRCLE</p><h2 id="vraj-circle-title">Goodness, delivered <em>thoughtfully.</em></h2><p>Discover traditional recipes, new arrivals, and special offers from Vraj Naturals.</p></div>
        <form class="vraj-circle-form" data-circle-form method="post" target="vraj-circle-response-frame" novalidate>
          <label class="field-label">Full name<input name="fullName" type="text" autocomplete="name" maxlength="100" required></label>
          <label class="field-label">Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
          <label class="field-label" for="vraj-circle-mobile">Mobile / WhatsApp number <span aria-hidden="true">*</span><input id="vraj-circle-mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" required aria-describedby="vraj-circle-mobile-help" placeholder="Enter your mobile number"><span id="vraj-circle-mobile-help" class="circle-field-help">Choose your country code. India (+91) is selected by default.</span></label>
          <fieldset class="circle-consents"><legend>Marketing updates <span class="optional-label">Optional</span></legend>
            <label><input type="checkbox" name="marketingConsent"><span>${MARKETING_CONSENT}</span></label>
          </fieldset>
          <div class="circle-honeypot" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
          <input type="hidden" name="payload">
          <p class="circle-status" data-circle-status role="status" aria-live="polite"></p>
          <button class="button button-primary circle-submit" type="submit">JOIN THE VRAJ CIRCLE</button>
          <p class="circle-privacy">We use your details to manage your signup and optional updates. You can opt out of marketing at any time.</p>
          <p class="circle-manage">Email <a href="mailto:info@vrajnaturals.com?subject=Vraj%20Circle%20preferences">info@vrajnaturals.com</a> to update or withdraw your marketing preferences.</p>
        </form>
        <section class="vraj-circle-success" data-circle-success tabindex="-1" hidden>
          <p class="eyebrow">THE VRAJ CIRCLE</p><h2>Welcome to The Vraj Circle.</h2><p>Thank you for joining us. Look out for thoughtful updates from Vraj Naturals.</p><p class="circle-success-note">You will only receive marketing through channels for which you gave consent. Unchecked preferences remain off.</p><button class="button button-primary" type="button" data-circle-close>Continue exploring</button>
        </section>
      </div>`;
    document.body.append(dialog);

    const frame = document.createElement("iframe");
    frame.name = "vraj-circle-response-frame";
    frame.title = "Vraj Circle signup response";
    frame.className = "vraj-circle-response-frame";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    document.body.append(frame);

    let previousFocus = null;
    let responseTimeout = 0;
    const form = dialog.querySelector("[data-circle-form]");
    const status = dialog.querySelector("[data-circle-status]");
    const submit = dialog.querySelector(".circle-submit");
    const success = dialog.querySelector("[data-circle-success]");
    const mobileInput = form.elements.mobile;
    const mobileHelp = dialog.querySelector("#vraj-circle-mobile-help");
    let formStartedAt = Date.now();
    let phoneInput = null;
    let phoneReady = null;
    let pendingRequestId = "";

    function loadPhonePicker() {
      if (phoneReady) return phoneReady;
      phoneReady = new Promise((resolve, reject) => {
        if (!document.querySelector('link[data-intl-tel-input-css]')) {
          const stylesheet = document.createElement("link");
          stylesheet.rel = "stylesheet";
          stylesheet.href = `${PHONE_LIB_BASE}/css/intlTelInput.css`;
          stylesheet.dataset.intlTelInputCss = "true";
          document.head.append(stylesheet);
        }
        const initPicker = () => {
          try {
            phoneInput = window.intlTelInput(mobileInput, {
              initialCountry: "in",
              countryOrder: ["in"],
              separateDialCode: true,
              strictMode: true,
              allowedNumberTypes: ["MOBILE"],
              loadUtils: () => import(`${PHONE_LIB_BASE}/js/utils.js`)
            });
            phoneInput.promise.then(() => resolve(phoneInput), reject);
          } catch (error) { reject(error); }
        };
        if (window.intlTelInput) { initPicker(); return; }
        const script = document.createElement("script");
        script.src = `${PHONE_LIB_BASE}/js/intlTelInput.min.js`;
        script.onload = initPicker;
        script.onerror = () => reject(new Error("Phone validation could not load."));
        document.head.append(script);
      }).catch(error => {
        phoneReady = null;
        mobileHelp.textContent = "Phone validation could not load. Please refresh and try again.";
        console.error("Vraj Circle phone input failed to load:", error);
        throw error;
      });
      return phoneReady;
    }

    function showEmailFallback(message) {
      status.replaceChildren(document.createTextNode(message));
      const link = document.createElement("a");
      link.href = "mailto:info@vrajnaturals.com?subject=The%20Vraj%20Circle";
      link.textContent = "info@vrajnaturals.com";
      status.append(link, document.createTextNode(" for now."));
      status.classList.add("is-error");
    }

    function openDialog() {
      previousFocus = document.activeElement;
      formStartedAt = Date.now();
      storageSet("session", SESSION_KEY, "1");
      dialog.showModal();
      loadPhonePicker().catch(() => {});
      dialog.querySelector("[name=fullName]").focus();
    }
    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    document.addEventListener("click", event => {
      const opener = event.target.closest("[data-open-vraj-circle]");
      if (!opener) return;
      event.preventDefault();
      openDialog();
    });
    dialog.querySelectorAll("[data-circle-close]").forEach(button => button.addEventListener("click", closeDialog));
    dialog.addEventListener("close", () => {
      storageSet("session", SESSION_KEY, "1");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      status.textContent = "";
      status.classList.remove("is-error", "is-loading");
      status.setAttribute("aria-busy", "false");
      if (!form.reportValidity()) return;
      if (!APPS_SCRIPT_URL) {
        showEmailFallback("The Vraj Circle signup is not connected yet. Please email ");
        return;
      }
      submit.disabled = true;
      status.textContent = "Checking your mobile number…";
      status.classList.add("is-loading");
      status.setAttribute("aria-busy", "true");
      try {
        const phone = await loadPhonePicker();
        if (!phone.isValidNumber()) {
          status.textContent = "Enter a valid mobile number for the selected country.";
          status.classList.remove("is-loading");
          status.setAttribute("aria-busy", "false");
          status.classList.add("is-error");
          submit.disabled = false;
          mobileInput.focus();
          return;
        }
        mobileInput.value = phone.getNumber();
      } catch {
        status.textContent = "We couldn't validate the mobile number. Please refresh and try again.";
        status.classList.remove("is-loading");
        status.setAttribute("aria-busy", "false");
        status.classList.add("is-error");
        submit.disabled = false;
        return;
      }
      form.action = APPS_SCRIPT_URL;
      pendingRequestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = {
        requestId: pendingRequestId,
        fullName: form.elements.fullName.value.trim().replace(/\s+/g, " "),
        email: form.elements.email.value.trim().toLowerCase(),
        mobile: phoneInput.getNumber(),
        emailConsent: form.elements.marketingConsent.checked,
        whatsappConsent: form.elements.marketingConsent.checked,
        consentVersion: CONSENT_VERSION,
        consentWording: { email: MARKETING_CONSENT, whatsapp: MARKETING_CONSENT },
        sourcePage: `${location.pathname}`,
        startedAt: String(formStartedAt),
        website: form.elements.website.value.trim()
      };
      form.elements.payload.value = JSON.stringify(payload);
      status.textContent = "Saving your details securely…";
      status.classList.add("is-loading");
      status.setAttribute("aria-busy", "true");
      window.clearTimeout(responseTimeout);
      responseTimeout = window.setTimeout(() => {
        submit.disabled = false;
        status.classList.remove("is-loading");
        status.setAttribute("aria-busy", "false");
        status.textContent = "Your details may already be saved, but we couldn't confirm it. Please check your email before trying again, or contact info@vrajnaturals.com.";
        status.classList.add("is-error");
      }, 45000);
      HTMLFormElement.prototype.submit.call(form);
    });

    window.addEventListener("message", event => {
      const host = (() => { try { return new URL(event.origin).hostname; } catch { return ""; } })();
      const trustedAppsScriptOrigin = host === "script.google.com" || host === "script.googleusercontent.com" || host.endsWith("-script.googleusercontent.com");
      const legacyResponse = event.data && !event.data.requestId;
      if (!trustedAppsScriptOrigin || !event.data || event.data.type !== "vraj-circle-result" || (!legacyResponse && event.data.requestId !== pendingRequestId)) return;
      window.clearTimeout(responseTimeout);
      submit.disabled = false;
      status.classList.remove("is-loading", "is-error");
      status.setAttribute("aria-busy", "false");
      if (event.data.saved === true) {
        storageSet("local", SUBSCRIBED_KEY, "1");
        form.hidden = true;
        success.hidden = false;
        success.focus();
        status.textContent = "";
        if (event.data.duplicate) {
          success.querySelector("h2").textContent = "Your details are already with us.";
          success.querySelector(".circle-success-note").textContent = "This signup was already recorded. You will only receive marketing through channels for which you gave consent.";
        }
        return;
      }
      status.textContent = event.data.error || "We couldn't save your signup. Please try again or email info@vrajnaturals.com.";
      status.classList.add("is-error");
    });

    if (!storageGet("session", SESSION_KEY) && !storageGet("local", SUBSCRIBED_KEY)) {
      window.setTimeout(() => {
        if (!dialog.open && !storageGet("session", SESSION_KEY) && !storageGet("local", SUBSCRIBED_KEY)) openDialog();
      }, 8000);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
