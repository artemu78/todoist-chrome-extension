# Todoist Completed Tasks Chrome Extension

A simple Chrome extension that enhances your Todoist experience by displaying a list of tasks completed today directly on the Todoist web app.

## Features
- Displays a "Completed Tasks" section on `https://app.todoist.com/*` pages (e.g., "Today" view).
- Updates automatically every 10 seconds to reflect newly completed tasks.
- Includes a "Refresh" button for manual updates.
- Enlarges task list text to a readable `1.2rem` font size.
- Uses OAuth 2.0 for secure Todoist API access—no hardcoded tokens needed.

## Installation
1. **Clone or Download**: Get the extension files from this repository or download the ZIP.
2. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable "Developer mode" (top right).
   - Click "Load unpacked" and select the folder containing `manifest.json`, `background.js`, and `content.js`.
3. **Authorize with Todoist**:
   - Visit `https://app.todoist.com/app/today`.
   - The extension will prompt you to log in to Todoist and authorize it via OAuth 2.0. Approve access to enable task fetching.

## Usage
- Open `https://app.todoist.com/app/today` (or any Todoist project page).
- Look for the "Completed Tasks" section below the task list (under `.board_view__sections`).
- Completed tasks appear with timestamps (e.g., "Buy milk (Completed: 10:30:45 AM)").
- Click "Refresh" to update manually, or wait for the 10-second auto-refresh.

## Requirements
- Chrome browser with extension support.
- A Todoist account.
- The extension must be registered with Todoist’s App Console (see Developer Notes).

## Developer Notes
- **OAuth Setup**:
  - Register an app at [Todoist App Console](https://developer.todoist.com/appconsole.html).
  - Set the OAuth redirect URI to `https://<your-extension-id>.chromiumapp.org/` (find your ID in `chrome://extensions/`).
  - Update `CLIENT_ID` and `REDIRECT_URI` in `background.js` and `manifest.json` with your values.
- **Files**:
  - `manifest.json`: Defines permissions and scripts.
  - `background.js`: Handles OAuth token retrieval.
  - `content.js`: Injects and updates the task list.

## Privacy
This extension is designed with user privacy in mind. Here’s how it handles your data:

- **Data Accessed**: The extension fetches your completed tasks from the Todoist API (`https://api.todoist.com/sync/v9/completed/get_all`) using an OAuth 2.0 access token specific to your account. It only requests the `data:read_write` scope to read completed tasks.
- **Data Storage**: 
  - The OAuth access token is cached in memory by Chrome’s Identity API during your session and not stored persistently by the extension.
  - A temporary `isRunning` flag and `lastRun` timestamp are stored in `chrome.storage.local` to prevent redundant executions, but these contain no personal data and are cleared when the extension restarts.
- **Data Transmission**: Tasks are fetched directly from Todoist’s servers and displayed on the page. No data is sent to third parties or external servers beyond Todoist’s API.
- **User Control**: You authorize the extension via Todoist’s OAuth flow, and you can revoke access anytime in your Todoist account settings (Settings > Integrations > Manage Apps).
- **No Tracking**: The extension does not collect, log, or transmit any analytics, usage data, or personally identifiable information.

Your Todoist data remains secure and is only used to display completed tasks within the Todoist web app.

## Troubleshooting
- **Login Windows Opening Repeatedly**: If OAuth fails (e.g., "Authorization page could not be loaded"), verify your `CLIENT_ID` and `REDIRECT_URI` match Todoist’s App Console settings.
- **No Tasks Showing**: Check the console (Right-click > Inspect > Console) for errors and ensure OAuth authorization completed successfully.
- **Contact**: For issues, open a GitHub issue or email [your-email@example.com].

## License
[MIT License](LICENSE) - Feel free to modify and distribute!

---