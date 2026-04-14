// MailGuardian - Popup Script (Server-based, no API key needed)

const SERVER_URL = "http://localhost:5000";

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

async function saveSettings() {
  const email = document.getElementById("userEmail").value.trim();
  const msg = document.getElementById("setupMsg");

  if (!email || !email.includes("@")) {
    msg.textContent = "Please enter a valid email address.";
    msg.className = "msg error"; msg.style.display = "block"; return;
  }

  // Verify with server that this email is registered
  msg.textContent = "Verifying with server...";
  msg.className = "msg"; msg.style.display = "block";

  try {
    const res = await fetch(`${SERVER_URL}/api/verify-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!data.allowed) {
      msg.textContent = data.reason || "Email not registered. Please register at the MailGuardian website.";
      msg.className = "msg error"; msg.style.display = "block"; return;
    }

    chrome.storage.sync.set({ mg_user_email: email, mg_active: true }, () => {
      msg.textContent = `✓ Welcome ${data.user?.name || ""}! MailGuardian is active.`;
      msg.className = "msg success"; msg.style.display = "block";
      setTimeout(() => { loadMainView(); showView("view-main"); }, 1200);
    });
  } catch (err) {
    msg.textContent = "Could not connect to server. Make sure the server is running.";
    msg.className = "msg error"; msg.style.display = "block";
  }
}

function toggleActive() {
  const checked = document.getElementById("activeToggle").checked;
  chrome.storage.sync.set({ mg_active: checked });
  document.getElementById("toggleLabel").textContent = checked ? "Active" : "Paused";
  document.getElementById("statusDot").className = "status-dot" + (checked ? "" : " off");
}

function loadMainView() {
  chrome.storage.sync.get(["mg_user_email", "mg_active"], (data) => {
    const email = data.mg_user_email || "";
    const active = data.mg_active !== false;
    document.getElementById("userEmailEl").textContent = email || "Not set";
    document.getElementById("userAvatarEl").textContent = email ? email.slice(0, 2).toUpperCase() : "MG";
    document.getElementById("activeToggle").checked = active;
    document.getElementById("toggleLabel").textContent = active ? "Active" : "Paused";
    document.getElementById("statusDot").className = "status-dot" + (active ? "" : " off");
    document.getElementById("userEmail").value = email;
  });

  chrome.storage.local.get(["mg_history"], (data) => {
    const history = data.mg_history || [];
    document.getElementById("statTotal").textContent = history.length;
    if (history.length > 0) {
      const avg = Math.round(history.reduce((a, b) => a + b.score, 0) / history.length);
      const last = history[0].score;
      const avgEl = document.getElementById("statAvg");
      const lastEl = document.getElementById("statLast");
      avgEl.textContent = avg;
      avgEl.className = "stat-num " + (avg >= 80 ? "green" : avg >= 50 ? "amber" : "red");
      lastEl.textContent = last;
      lastEl.className = "stat-num " + (last >= 80 ? "green" : last >= 50 ? "amber" : "red");
    }
    const listEl = document.getElementById("historyList");
    if (!history.length) {
      listEl.innerHTML = `<div class="empty-history">No emails analyzed yet.<br/>Start composing to see results.</div>`;
      return;
    }
    listEl.innerHTML = history.slice(0, 8).map(h => {
      const cls = h.score >= 80 ? "good" : h.score >= 50 ? "fair" : "poor";
      const d = new Date(h.date);
      const dateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      return `<div class="history-item"><span class="h-date">${dateStr}</span><span class="h-platform">${h.platform || "email"}</span><span class="h-score ${cls}">${h.score}</span></div>`;
    }).join("");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("activeToggle").addEventListener("change", toggleActive);
  document.getElementById("settingsLink").addEventListener("click", () => showView("view-setup"));

  chrome.storage.sync.get(["mg_user_email"], (data) => {
    if (data.mg_user_email) { loadMainView(); showView("view-main"); }
    else showView("view-setup");
  });
});
