const config_prod = {
  CLIENT_ID: "861dd34bcb0048d1bdc8a866fd10d4b4",
  CLIENT_SECRET: "fc3557fa750e423dbdf0601ada9ce621"
};
const config_dev = {
  CLIENT_ID: "325b682c61ec46f187a260aedafee53e",
  CLIENT_SECRET: "6381b9052f63434c9379a3e8698f13a4"
};

let cachedToken = null;
let lastAuthAttempt = 0;
const AUTH_COOLDOWN = 5000; // 5-second cooldown

const getConfig = async () => {
  try {
    const storage = await new Promise((resolve, reject) => {
      // get ExtenstionId and installType from storage
      chrome.storage.local.get(["ExtenstionId", "installType", "ExtensionVersion"], (data) => resolve(data));
    });
    const config = storage.installType === "development" ? config_dev : config_prod;
    return { ...config, ExtenstionId: storage.ExtenstionId, ExtensionVersion: storage.ExtensionVersion };
  } catch (error) {
    console.error("Error reading installType from storage:", error);
    return config_prod;
  }
};

const getCachedToken = (forceNew) => {
  // const now = Date.now();

  if (cachedToken && !forceNew) {
    console.log("Returning cached token:", cachedToken);
    return cachedToken;
  }
  return null;

  // console.log({now, lastAuthAttempt, AUTH_COOLDOWN});
  // if (now - lastAuthAttempt < AUTH_COOLDOWN) {
  //   console.log("OAuth on cooldown, returning cached token or null", {cachedToken});
  //   return cachedToken || Promise.reject(new Error("OAuth on cooldown"));
  // }
};

async function getAccessToken(forceNew = false) {
  // const ExtenstionId = chrome.runtime.id;
  // const redirectUri = `https://${ExtenstionId}.chromiumapp.org/`;
  // console.log("Redirect ExtenstionId:", ExtenstionId);

  try {
    return new Promise(async (resolve, reject) => {
      const token = getCachedToken(forceNew);
      if (token) {
        console.log("Returning cached token:", token);
        resolve(token);
        return;
      }

      const { CLIENT_ID, CLIENT_SECRET, ExtenstionId } = await getConfig();
      const TODOIST_AUTH_URL = `https://todoist.com/oauth/authorize?` +
        `client_id=${CLIENT_ID}&` +
        `scope=data:read_write`;
      console.log("Launching OAuth flow with URL:", TODOIST_AUTH_URL);

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
          const REDIRECT_URI = `https://${ExtenstionId}.chromiumapp.org/`;
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
              lastAuthAttempt = Date.now();
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


chrome.runtime.onInstalled.addListener(
  () => {
    chrome.management.getSelf().then((data) => {
      console.log("Extension data", data);
      chrome.storage.local.set({ installType: data.installType, ExtenstionId: data.id, ExtensionVersion: data.version });
    });
  }
)