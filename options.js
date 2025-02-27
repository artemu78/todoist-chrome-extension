document.addEventListener('DOMContentLoaded', () => {
  const testTokenInput = document.getElementById('testToken');
  const saveButton = document.getElementById('saveButton');
  const stopScriptButton = document.getElementById('stopScriptButton');

  // Load the saved token from local storage
  chrome.storage.local.get('testToken', (result) => {
    if (result.testToken) {
      testTokenInput.value = result.testToken;
    }
  });

  // Save the token to local storage
  saveButton.addEventListener('click', () => {
    const testToken = testTokenInput.value;
    chrome.storage.local.set({ testToken }, () => {
      console.log('Test token saved:', testToken);
      alert('Test token saved successfully!');
    });
  });

  // Stop script button event listener
  stopScriptButton.addEventListener('click', async () => {
    try {
      await setScriptRunning(false);
      alert('Script stopped successfully.');
    } catch (error) {
      console.error('Error stopping the script:', error);
      alert('Failed to stop the script.');
    }
  });

  // Function to set script running state
  async function setScriptRunning(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ isRunning: state }, () => {
        resolve();
      });
    });
  }
});