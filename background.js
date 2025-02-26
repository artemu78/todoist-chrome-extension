// Todoist OAuth settings
const CLIENT_ID = "861dd34bcb0048d1bdc8a866fd10d4b4"; // Replace with your Client ID
const REDIRECT_URI = "https://paapllajhpnafedjcijfpapmlnioiggc.chromiumapp.org/"; // Replace with your extension ID
const TODOIST_AUTH_URL = `https://todoist.com/oauth/authorize?` + 
  `client_id=${CLIENT_ID}&` + 
  `scope=data:read_write&` + 
  `state=xyz`;

let cachedToken = null;
let lastAuthAttempt = 0;
const AUTH_COOLDOWN = 5000; // 5-second cooldown

async function getAccessToken(forceNew = false) {
  const now = Date.now();
  if (cachedToken && !forceNew) {
    console.log("Returning cached token:", cachedToken);
    return cachedToken;
  }

  if (now - lastAuthAttempt < AUTH_COOLDOWN) {
    console.log("OAuth on cooldown, returning cached token or null");
    return cachedToken || Promise.reject(new Error("OAuth on cooldown"));
  }

  console.log("Launching OAuth flow with URL:", TODOIST_AUTH_URL);
  try {
    lastAuthAttempt = now;
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: TODOIST_AUTH_URL,
          interactive: true
        },
        (redirectUrl) => {
          console.log("Received redirect URL:", redirectUrl);
          if (!redirectUrl) {
            console.error("No redirect URL returned");
            redirectUrl = chrome.identity.getRedirectURL();
            console.log("Generated redirect URL:", redirectUrl);
          }
          if (chrome.runtime.lastError) {
            console.error("launchWebAuthFlow error:", JSON.stringify(chrome.runtime.lastError));
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
         
          console.log("Received redirect URL:", redirectUrl);
          const urlParams = new URLSearchParams(redirectUrl.split("#")[1] || redirectUrl.split("?")[1]);
          const token = urlParams.get("access_token");
          const error = urlParams.get("error");
          if (token) {
            console.log("Token received:", token);
            cachedToken = token;
            resolve(token);
          } else if (error) {
            console.error("OAuth error from Todoist:", error);
            reject(new Error(`OAuth error: ${error}`));
          } else {
            console.error("No token or error in redirect URL:", redirectUrl);
            reject(new Error("No access token found"));
          }
        }
      );
    });
  } catch (error) {
    let errorMessage;
    if (typeof error === "object") {
      errorMessage = error;
    }
    else {
      errorMessage = { message: error };
    }

    console.error("Error in getAccessToken:", JSON.stringify(errorMessage));
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getToken") {
    getAccessToken(message.forceNew || false)
      .then(token => sendResponse({ token }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Async response
  }
});