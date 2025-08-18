
class BackgroundService {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
    this.isMonitoring = false;
    this.automationCompleted = false;
    this.currentStep = 'idle';
    this.targetCity = 'Toronto';
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupNotifications();
    this.loadState();
    this.setupInstallHandler();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'monitoringStarted':
          this.isMonitoring = true;
          this.automationCompleted = false;
          this.currentStep = 'monitoring';
          this.saveState();
          this.showNotification(
            'Monitoring Started', 
            `Now watching for new Amazon warehouse shifts in ${this.targetCity}`
          );
          break;
          
        case 'monitoringStopped':
          this.isMonitoring = false;
          this.currentStep = 'idle';
          this.saveState();
          this.showNotification('Monitoring Stopped', 'No longer watching for shifts');
          break;
          
        case 'jobApplied':
          this.automationCompleted = true;
          this.currentStep = 'completed';
          this.saveState();
          this.showNotification(
            'Application Successful!', 
            `Successfully completed 4-step workflow for: ${request.job}`
          );
          this.addLog(`✅ SUCCESS: Application workflow completed for ${request.job}`);
          break;
          
        case 'log':
          this.addLog(request.message);
          break;
          
        case 'getLogs':
          sendResponse({ logs: this.logs });
          break;
          
        case 'clearLogs':
          this.logs = [];
          this.saveLogs();
          sendResponse({ success: true });
          break;
          
        case 'getMonitoringStatus':
          sendResponse({ 
            isMonitoring: this.isMonitoring,
            automationCompleted: this.automationCompleted,
            currentStep: this.currentStep,
            targetCity: this.targetCity
          });
          break;

        case 'updateTargetCity':
          this.targetCity = request.city || 'Toronto';
          this.saveState();
          sendResponse({ success: true });
          break;

        case 'resetAutomation':
          this.automationCompleted = false;
          this.isMonitoring = false;
          this.currentStep = 'idle';
          this.saveState();
          this.addLog('Automation reset - ready to start again');
          sendResponse({ success: true });
          break;
      }
    });
  }

  setupNotifications() {
  
    chrome.runtime.onInstalled.addListener(() => {
      chrome.notifications.getPermissionLevel((level) => {
        if (level !== 'granted') {
          console.log('Requesting notification permission...');
        }
      });
    });
  }

  setupInstallHandler() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.addLog('Amazon Job Auto-Applier extension installed successfully');
        this.showNotification(
          'Extension Installed!', 
          'Navigate to hiring.amazon.ca to start monitoring for jobs'
        );
        
        
        chrome.runtime.openOptionsPage();
      } else if (details.reason === 'update') {
        this.addLog(`Extension updated to version ${chrome.runtime.getManifest().version}`);
      }
    });
  }

  showNotification(title, message) {
  
    chrome.storage.local.get(['userPreferences'], (result) => {
      const prefs = result.userPreferences || {};
      
      if (prefs.enableNotifications !== false) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: title,
          message: message,
          priority: 2
        });
      }
    });
  }

  addLog(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}: ${message}`;
    
    this.logs.unshift(logEntry);
    
   
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    this.saveLogs();
    
  
    console.log(`[Background] ${logEntry}`);
  }

  saveLogs() {
    chrome.storage.local.set({ logs: this.logs });
  }

  saveState() {
    chrome.storage.local.set({ 
      backgroundState: {
        isMonitoring: this.isMonitoring,
        automationCompleted: this.automationCompleted,
        currentStep: this.currentStep,
        targetCity: this.targetCity,
        lastUpdated: new Date().toISOString()
      }
    });
  }

  loadState() {
    chrome.storage.local.get(['logs', 'backgroundState', 'userPreferences'], (result) => {
      // Load logs
      this.logs = result.logs || [];
      
     
      if (result.backgroundState) {
        this.isMonitoring = result.backgroundState.isMonitoring || false;
        this.automationCompleted = result.backgroundState.automationCompleted || false;
        this.currentStep = result.backgroundState.currentStep || 'idle';
        this.targetCity = result.backgroundState.targetCity || 'Toronto';
      }
      
      
      if (result.userPreferences && result.userPreferences.targetCity) {
        this.targetCity = result.userPreferences.targetCity;
      }
      
      
      this.addLog(`Background service initialized - Target city: ${this.targetCity}`);
    });
  }

  logStep(stepNumber, message) {
    this.addLog(`Step ${stepNumber}: ${message}`);
  }

  logError(error, context = '') {
    const errorMessage = context ? `${context}: ${error}` : error;
    this.addLog(`❌ ERROR: ${errorMessage}`);
  }

  logSuccess(message) {
    this.addLog(`✅ SUCCESS: ${message}`);
  }

  logInfo(message) {
    this.addLog(`ℹ️ INFO: ${message}`);
  }
}


new BackgroundService();