const TODOIST_COMPLETED_API_URL = "https://api.todoist.com/sync/v9/completed/get_all";

let intervalId = null;
const RUN_COOLDOWN = 2000; // 2-second cooldown

// Get today's date in Todoist-compatible format (YYYY-MM-DD)
const getTodayDate = () => {
  try {
    const today = new Date();
    return today.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error generating today's date:", error);
    return new Date().toISOString().split("T")[0];
  }
};

// Request access token from background script
async function getAccessToken(forceNew = false) {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getToken", forceNew }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.token);
        }
      });
    });
  } catch (error) {
    console.error("Error requesting access token:", error);
    throw error;
  }
}

// Fetch completed tasks for today from Todoist Sync API
async function fetchCompletedTasks(token) {
  const today = getTodayDate();

  try {
    const response = await fetch(TODOIST_COMPLETED_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        since: `${today}T00:00`,
        until: `${today}T23:59`
      })
    });

    try {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      try {
        const completedTasks = data.items.map(item => {
          try {
            return {
              id: item.id,
              content: item.content,
              date_completed: item.completed_at
            };
          } catch (mapError) {
            console.error("Error mapping individual task:", mapError);
            return null;
          }
        }).filter(task => task !== null);

        return completedTasks;
      } catch (filterError) {
        console.error("Error processing API data:", filterError);
        return [];
      }
    } catch (jsonError) {
      console.error("Error parsing API response:", jsonError);
      return [];
    }
  } catch (error) {
    console.error("Error fetching completed tasks:", error);
    return [];
  }
}

// Check if script is already running
async function isScriptRunning() {
  return new Promise((resolve) => {
    chrome.storage.local.get("isRunning", (result) => {
      resolve(result.isRunning === true);
    });
  });
}

// Set running state
async function setScriptRunning(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ isRunning: state }, () => {
      resolve();
    });
  });
}

// Inject and display completed tasks under .board_view__sections
async function displayTasksOnPage(forceNewToken = false, source = "unknown") {
  const now = Date.now();
  const isRunning = await isScriptRunning();
  if (isRunning) {
    console.log(`Skipping displayTasksOnPage from ${source} - already running`);
    return;
  }

  chrome.storage.local.get("lastRun", async (result) => {
    const lastRun = result.lastRun || 0;
    if (now - lastRun < RUN_COOLDOWN) {
      console.log(`Skipping displayTasksOnPage from ${source} - on cooldown`);
      return;
    }

    await setScriptRunning(true);
    chrome.storage.local.set({ lastRun: now });

    try {
      console.log(`Running displayTasksOnPage from ${source}`);
      const token = await getAccessToken(forceNewToken);
      const tasks = await fetchCompletedTasks(token);

      let container;
      try {
        container = document.createElement("div");
        container.id = "completedTasksContainer";
        container.innerHTML = "<h3>Completed Tasks</h3>";
      } catch (createError) {
        console.error("Error creating container div:", createError);
        return;
      }

      let taskList;
      try {
        taskList = document.createElement("ul");
        taskList.style.fontSize = "1.2rem";
        if (tasks.length === 0) {
          taskList.innerHTML = "<li>No tasks completed today.</li>";
        } else {
          tasks.forEach(task => {
            try {
              const li = document.createElement("li");
              li.textContent = `${task.content} (Completed: ${new Date(task.date_completed).toLocaleTimeString()})`;
              taskList.appendChild(li);
            } catch (taskError) {
              console.error("Error creating task element:", taskError);
            }
          });
        }
        container.appendChild(taskList);
      } catch (listError) {
        console.error("Error creating task list:", listError);
        return;
      }

      let refreshButton;
      try {
        refreshButton = document.createElement("button");
        refreshButton.textContent = "Refresh";
        refreshButton.addEventListener("click", async () => {
          try {
            await displayTasksOnPage(false, "refresh button");
          } catch (clickError) {
            console.error("Error during refresh button click:", clickError);
          }
        }, { once: false });
        container.appendChild(refreshButton);
      } catch (buttonError) {
        console.error("Error creating or configuring refresh button:", buttonError);
      }

      try {
        const boardSections = document.querySelector(".board_view__sections");
        if (!boardSections) {
          throw new Error("Could not find .board_view__sections element");
        }
        const existingContainer = document.getElementById("completedTasksContainer");
        if (existingContainer) {
          existingContainer.replaceWith(container);
        } else {
          boardSections.appendChild(container);
        }
      } catch (injectError) {
        console.error("Error injecting tasks into .board_view__sections:", injectError);
      }
    } catch (error) {
      console.error("Error in displayTasksOnPage:", error);
    } finally {
      await setScriptRunning(false);
    }
  });
}

// Run initially and every 10 seconds
try {
  console.log("Content script initializing");

  const urlPath = window.location.pathname;
  if (document.readyState === "complete" || document.readyState === "interactive") {
    displayTasksOnPage(true, "initial load");
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      try {
        displayTasksOnPage(true, "DOMContentLoaded");
      } catch (loadError) {
        console.error("Error during initial DOMContentLoaded:", loadError);
      }
    }, { once: true });
  }

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    try {
      displayTasksOnPage(false, "interval");
    } catch (intervalError) {
      console.error("Error during interval update:", intervalError);
    }
  }, 10000);
} catch (initError) {
  console.error("Error setting up page load or interval:", initError);
}