// Your Todoist API token (replace with your own)
const TODOIST_API_TOKEN = "81822dc18212ccf218122c27c3744bc446f6f213";
const TODOIST_COMPLETED_API_URL = "https://api.todoist.com/sync/v9/completed/get_all";

// Get today's date in Todoist-compatible format (YYYY-MM-DD)
const getTodayDate = () => {
  try {
    const today = new Date();
    return today.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error generating today's date:", error);
    return new Date().toISOString().split("T")[0]; // Fallback
  }
};

// Fetch completed tasks for today from Todoist Sync API
async function fetchCompletedTasks() {
  const today = getTodayDate();

  try {
    const response = await fetch(TODOIST_COMPLETED_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TODOIST_API_TOKEN}`
      },
      body: JSON.stringify({
        since: `${today}T00:00`, // Start of today
        until: `${today}T23:59`  // End of today
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

// Inject and display completed tasks under .board_view__sections
async function displayTasksOnPage() {
  try {
    const tasks = await fetchCompletedTasks();

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
      taskList.style.fontSize = "1.2rem"; // Enlarge font size
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

    // Add refresh button
    let refreshButton;
    try {
      refreshButton = document.createElement("button");
      refreshButton.textContent = "Refresh";
      refreshButton.addEventListener("click", async () => {
        try {
          await displayTasksOnPage(); // Calls the full display function
        } catch (clickError) {
          console.error("Error during refresh button click:", clickError);
        }
      });
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
  }
}

// Run initially and every 10 seconds
try {
  // Initial run
  if (document.readyState === "complete" || document.readyState === "interactive") {
    displayTasksOnPage();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      try {
        displayTasksOnPage();
      } catch (loadError) {
        console.error("Error during initial DOMContentLoaded:", loadError);
      }
    });
  }

  // Update every 10 seconds
  setInterval(() => {
    try {
      displayTasksOnPage();
    } catch (intervalError) {
      console.error("Error during interval update:", intervalError);
    }
  }, 10000); // 10 seconds = 10000 milliseconds
} catch (initError) {
  console.error("Error setting up page load or interval:", initError);
}