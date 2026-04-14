const SERVER_URL = "http://localhost:5000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_EMAIL") {
    fetch(SERVER_URL + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: message.email, text: message.text, platform: message.platform })
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, data: data.data, error: data.error }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.sync.get(["mg_user_email", "mg_active"], data => sendResponse(data));
    return true;
  }
});
