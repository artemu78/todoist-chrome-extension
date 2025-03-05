const TODOIST_COMPLETED_API_URL =
  "https://api.todoist.com/sync/v9/completed/get_all";

let intervalId = null;
const RUN_COOLDOWN = 2000; // 2-second cooldown

// Inject CSS styles
const styles = `
.todoistCT-task-list {
  font-size: 1.2rem;
  list-style-type: none; /* Remove bullet points */
  padding: 0; /* Remove padding */
  padding-left: 1rem; /* Add padding on left side */
  display: grid;
  grid-template-columns: [col1] auto [col2] auto [col3] 1fr; /* 3 columns: auto width for day and time, remaining space for content */
  gap: 0.5rem; /* Gap between grid items */
  font-size: 0.9rem; /* Smaller font size */
}

.todoistCT-task-day {
  color: #888; /* Pale color */
  grid-column: col1;
}
.todoistCT-task-time {
  color: #888; /* Pale color */
  grid-column: col2;
}

.todoistCT-task-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  grid-column: col3;
  color: #555555;
  text-decoration: none;
}

.todoistCT-task-content, .todoistCT-task-day, .todoistCT-task-time {
  display: flex;
  align-items: anchor-center;
}

.todoistCT-task-content:hover {
  text-decoration: underline;
}
`;

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

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
      chrome.runtime.sendMessage(
        { action: "getToken", forceNew },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.token);
          }
        }
      );
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ since, until }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const completedTasks = data?.items?.map((item) => ({
      v2_task_id: item.v2_task_id,
      content: item.content,
      date_completed: item.completed_at,
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
  const path = window.location.pathname;
  if (!path.startsWith("/app/today")) {
    return;
  }

  const now = Date.now();
  const isRunning = await isScriptRunning();
  if (isRunning) {
    return;
  }

  chrome.storage.local.get(
    ["lastRun", "testToken", "foldableStates"],
    async (result) => {
      const lastRun = result.lastRun || 0;
      await setScriptRunning(true);

      // const token = result.testToken || "default_token"; // Use the saved token or a default one
      const token = await getAccessToken(forceNewToken);
      const foldableStates = result.foldableStates || {};

      if (now - lastRun < RUN_COOLDOWN) {
        return;
      }

      chrome.storage.local.set({ lastRun: now });

      try {
        const today = getTodayDate();
        const startOfWeek = getStartOfWeekDate();
        const startOfMonth = getStartOfMonthDate();

        const [todayTasks, weekTasks, monthTasks] = await Promise.all([
          fetchCompletedTasks(token, `${today}T00:00`, `${today}T23:59`),
          fetchCompletedTasks(token, `${startOfWeek}T00:00`, `${today}T23:59`),
          fetchCompletedTasks(token, `${startOfMonth}T00:00`, `${today}T23:59`),
        ]);

        const createTaskList = (tasks, dateFormat) => {
          const elementMargin = (
            element,
            isMarginNeeded,
            content,
            cssClass
          ) => {
            if (isMarginNeeded) {
              element.style.marginTop = "0.5rem";
            }
            element.textContent = content;
            element.classList.add(cssClass);
          };
          const taskList = document.createElement("div");
          taskList.classList.add("todoistCT-task-list");

          if (tasks.length === 0) {
            taskList.innerHTML = "<div>No tasks completed.</div>";
          } else {
            let lastDate = null;
            tasks.forEach((task) => {
              // const taskDiv = document.createElement("div");
              // taskDiv.classList.add("todoistCT-task-item");

              const completedDate = new Date(task.date_completed);
              const timeString = completedDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const dayString =
                dateFormat &&
                (!lastDate ||
                  lastDate.toDateString() !== completedDate.toDateString())
                  ? completedDate.toLocaleDateString([], dateFormat)
                  : "";
              const dateTimeString = timeString.trim().padEnd(10, " "); // Ensure fixed width for alignment

              const daySpan = document.createElement("span");
              elementMargin(
                daySpan,
                dayString,
                dayString,
                "todoistCT-task-day"
              );

              const dateTimeSpan = document.createElement("span");
              dateTimeSpan.href = `https://app.todoist.com/app/task/${task.v2_task_id}`;
              elementMargin(
                dateTimeSpan,
                dayString,
                dateTimeString,
                "todoistCT-task-time"
              );

              const contentSpan = document.createElement("a");
              contentSpan.href = `https://app.todoist.com/app/task/${task.v2_task_id}`;
              contentSpan.title = task.content; // Show full content on hover
              elementMargin(
                contentSpan,
                dayString,
                task.content,
                "todoistCT-task-content"
              );

              taskList.appendChild(daySpan);
              taskList.appendChild(dateTimeSpan);
              taskList.appendChild(contentSpan);
              // taskList.appendChild(taskDiv);

              lastDate = completedDate;
            });
          }
          return taskList;
        };

        const createFoldableSection = (
          title,
          tasks,
          isOpen = false,
          dateFormat
        ) => {
          const section = document.createElement("div");
          section.style.paddingLeft = "1rem";
          const header = document.createElement("h3");
          header.textContent = title;
          header.style.cursor = "pointer";
          header.style.fontWeight = "normal";
          const taskList = createTaskList(tasks, dateFormat);
          taskList.style.display = isOpen ? "grid" : "none";
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

        const container = document.createElement("section");
        container.classList.add("section");
        container.id = "completedTasksContainer";
        container.innerHTML = "<h3>Completed Tasks</h3>";

        container.appendChild(
          createFoldableSection(
            "Today",
            todayTasks,
            foldableStates["Today"] !== false
          )
        ); // Open by default
        container.appendChild(
          createFoldableSection(
            "This Week",
            weekTasks,
            foldableStates["This Week"],
            { weekday: "short" }
          )
        ); // Include weekday
        container.appendChild(
          createFoldableSection(
            "This Month",
            monthTasks,
            foldableStates["This Month"],
            { weekday: "short", day: "2-digit" }
          )
        );

        const refreshButton = document.createElement("button");
        refreshButton.textContent = "Refresh";
        refreshButton.addEventListener(
          "click",
          async () => {
            await displayTasksOnPage(false, "refresh button");
          },
          { once: false }
        );
        container.appendChild(refreshButton);

        const boardSections = document.querySelector(".view_content");
        if (!boardSections) {
          throw new Error("Could not find .view_content element");
        }
        const existingContainer = document.getElementById(
          "completedTasksContainer"
        );
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
    }
  );
}

// Run initially and every 10 seconds
try {
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    displayTasksOnPage(true, "initial load");
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        try {
          displayTasksOnPage(true, "DOMContentLoaded");
        } catch (loadError) {
          console.error("Error during initial DOMContentLoaded:", loadError);
        }
      },
      { once: true }
    );
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
