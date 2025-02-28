// Todoist OAuth settings
const CLIENT_ID = "861dd34bcb0048d1bdc8a866fd10d4b4";
const CLIENT_SECRET="fc3557fa750e423dbdf0601ada9ce621";
const REDIRECT_URI = "https://paapllajhpnafedjcijfpapmlnioiggc.chromiumapp.org/";
const TODOIST_AUTH_URL = `https://todoist.com/oauth/authorize?` + 
  `client_id=${CLIENT_ID}&` + 
  `scope=data:read_write`;

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
          interactive: true,
        },
        (redirectUrl) => {
          console.log("Received redirect URL:", redirectUrl);
          if (!redirectUrl) {
            console.error("No redirect URL returned");
          }
          if (chrome.runtime.lastError) {
            console.error("launchWebAuthFlow error:", JSON.stringify(chrome.runtime.lastError));
          }
         
          // get "code" parameter from redirectUrl
          const redirectUrlParams = new URLSearchParams(redirectUrl.split("?")[1]);
          const code = redirectUrlParams.get("code"); 

          // get access token from code
          const tokenUrl = `https://todoist.com/oauth/access_token`;
          const tokenParams = new URLSearchParams();
          tokenParams.append("client_id", CLIENT_ID);
          tokenParams.append("client_secret", CLIENT_SECRET);
          tokenParams.append("code", code);
          tokenParams.append("redirect_uri", REDIRECT_URI);
          fetch(tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenParams,
          })
            .then((response) => response.json())
            .then((data) => {
              console.log("Received access token:", data.access_token);
              cachedToken = data.access_token;
              resolve(data.access_token);
            })
            .catch((error) => {
              console.error("Error fetching access token:", error);
              reject(error);
            });

          // console.log("Received redirect URL:", redirectUrl);
          // const urlParams = new URLSearchParams(redirectUrl.split("#")[1] || redirectUrl.split("?")[1]);
          // const token = redirectUrlParams.get("access_token");
          // const error = redirectUrlParams.get("error");
          // if (token) {
          //   console.log("Token received:", token);
          //   cachedToken = token;
          //   resolve(token);
          // } else if (error) {
          //   console.error("OAuth error from Todoist:", error);
          //   reject(new Error(`OAuth error: ${error}`));
          // } else {
          //   console.error("No token or error in redirect URL:", redirectUrl);
          //   reject(new Error("No access token found"));
          // }
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