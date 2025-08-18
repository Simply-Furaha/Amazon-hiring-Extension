
class PopupController {
  constructor() {
    this.isMonitoring = false;
    this.currentStep = 'idle';
    this.targetCity = 'Toronto';
    this.automationCompleted = false;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadSettings();
    await this.updateStatus();
    this.startStatusUpdates();
    this.loadLogs();
  }

  setupEventListeners() {
    // Toggle monitoring button
    document.getElementById('toggleBtn').addEventListener('click', () => {
      this.toggleMonitoring();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Open options button
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Clear logs button
    document.getElementById('clearLogs').addEventListener('click', () => {
      this.clearLogs();
    });

    // Reset automation button
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetAutomation();
    });

    // Target city input
    document.getElementById('targetCity').addEventListener('change', (e) => {
      this.saveQuickSetting('targetCity', e.target.value);
    });

    // Auto-start checkbox
    document.getElementById('autoStart').addEventListener('change', (e) => {
      this.saveQuickSetting('autoStart', e.target.checked);
    });

    // Interval select
    document.getElementById('interval').addEventListener('change', (e) => {
      this.saveQuickSetting('monitoringInterval', parseInt(e.target.value));
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userPreferences'], (result) => {
        const prefs = result.userPreferences || {};
        
        // Update UI with current settings
        document.getElementById('autoStart').checked = prefs.autoStart || false;
        document.getElementById('interval').value = prefs.monitoringInterval || 5000;
        document.getElementById('targetCity').value = prefs.targetCity || 'Toronto';
        
        this.targetCity = prefs.targetCity || 'Toronto';
        resolve();
      });
    });
  }

  async saveQuickSetting(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userPreferences'], (result) => {
        const prefs = result.userPreferences || {};
        prefs[key] = value;
        
        chrome.storage.local.set({ userPreferences: prefs }, () => {
          // Update content script with new preferences
          this.sendMessageToActiveTab({ 
            action: 'updatePreferences', 
            preferences: prefs 
          });
          
          if (key === 'targetCity') {
            this.targetCity = value;
            this.updateUI();
          }
          
          resolve();
        });
      });
    });
  }

  async toggleMonitoring() {
    if (this.automationCompleted) {
      this.showError('Automation already completed! Click Reset to start again.');
      return;
    }

    const action = this.isMonitoring ? 'stopMonitoring' : 'startMonitoring';
    
    try {
      // First check if we're on the right page
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });
      
      if (!tabs[0] || !tabs[0].url.includes('hiring.amazon.ca')) {
        this.showError('Please navigate to the Amazon hiring page: https://hiring.amazon.ca/app#/jobSearch');
        return;
      }
      
      await this.sendMessageToActiveTab({ action });
      this.isMonitoring = !this.isMonitoring;
      this.updateUI();
    } catch (error) {
      console.error('Toggle monitoring error:', error);
      this.showError('Failed to connect to Amazon page. Please refresh the page and try again.');
    }
  }

  async resetAutomation() {
    try {
      await this.sendMessageToActiveTab({ action: 'resetAutomation' });
      this.automationCompleted = false;
      this.isMonitoring = false;
      this.currentStep = 'idle';
      this.updateUI();
      this.log('Automation reset successfully');
    } catch (error) {
      console.error('Reset automation error:', error);
      this.showError('Failed to reset automation. Please refresh the page.');
    }
  }

  async updateStatus() {
    try {
      // Get status from background script
      const bgStatus = await this.sendMessageToBackground({ action: 'getMonitoringStatus' });
      if (bgStatus) {
        this.isMonitoring = bgStatus.isMonitoring;
      }

      // Try to get detailed status from content script
      try {
        const contentStatus = await this.sendMessageToActiveTab({ action: 'getStatus' });
        if (contentStatus) {
          this.isMonitoring = contentStatus.isMonitoring;
          this.currentStep = contentStatus.currentStep || 'idle';
          this.targetCity = contentStatus.targetCity || this.targetCity;
          this.automationCompleted = contentStatus.automationCompleted || false;
        }
      } catch (e) {
        // Content script not available (not on Amazon page)
      }

      this.updateUI();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  updateUI() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const toggleBtn = document.getElementById('toggleBtn');
    const detailedStatus = document.getElementById('detailedStatus');
    const resetBtn = document.getElementById('resetBtn');
    const currentStepEl = document.getElementById('currentStep');

    // Update status based on current step
    if (this.automationCompleted) {
      statusDot.className = 'status-dot completed';
      statusText.textContent = 'Completed';
      toggleBtn.textContent = 'Completed';
      toggleBtn.className = 'btn btn-completed';
      toggleBtn.disabled = true;
      detailedStatus.textContent = 'Automation completed successfully!';
      resetBtn.style.display = 'block';
      currentStepEl.textContent = 'Completed';
    } else if (this.isMonitoring) {
      statusDot.className = 'status-dot running';
      statusText.textContent = 'Running';
      toggleBtn.textContent = 'Stop Monitoring';
      toggleBtn.className = 'btn btn-stop';
      toggleBtn.disabled = false;
      resetBtn.style.display = 'none';
      
      // Update detailed status based on current step
      switch (this.currentStep) {
        case 'monitoring':
          detailedStatus.textContent = `Scanning for jobs in ${this.targetCity}...`;
          currentStepEl.textContent = 'Step 1: Scanning jobs';
          break;
        case 'jobClicked':
          detailedStatus.textContent = 'Job found! Navigating to details...';
          currentStepEl.textContent = 'Step 2: Opening job details';
          break;
        case 'shiftSelected':
          detailedStatus.textContent = 'Selecting work shift...';
          currentStepEl.textContent = 'Step 3: Selecting shift';
          break;
        default:
          detailedStatus.textContent = `Watching for jobs in ${this.targetCity}...`;
          currentStepEl.textContent = 'Step 1: Monitoring';
      }
    } else {
      statusDot.className = 'status-dot stopped';
      statusText.textContent = 'Stopped';
      toggleBtn.textContent = 'Start Monitoring';
      toggleBtn.className = 'btn btn-start';
      toggleBtn.disabled = false;
      detailedStatus.textContent = 'Ready to start';
      resetBtn.style.display = this.automationCompleted ? 'block' : 'none';
      currentStepEl.textContent = 'Idle';
    }

    // Update target city display
    document.getElementById('targetCityDisplay').textContent = this.targetCity;
    
    // Update last check time
    document.getElementById('lastCheck').textContent = new Date().toLocaleTimeString();
  }

  startStatusUpdates() {
    // Update status every 2 seconds
    setInterval(() => {
      this.updateStatus();
    }, 2000);
  }

  async loadLogs() {
    try {
      const response = await this.sendMessageToBackground({ action: 'getLogs' });
      if (response && response.logs) {
        this.displayLogs(response.logs);
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  }

  displayLogs(logs) {
    const logsList = document.getElementById('logsList');
    
    if (logs.length === 0) {
      logsList.innerHTML = '<div class="log-item">No activity yet...</div>';
      return;
    }

    // Count successful applications
    const successCount = logs.filter(log => 
      log.includes('SUCCESS') || log.includes('Continue Application clicked')
    ).length;

    logsList.innerHTML = logs.slice(0, 10).map(log => {
      let className = 'log-item';
      if (log.includes('SUCCESS') || log.includes('Continue Application clicked')) {
        className += ' success';
      } else if (log.includes('Error') || log.includes('Failed')) {
        className += ' error';
      } else if (log.includes('Found matching job') || log.includes('Step')) {
        className += ' info';
      }
      
      return `<div class="${className}">${this.formatLogMessage(log)}</div>`;
    }).join('');

    // Update application count
    document.getElementById('applicationCount').textContent = successCount;
  }

  formatLogMessage(log) {
    // Remove timestamp and shorten message for display
    const parts = log.split(': ');
    if (parts.length > 2) {
      const time = new Date(parts[0]).toLocaleTimeString();
      const message = parts.slice(2).join(': ');
      // Shorten long messages
      const shortMessage = message.length > 50 ? message.substring(0, 47) + '...' : message;
      return `${time} - ${shortMessage}`;
    }
    return log;
  }

  async clearLogs() {
    try {
      await this.sendMessageToBackground({ action: 'clearLogs' });
      document.getElementById('applicationCount').textContent = '0';
      document.getElementById('logsList').innerHTML = '<div class="log-item">Logs cleared</div>';
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  }

  showError(message) {
    const logsList = document.getElementById('logsList');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'log-item error';
    errorDiv.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    logsList.insertBefore(errorDiv, logsList.firstChild);
  }

  log(message) {
    const logsList = document.getElementById('logsList');
    const logDiv = document.createElement('div');
    logDiv.className = 'log-item info';
    logDiv.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    logsList.insertBefore(logDiv, logsList.firstChild);
  }

  async sendMessageToActiveTab(message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) {
          reject(new Error('No active tab found'));
          return;
        }
        
        const tab = tabs[0];
        
        // Check if we're on the correct page
        if (!tab.url.includes('hiring.amazon.ca')) {
          reject(new Error('Not on Amazon hiring page'));
          return;
        }
        
        try {
          // Set timeout for content script response
          const timeoutId = setTimeout(() => {
            reject(new Error('Content script timeout - please refresh the page'));
          }, 5000);
          
          chrome.tabs.sendMessage(tab.id, message, (response) => {
            clearTimeout(timeoutId);
            
            if (chrome.runtime.lastError) {
              // Try to inject content script if not responding
              this.injectContentScript(tab.id).then(() => {
                // Wait a moment then retry
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, message, (response) => {
                    if (chrome.runtime.lastError) {
                      reject(new Error('Content script not responding - please refresh the Amazon page'));
                    } else {
                      resolve(response);
                    }
                  });
                }, 2000);
              }).catch(() => {
                reject(new Error('Failed to load extension on page - please refresh'));
              });
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  async sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    // Refresh logs when new log entry is added
    setTimeout(() => {
      new PopupController().loadLogs();
    }, 100);
  }
});