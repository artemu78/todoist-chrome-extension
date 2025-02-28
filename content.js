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

// Get the start of the week (Monday) in Todoist-compatible format (YYYY-MM-DD)
const getStartOfWeekDate = () => {
  try {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(today.setDate(diff));
    return startOfWeek.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error generating start of the week date:", error);
    return new Date().toISOString().split("T")[0];
  }
};

// Get the start of the month in Todoist-compatible format (YYYY-MM-DD)
const getStartOfMonthDate = () => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return startOfMonth.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error generating start of the month date:", error);
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

// Fetch completed tasks for a given date range from Todoist Sync API
async function fetchCompletedTasks(token, since, until) {
  try {
    const response = await fetch(TODOIST_COMPLETED_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ since, until })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const completedTasks = data?.items?.map(item => ({
      id: item.id,
      content: item.content,
      date_completed: item.completed_at
    }));

    return completedTasks;
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

  chrome.storage.local.get(["lastRun", "testToken", "foldableStates"], async (result) => {
    const lastRun = result.lastRun || 0;
    // const token = result.testToken || "default_token"; // Use the saved token or a default one
    const token = await getAccessToken(forceNewToken);
    const foldableStates = result.foldableStates || {};

    if (now - lastRun < RUN_COOLDOWN) {
      console.log(`Skipping displayTasksOnPage from ${source} - on cooldown`);
      return;
    }

    await setScriptRunning(true);
    chrome.storage.local.set({ lastRun: now });

    try {
      console.log(`Running displayTasksOnPage from ${source}`);
      const today = getTodayDate();
      const startOfWeek = getStartOfWeekDate();
      const startOfMonth = getStartOfMonthDate();

      const [todayTasks, weekTasks, monthTasks] = await Promise.all([
        fetchCompletedTasks(token, `${today}T00:00`, `${today}T23:59`),
        fetchCompletedTasks(token, `${startOfWeek}T00:00`, `${today}T23:59`),
        fetchCompletedTasks(token, `${startOfMonth}T00:00`, `${today}T23:59`)
      ]);

      const createTaskList = (tasks) => {
        const taskList = document.createElement("ul");
        taskList.style.fontSize = "1.2rem";
        if (tasks.length === 0) {
          taskList.innerHTML = "<li>No tasks completed.</li>";
        } else {
          tasks.forEach(task => {
            const li = document.createElement("li");
            li.textContent = `${task.content} (Completed: ${new Date(task.date_completed).toLocaleTimeString()})`;
            taskList.appendChild(li);
          });
        }
        return taskList;
      };

      const createFoldableSection = (title, tasks, isOpen = false) => {
        const section = document.createElement("div");
        const header = document.createElement("h3");
        header.textContent = title;
        header.style.cursor = "pointer";
        const taskList = createTaskList(tasks);
        taskList.style.display = isOpen ? "block" : "none";
        header.addEventListener("click", () => {
          const isCurrentlyOpen = taskList.style.display === "block";
          taskList.style.display = isCurrentlyOpen ? "none" : "block";
          foldableStates[title] = !isCurrentlyOpen;
          chrome.storage.local.set({ foldableStates });
        });
        section.appendChild(header);
        section.appendChild(taskList);
        return section;
      };

      const container = document.createElement("div");
      container.id = "completedTasksContainer";
      container.innerHTML = "<h3>Completed Tasks</h3>";

      container.appendChild(createFoldableSection("Today", todayTasks, foldableStates["Today"] !== false)); // Open by default
      container.appendChild(createFoldableSection("This Week", weekTasks, foldableStates["This Week"]));
      container.appendChild(createFoldableSection("This Month", monthTasks, foldableStates["This Month"]));

      const refreshButton = document.createElement("button");
      refreshButton.textContent = "Refresh";
      refreshButton.addEventListener("click", async () => {
        await displayTasksOnPage(false, "refresh button");
      }, { once: false });
      container.appendChild(refreshButton);

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