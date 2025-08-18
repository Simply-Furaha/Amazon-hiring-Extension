
class OptionsController {
  constructor() {
    this.defaultPreferences = {
      autoStart: false,
      monitoringInterval: 5000,
      targetCity: 'Toronto',
      autoApply: true,
      enableNotifications: true,
      soundNotifications: false,
      emailNotifications: '',
      debugMode: false,
      pageTimeout: 15,
      retryAttempts: 3,
      preferredShifts: [],
      customShifts: '',
      preferredLocations: '',
      excludeLocations: '',
      maxApplications: 10,
      applicationDelay: 60,
      preferredStartDate: 'asap',
      customStartDate: ''
    };
    
    this.init();
  }
  
  async init() {
    this.setupEventListeners();
    await this.loadSettings();
    this.setupConditionalFields();
  }
  
  setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportSettings();
    });
    
    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    
    // Import file handler
    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });
    
    // Preferred start date conditional field
    document.getElementById('preferredStartDate').addEventListener('change', (e) => {
      const customDateField = document.getElementById('customStartDate');
      if (e.target.value === 'custom') {
        customDateField.style.display = 'block';
      } else {
        customDateField.style.display = 'none';
      }
    });
  }
  
  setupConditionalFields() {
    // Setup conditional fields based on current values
    const preferredStartDate = document.getElementById('preferredStartDate').value;
    const customDateField = document.getElementById('customStartDate');
    
    if (preferredStartDate === 'custom') {
      customDateField.style.display = 'block';
    } else {
      customDateField.style.display = 'none';
    }
  }
  
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userPreferences'], (result) => {
        const prefs = result.userPreferences || this.defaultPreferences;
        
        // Load all form fields
        this.setFormValues(prefs);
        resolve();
      });
    });
  }
  
  setFormValues(prefs) {
    // General Settings
    document.getElementById('autoStart').checked = prefs.autoStart || false;
    document.getElementById('monitoringInterval').value = prefs.monitoringInterval || 5000;
    document.getElementById('autoApply').checked = prefs.autoApply !== false;
    
    // Main target city (simplified from the complex location preferences)
    document.getElementById('preferredLocations').value = prefs.targetCity || prefs.preferredLocations || 'Toronto';
    
    // Shift Preferences
    const shiftTypes = prefs.preferredShifts || [];
    const shiftCheckboxes = document.querySelectorAll('#shiftTypes input[type="checkbox"]');
    shiftCheckboxes.forEach(cb => {
      cb.checked = shiftTypes.includes(cb.value);
    });
    
    document.getElementById('customShifts').value = prefs.customShifts || '';
    document.getElementById('excludeLocations').value = prefs.excludeLocations || '';
    
    // Application Settings
    document.getElementById('maxApplications').value = prefs.maxApplications || 10;
    document.getElementById('applicationDelay').value = prefs.applicationDelay || 60;
    document.getElementById('preferredStartDate').value = prefs.preferredStartDate || 'asap';
    document.getElementById('customStartDate').value = prefs.customStartDate || '';
    
    // Notifications
    document.getElementById('enableNotifications').checked = prefs.enableNotifications !== false;
    document.getElementById('soundNotifications').checked = prefs.soundNotifications || false;
    document.getElementById('emailNotifications').value = prefs.emailNotifications || '';
    
    // Advanced Settings
    document.getElementById('debugMode').checked = prefs.debugMode || false;
    document.getElementById('pageTimeout').value = prefs.pageTimeout || 15;
    document.getElementById('retryAttempts').value = prefs.retryAttempts || 3;
  }
  
  getFormValues() {
    // Collect all form values
    const prefs = {
      // General Settings
      autoStart: document.getElementById('autoStart').checked,
      monitoringInterval: parseInt(document.getElementById('monitoringInterval').value),
      autoApply: document.getElementById('autoApply').checked,
      
      // Target city (simplified)
      targetCity: document.getElementById('preferredLocations').value.split(',')[0].trim(),
      preferredLocations: document.getElementById('preferredLocations').value,
      
      // Shift Preferences
      preferredShifts: Array.from(document.querySelectorAll('#shiftTypes input[type="checkbox"]:checked'))
        .map(cb => cb.value),
      customShifts: document.getElementById('customShifts').value,
      excludeLocations: document.getElementById('excludeLocations').value,
      
      // Application Settings
      maxApplications: parseInt(document.getElementById('maxApplications').value),
      applicationDelay: parseInt(document.getElementById('applicationDelay').value),
      preferredStartDate: document.getElementById('preferredStartDate').value,
      customStartDate: document.getElementById('customStartDate').value,
      
      // Notifications
      enableNotifications: document.getElementById('enableNotifications').checked,
      soundNotifications: document.getElementById('soundNotifications').checked,
      emailNotifications: document.getElementById('emailNotifications').value,
      
      // Advanced Settings
      debugMode: document.getElementById('debugMode').checked,
      pageTimeout: parseInt(document.getElementById('pageTimeout').value),
      retryAttempts: parseInt(document.getElementById('retryAttempts').value)
    };
    
    return prefs;
  }
  
  async saveSettings() {
    try {
      const prefs = this.getFormValues();
      
      // Validate required fields
      if (!prefs.targetCity) {
        this.showMessage('Please enter at least one preferred location.', 'error');
        return;
      }
      
      if (prefs.monitoringInterval < 5000) {
        this.showMessage('Monitoring interval must be at least 5 seconds.', 'error');
        return;
      }
      
      // Save to storage
      await new Promise((resolve) => {
        chrome.storage.local.set({ userPreferences: prefs }, resolve);
      });
      
      this.showMessage('Settings saved successfully!', 'success');
      
      // Animate save button
      const saveBtn = document.getElementById('saveBtn');
      saveBtn.classList.add('saved');
      setTimeout(() => saveBtn.classList.remove('saved'), 300);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showMessage('Failed to save settings. Please try again.', 'error');
    }
  }
  
  async resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        await new Promise((resolve) => {
          chrome.storage.local.set({ userPreferences: this.defaultPreferences }, resolve);
        });
        
        this.setFormValues(this.defaultPreferences);
        this.setupConditionalFields();
        this.showMessage('Settings reset to defaults.', 'success');
        
      } catch (error) {
        console.error('Error resetting settings:', error);
        this.showMessage('Failed to reset settings. Please try again.', 'error');
      }
    }
  }
  
  exportSettings() {
    try {
      const prefs = this.getFormValues();
      const dataStr = JSON.stringify(prefs, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = 'amazon-job-applier-settings.json';
      link.click();
      
      this.showMessage('Settings exported successfully!', 'success');
    } catch (error) {
      console.error('Error exporting settings:', error);
      this.showMessage('Failed to export settings.', 'error');
    }
  }
  
  async importSettings(file) {
    if (!file) return;
    
    try {
      const text = await file.text();
      const prefs = JSON.parse(text);
      
      // Validate imported settings
      if (typeof prefs !== 'object' || prefs === null) {
        throw new Error('Invalid settings file format');
      }
      
      // Merge with defaults to ensure all required fields exist
      const mergedPrefs = { ...this.defaultPreferences, ...prefs };
      
      // Save imported settings
      await new Promise((resolve) => {
        chrome.storage.local.set({ userPreferences: mergedPrefs }, resolve);
      });
      
      // Update form
      this.setFormValues(mergedPrefs);
      this.setupConditionalFields();
      
      this.showMessage('Settings imported successfully!', 'success');
      
    } catch (error) {
      console.error('Error importing settings:', error);
      this.showMessage('Failed to import settings. Please check the file format.', 'error');
    }
  }
  
  showMessage(message, type = 'info') {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 5000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});