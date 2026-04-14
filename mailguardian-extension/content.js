(function () {
  "use strict";

  if (window._mgLoaded) return;
  window._mgLoaded = true;

  console.log("MailGuardian: Content script loaded ✅");

  const PLATFORM = window.location.hostname.includes("gmail") ? "gmail" : window.location.hostname.includes("outlook") ? "outlook" : "yahoo";
  let isAnalyzing = false;
  let currentResult = null;
  let pendingSendFn = null;
  let currentComposeEl = null;

  // Get email body AND store the compose element
  function getEmailBody() {
    const selectors = [
      '[aria-label="Message Body"]',
      '.Am.Al.editable',
      'div[g_editable="true"]',
      'div[contenteditable="true"][aria-multiline="true"]',
      'div[contenteditable="true"]'
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        const t = (el.innerText || "").trim();
        if (t.length > 3) {
          currentComposeEl = el;
          return t;
        }
      }
    }
    return "";
  }

  // Replace email body - multiple strategies
  function replaceEmailBody(newText) {
    // Strategy 1: use stored compose element
    if (currentComposeEl && document.body.contains(currentComposeEl)) {
      try {
        currentComposeEl.focus();
        // Select all and replace
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(currentComposeEl);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, newText);
        console.log("MailGuardian: Email replaced ✅");
        return true;
      } catch(e) { console.log("Strategy 1 failed:", e); }
    }

    // Strategy 2: find fresh compose element
    const selectors = [
      '[aria-label="Message Body"]',
      '.Am.Al.editable',
      'div[g_editable="true"]',
      'div[contenteditable="true"]'
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        try {
          el.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, newText);
          console.log("MailGuardian: Email replaced via strategy 2 ✅");
          return true;
        } catch(e) { console.log("Strategy 2 failed:", e); }
      }
    }

    // Strategy 3: directly set innerHTML
    const el = document.querySelector('[aria-label="Message Body"], .Am.Al.editable');
    if (el) {
      el.innerText = newText;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  function injectOverlay() {
    if (document.getElementById("mg-overlay")) return;
    const div = document.createElement("div");
    div.id = "mg-overlay";
    div.innerHTML = `
      <div id="mg-backdrop"></div>
      <div id="mg-card">
        <div id="mg-header">
          <div id="mg-logo">🛡️ <strong>MailGuardian</strong></div>
          <button id="mg-close-btn">✕</button>
        </div>
        <div id="mg-loading">
          <div id="mg-progress-wrap"><div id="mg-progress-bar"></div></div>
          <div id="mg-status-text">Analyzing your email…</div>
          <div id="mg-status-sub">Reading tone from receiver's perspective</div>
        </div>
        <div id="mg-result" style="display:none;">
          <div id="mg-score-row">
            <div id="mg-score-circle">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#f0f0f0" stroke-width="7"/>
                <circle id="mg-score-arc" cx="40" cy="40" r="34" fill="none" stroke="#00c471" stroke-width="7"
                  stroke-dasharray="213.6" stroke-dashoffset="213.6" stroke-linecap="round"
                  transform="rotate(-90 40 40)" style="transition:stroke-dashoffset 0.8s ease,stroke 0.5s;"/>
              </svg>
              <span id="mg-score-num">0</span>
            </div>
            <div id="mg-score-info">
              <div id="mg-tier-badge">—</div>
              <div id="mg-summary-text"></div>
            </div>
          </div>
          <div id="mg-flagged-section" style="display:none;">
            <div class="mg-section-label">⚑ Flagged phrases</div>
            <div id="mg-flagged-list"></div>
          </div>
          <div id="mg-rephrase-section" style="display:none;">
            <div class="mg-section-label">✦ Suggested rewrite</div>
            <div id="mg-rephrase-text"></div>
          </div>
          <div id="mg-actions">
            <button id="mg-accept-btn">Accept &amp; Send</button>
            <button id="mg-edit-btn">Edit Manually</button>
            <button id="mg-dismiss-btn">Send Original</button>
          </div>
        </div>
        <div id="mg-error" style="display:none;">
          <div id="mg-error-icon">⚠️</div>
          <div id="mg-error-msg">Something went wrong.</div>
          <button id="mg-retry-btn">Try Again</button>
        </div>
      </div>`;
    document.body.appendChild(div);

    document.getElementById("mg-close-btn").onclick = () => {
      hideOverlay();
      if (pendingSendFn) pendingSendFn();
    };
    document.getElementById("mg-dismiss-btn").onclick = () => {
      hideOverlay();
      if (pendingSendFn) pendingSendFn();
    };
    document.getElementById("mg-accept-btn").onclick = () => {
      if (currentResult && currentResult.rephrased) {
        const replaced = replaceEmailBody(currentResult.rephrased);
        if (!replaced) console.log("MailGuardian: Could not replace body");
      }
      hideOverlay();
      // Small delay to let Gmail register the text change before sending
      setTimeout(() => { if (pendingSendFn) pendingSendFn(); }, 300);
    };
    document.getElementById("mg-edit-btn").onclick = () => {
      if (currentResult && currentResult.rephrased) {
        replaceEmailBody(currentResult.rephrased);
      }
      hideOverlay();
      // Don't send — let user review and send manually
    };
    document.getElementById("mg-retry-btn").onclick = () => {
      showLoading();
      doAnalysis();
    };
  }

  function showOverlay() {
    const el = document.getElementById("mg-overlay");
    if (el) { el.style.display = "flex"; setTimeout(() => el.classList.add("mg-visible"), 10); }
  }

  function hideOverlay() {
    const el = document.getElementById("mg-overlay");
    if (el) { el.classList.remove("mg-visible"); setTimeout(() => el.style.display = "none", 300); }
    // Reset state so extension works again for next email
    isAnalyzing = false;
    currentResult = null;
  }

  function showLoading() {
    document.getElementById("mg-loading").style.display = "block";
    document.getElementById("mg-result").style.display = "none";
    document.getElementById("mg-error").style.display = "none";
    animateProgress();
  }

  let pInterval = null;
  function animateProgress() {
    const bar = document.getElementById("mg-progress-bar");
    const txt = document.getElementById("mg-status-text");
    const steps = [
      {w:15,t:"Reading your email…"},
      {w:35,t:"Detecting tone…"},
      {w:60,t:"Analyzing from receiver's view…"},
      {w:80,t:"Generating suggestions…"},
      {w:92,t:"Finalizing score…"}
    ];
    let i = 0;
    if (bar) bar.style.width = "5%";
    clearInterval(pInterval);
    pInterval = setInterval(() => {
      if (i < steps.length) {
        if (bar) bar.style.width = steps[i].w + "%";
        if (txt) txt.textContent = steps[i].t;
        i++;
      }
    }, 600);
  }

  function showResult(data) {
    clearInterval(pInterval);
    const bar = document.getElementById("mg-progress-bar");
    if (bar) bar.style.width = "100%";
    setTimeout(() => {
      document.getElementById("mg-loading").style.display = "none";
      document.getElementById("mg-result").style.display = "block";
      currentResult = data;

      const score = Math.min(100, Math.max(0, data.score || 0));
      const tier = data.tier || (score >= 80 ? "Great" : score >= 50 ? "Fair" : "Poor");
      const arc = document.getElementById("mg-score-arc");
      const color = score >= 80 ? "#00c471" : score >= 50 ? "#f59e0b" : "#ef4444";
      setTimeout(() => { arc.style.strokeDashoffset = 213.6 - (score / 100) * 213.6; arc.style.stroke = color; }, 100);

      let cur = 0;
      const numEl = document.getElementById("mg-score-num");
      const step = Math.ceil(score / 30) || 1;
      const counter = setInterval(() => { cur = Math.min(cur + step, score); numEl.textContent = cur; if (cur >= score) clearInterval(counter); }, 30);

      const badge = document.getElementById("mg-tier-badge");
      badge.textContent = tier;
      badge.className = "mg-tier-" + tier.toLowerCase();
      document.getElementById("mg-summary-text").textContent = data.summary || "";

      const flagged = data.flagged || [];
      if (flagged.length > 0) {
        document.getElementById("mg-flagged-section").style.display = "block";
        document.getElementById("mg-flagged-list").innerHTML = flagged.map(f =>
          `<div class="mg-flag-item">
            <div class="mg-flag-phrase">"${f.phrase}"</div>
            <div class="mg-flag-reason">${f.reason}</div>
            ${f.suggestion ? `<div class="mg-flag-suggestion">→ ${f.suggestion}</div>` : ""}
          </div>`
        ).join("");
      } else {
        document.getElementById("mg-flagged-section").style.display = "none";
      }

      if (data.rephrased && score < 80) {
        document.getElementById("mg-rephrase-section").style.display = "block";
        document.getElementById("mg-rephrase-text").textContent = data.rephrased;
      } else {
        document.getElementById("mg-rephrase-section").style.display = "none";
      }

      document.getElementById("mg-accept-btn").style.display = (data.rephrased && score < 80) ? "block" : "none";
    }, 400);
  }

  function showError(msg) {
    clearInterval(pInterval);
    document.getElementById("mg-loading").style.display = "none";
    document.getElementById("mg-result").style.display = "none";
    document.getElementById("mg-error").style.display = "block";
    document.getElementById("mg-error-msg").textContent = msg || "Something went wrong.";
  }

  function doAnalysis() {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, function(data) {
      if (!data || !data.mg_user_email) {
        showError("Please set your email in the MailGuardian popup.");
        return;
      }
      if (data.mg_active === false) {
        hideOverlay();
        if (pendingSendFn) pendingSendFn();
        return;
      }
      chrome.runtime.sendMessage(
        { type: "ANALYZE_EMAIL", email: data.mg_user_email, text: window._mgEmailText, platform: PLATFORM },
        function(response) {
          if (response && response.success && response.data) {
            showResult(response.data);
          } else {
            showError((response && response.error) || "Analysis failed. Check server is running.");
          }
        }
      );
    });
  }

  // Intercept ALL clicks and check if Send button
  function interceptClick(e) {
    const btn = e.target.closest('[role="button"]');
    if (!btn) return;
    const tip = (btn.getAttribute("data-tooltip") || "").toLowerCase();
    const lbl = (btn.getAttribute("aria-label") || "").toLowerCase();
    const isSend = tip.includes("send") || lbl.includes("send") || btn.classList.contains("aoO");
    const notOther = !tip.includes("more") && !tip.includes("later") && !tip.includes("schedule") && !lbl.includes("more") && !lbl.includes("schedule") && !lbl.includes("later");
    if (!isSend || !notOther) return;
    if (isAnalyzing) return;

    const body = getEmailBody();
    if (!body || body.length < 5) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    isAnalyzing = true;
    window._mgEmailText = body;

    // Store the send button so we can click it later
    const sendBtn = btn;
    pendingSendFn = function() {
      isAnalyzing = false;
      // Remove our listener temporarily, click, then re-add
      document.removeEventListener("click", interceptClick, true);
      sendBtn.click();
      setTimeout(() => {
        document.addEventListener("click", interceptClick, true);
      }, 1000);
    };

    injectOverlay();
    showOverlay();
    showLoading();
    doAnalysis();
  }

  document.addEventListener("click", interceptClick, true);
  console.log("MailGuardian: Click interceptor active ✅");

})();
