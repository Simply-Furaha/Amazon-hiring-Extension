// Amazon Hiring Auto-Applier Content Script - Real Browser Refresh
(function() {
  'use strict';
  
  // Prevent multiple instances
  if (window.amazonJobAutoApplier) {
    console.log('Amazon Job Auto-Applier already running');
    return;
  }

class AmazonJobAutoApplier {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.userPreferences = {};
    this.targetCity = '';
    this.currentStep = 'idle'; // idle, monitoring, jobClicked, shiftSelected, completed
    this.automationCompleted = false;
    this.refreshCount = 0;
    this.shouldResumeMonitoring = false;
    
    // Mark as initialized
    window.amazonJobAutoApplier = this;
    
    this.init();
  }
  
  async init() {
    console.log('Amazon Job Auto-Applier initialized');
    await this.loadUserPreferences();
    await this.restoreStateAfterRefresh();
    this.setupMessageListener();
    
    // Check if we're on the right page
    if (!this.isOnJobSearchPage() && !this.isOnJobDetailsPage()) {
      this.log('Not on Amazon hiring page. Please navigate to the job search page.');
      return;
    }
    
    // Auto-start if enabled in preferences OR if we were monitoring before refresh
    if ((this.userPreferences.autoStart && this.isOnJobSearchPage()) || this.shouldResumeMonitoring) {
      setTimeout(() => this.startMonitoring(), 2000); // Wait 2 seconds after page load
    }
  }
  
  async restoreStateAfterRefresh() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['extensionState'], (result) => {
        if (result.extensionState) {
          const state = result.extensionState;
          const timeSinceRefresh = Date.now() - (state.lastRefresh || 0);
          
          // If less than 30 seconds since last refresh, restore monitoring state
          if (timeSinceRefresh < 30000 && state.isMonitoring) {
            this.shouldResumeMonitoring = true;
            this.targetCity = state.targetCity || 'Toronto';
            this.refreshCount = state.refreshCount || 0;
            this.log(`🔄 Resuming monitoring after page refresh (attempt #${this.refreshCount})`);
          }
          
          // Clear the state after use
          chrome.storage.local.remove(['extensionState']);
        }
        resolve();
      });
    });
  }
  
  isOnJobSearchPage() {
    return window.location.href.includes('hiring.amazon.ca/app#/jobSearch') ||
           window.location.href.includes('hiring.amazon.ca/app/#/jobSearch');
  }
  
  isOnJobDetailsPage() {
    return window.location.href.includes('hiring.amazon.ca/app#/job/') ||
           window.location.href.includes('hiring.amazon.ca/app/#/job/');
  }
  
  async loadUserPreferences() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userPreferences'], (result) => {
        this.userPreferences = result.userPreferences || {
          autoStart: false,
          monitoringInterval: 5000, // 5 seconds as required
          targetCity: 'Toronto', // Default city - configurable
          autoApply: true
        };
        this.targetCity = this.userPreferences.targetCity || 'Toronto';
        resolve();
      });
    });
  }
  
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'startMonitoring':
          this.startMonitoring();
          sendResponse({ success: true });
          break;
        case 'stopMonitoring':
          this.stopMonitoring();
          sendResponse({ success: true });
          break;
        case 'getStatus':
          sendResponse({ 
            isMonitoring: this.isMonitoring,
            currentStep: this.currentStep,
            targetCity: this.targetCity,
            automationCompleted: this.automationCompleted
          });
          break;
        case 'updatePreferences':
          this.userPreferences = request.preferences;
          this.targetCity = request.preferences.targetCity || 'Toronto';
          sendResponse({ success: true });
          break;
        case 'resetAutomation':
          this.resetAutomation();
          sendResponse({ success: true });
          break;
      }
    });
  }
  
  startMonitoring() {
    if (this.isMonitoring || this.automationCompleted) return;
    
    // Ensure we're on the job search page
    if (!this.isOnJobSearchPage()) {
      this.log('Please navigate to the job search page first: https://hiring.amazon.ca/app#/jobSearch');
      return;
    }
    
    this.isMonitoring = true;
    this.currentStep = 'monitoring';
    
    // Only reset refresh count if this is a fresh start (not resume after refresh)
    if (!this.shouldResumeMonitoring) {
      this.refreshCount = 0;
    }
    this.shouldResumeMonitoring = false;
    
    this.log(`🚀 Started monitoring for jobs in ${this.targetCity} (checking every ${this.userPreferences.monitoringInterval/1000} seconds)...`);
    
    // STEP 1: Start the refresh and filter cycle immediately
    this.executeStep1();
    
    // Set up interval monitoring
    this.monitoringInterval = setInterval(() => {
      if (this.currentStep === 'monitoring' && !this.automationCompleted) {
        this.executeStep1();
      }
    }, this.userPreferences.monitoringInterval || 5000);
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'monitoringStarted' });
  }
  
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear any saved state
    chrome.storage.local.remove(['extensionState']);
    
    this.currentStep = 'idle';
    this.log('⏹️ Stopped monitoring');
    chrome.runtime.sendMessage({ action: 'monitoringStopped' });
  }
  
  resetAutomation() {
    this.stopMonitoring();
    this.automationCompleted = false;
    this.currentStep = 'idle';
    this.refreshCount = 0;
    this.shouldResumeMonitoring = false;
    
    // Clear any saved state
    chrome.storage.local.remove(['extensionState']);
    
    this.log('🔄 Automation reset. Ready to start again.');
  }
  
  // STEP 1: Automatically refresh & filter jobs
  async executeStep1() {
    try {
      this.refreshCount++;
      this.log(`📊 Step 1: Refresh #${this.refreshCount} - Scanning for jobs in ${this.targetCity}...`);
      
      // First check for existing jobs before refreshing
      const existingJob = await this.findJobByCity();
      if (existingJob) {
        this.log(`✅ Found matching job in ${this.targetCity} (no refresh needed)!`);
        await this.executeStep2(existingJob);
        return;
      }
      
      // No matching job found, need to refresh
      this.log(`❌ No matching jobs found. Refreshing page... (attempt #${this.refreshCount})`);
      
      // Save current state before refresh
      await this.saveStateBeforeRefresh();
      
      // Force browser refresh - this will reload the entire page visually
      this.refreshJobSearch();
      
    } catch (error) {
      this.log(`❌ Error in Step 1: ${error.message}`);
    }
  }
  
  async saveStateBeforeRefresh() {
    // Save monitoring state so it persists after page reload
    chrome.storage.local.set({
      extensionState: {
        isMonitoring: this.isMonitoring,
        targetCity: this.targetCity,
        currentStep: this.currentStep,
        refreshCount: this.refreshCount,
        lastRefresh: Date.now()
      }
    });
  }
  
  async refreshJobSearch() {
    this.log('🔄 REFRESHING BROWSER PAGE NOW...');
    
    // This will cause a visible page refresh that you can see
    window.location.reload();
  }
  
  async findJobByCity() {
    // Wait for job cards to load
    await this.waitForJobCards();
    
    // More comprehensive job card selectors for Amazon hiring page
    const jobCardSelectors = [
      // Amazon-specific job card selectors
      '[data-testid*="job-card"]',
      '[data-testid*="JobCard"]',
      '[data-cy*="job"]',
      '[class*="job-card"]',
      '[class*="JobCard"]',
      '[class*="job-item"]',
      '[class*="JobItem"]',
      '.job-listing',
      '.job-item',
      // Generic card selectors
      'div[role="button"]:has(h2)',
      'div[role="button"]:has(h3)',
      'div[class*="card"]:has(h2)',
      'div[class*="card"]:has(h3)',
      'div[class*="Card"]:has(h2)',
      'div[class*="Card"]:has(h3)',
      // Fallback selectors
      'article',
      '[role="listitem"]',
      'li[class*="job"]',
      'div[class*="listing"]'
    ];
    
    let jobCards = [];
    for (const selector of jobCardSelectors) {
      jobCards = document.querySelectorAll(selector);
      if (jobCards.length > 0) {
        this.log(`🔍 Found ${jobCards.length} job cards using selector: ${selector}`);
        break;
      }
    }
    
    if (jobCards.length === 0) {
      this.log('❌ No job cards found with any selector');
      return null;
    }
    
    // Check each job card for city match
    for (const card of jobCards) {
      const jobText = card.textContent.toLowerCase();
      const cityName = this.targetCity.toLowerCase();
      
      // Log job text for debugging (first 100 characters)
      if (this.userPreferences.debugMode) {
        this.log(`🔍 Checking job: ${jobText.substring(0, 100)}...`);
      }
      
      if (jobText.includes(cityName)) {
        this.log(`✅ Found job matching city "${this.targetCity}"`);
        return card;
      }
    }
    
    this.log(`❌ No jobs found matching city "${this.targetCity}" in ${jobCards.length} available jobs`);
    return null;
  }
  
  async waitForJobCards(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkForCards = () => {
        const selectors = [
          '[data-testid*="job-card"]',
          '[class*="job-card"]',
          '[class*="JobCard"]',
          'div[class*="card"]:has(h2)',
          'div[class*="card"]:has(h3)',
          'article',
          '[role="listitem"]'
        ];
        
        let found = false;
        for (const selector of selectors) {
          try {
            if (document.querySelectorAll(selector).length > 0) {
              found = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (found) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          this.log('⏰ Timeout waiting for job cards to load');
          resolve();
        } else {
          setTimeout(checkForCards, 500);
        }
      };
      
      checkForCards();
    });
  }
  
  // STEP 2: Auto-click matching job
  async executeStep2(jobCard) {
    try {
      this.log('👆 Step 2: Clicking on matching job...');
      this.currentStep = 'jobClicked';
      
      // Clear any saved refresh state since we found a job
      chrome.storage.local.remove(['extensionState']);
      
      // Scroll job card into view
      jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(1000);
      
      // Click the job card
      await this.clickElement(jobCard);
      
      // Wait for navigation to job details page
      await this.wait(5000);
      
      // Verify we're on job details page
      if (this.isOnJobDetailsPage()) {
        this.log('✅ Successfully navigated to job details page');
        await this.executeStep3();
      } else {
        this.log('❌ Failed to navigate to job details page. Retrying...');
        this.currentStep = 'monitoring';
      }
    } catch (error) {
      this.log(`❌ Error in Step 2: ${error.message}`);
      this.currentStep = 'monitoring';
    }
  }
  
  // STEP 3: Select first Work Shift option
  async executeStep3() {
    try {
      this.log('⚙️ Step 3: Looking for Work Shift section...');
      
      // Wait for page to fully load
      await this.wait(3000);
      
      // Find Work Shift section
      const workShiftSection = await this.findWorkShiftSection();
      
      if (!workShiftSection) {
        this.log('❌ Work Shift section not found. Looking for alternative selectors...');
        await this.wait(2000);
        // Try again with different approach
        const dropdown = await this.findWorkShiftDropdown();
        if (dropdown) {
          await this.selectFirstShiftOption(dropdown);
          await this.executeStep4();
        } else {
          this.log('❌ Could not find Work Shift dropdown. Stopping automation.');
          this.stopMonitoring();
        }
        return;
      }
      
      this.log('✅ Found Work Shift section');
      
      // Scroll to Work Shift section
      workShiftSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(1000);
      
      // Find and open dropdown
      const dropdown = workShiftSection.querySelector('select, [role="combobox"], [class*="dropdown"], [class*="select"]');
      
      if (dropdown) {
        await this.selectFirstShiftOption(dropdown);
        this.log('✅ Selected first Work Shift option');
        this.currentStep = 'shiftSelected';
        await this.executeStep4();
      } else {
        this.log('❌ Work Shift dropdown not found in section');
        this.stopMonitoring();
      }
    } catch (error) {
      this.log(`❌ Error in Step 3: ${error.message}`);
      this.stopMonitoring();
    }
  }
  
  async findWorkShiftSection() {
    const sectionSelectors = [
      // Look for text containing "Work Shift"
      '//h2[contains(text(), "Work Shift")]/parent::*',
      '//h3[contains(text(), "Work Shift")]/parent::*',
      '//label[contains(text(), "Work Shift")]/parent::*',
      '//div[contains(text(), "Work Shift")]/parent::*',
      // Look for data attributes
      '[data-testid*="work-shift"]',
      '[data-testid*="shift"]',
      // Look for class names
      '[class*="work-shift"]',
      '[class*="shift-selection"]'
    ];
    
    for (const selector of sectionSelectors) {
      let element;
      if (selector.startsWith('//')) {
        // XPath selector
        element = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } else {
        // CSS selector
        element = document.querySelector(selector);
      }
      
      if (element) {
        return element;
      }
    }
    
    // Fallback: look for any element containing "shift" text
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.textContent && el.textContent.toLowerCase().includes('work shift')) {
        return el.closest('div, section, fieldset') || el;
      }
    }
    
    return null;
  }
  
  async findWorkShiftDropdown() {
    const dropdownSelectors = [
      'select[name*="shift"]',
      'select[id*="shift"]',
      '[role="combobox"][aria-label*="shift"]',
      '[class*="shift"] select',
      '[class*="shift"] [role="combobox"]'
    ];
    
    for (const selector of dropdownSelectors) {
      const dropdown = document.querySelector(selector);
      if (dropdown) {
        return dropdown;
      }
    }
    
    return null;
  }
  
  async selectFirstShiftOption(dropdown) {
    if (dropdown.tagName === 'SELECT') {
      // Standard select dropdown
      const options = dropdown.querySelectorAll('option');
      if (options.length > 1) {
        dropdown.selectedIndex = 1; // Skip first option if it's placeholder
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      // Custom dropdown - try clicking to open
      await this.clickElement(dropdown);
      await this.wait(1000);
      
      // Look for dropdown options
      const optionSelectors = [
        '[role="option"]',
        '[class*="option"]',
        'li[data-value]',
        'div[data-value]'
      ];
      
      for (const selector of optionSelectors) {
        const options = document.querySelectorAll(selector);
        if (options.length > 0) {
          await this.clickElement(options[0]);
          break;
        }
      }
    }
    
    await this.wait(2000);
  }
  
  // STEP 4: Click "Continue Application"
  async executeStep4() {
    try {
      this.log('🎯 Step 4: Looking for Continue Application button...');
      
      // Wait for page to update after shift selection
      await this.wait(3000);
      
      // Find Continue Application button
      const continueButton = await this.findContinueApplicationButton();
      
      if (continueButton) {
        this.log('✅ Found Continue Application button');
        
        // Scroll button into view
        continueButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.wait(1000);
        
        // Click the button
        await this.clickElement(continueButton);
        
        this.log('🎉 SUCCESS: Continue Application clicked! Automation completed.');
        this.currentStep = 'completed';
        this.automationCompleted = true;
        this.stopMonitoring();
        
        // Notify background script of success
        chrome.runtime.sendMessage({ 
          action: 'jobApplied', 
          job: `Job in ${this.targetCity}` 
        });
      } else {
        this.log('❌ Continue Application button not found. Waiting and retrying...');
        await this.wait(5000);
        
        // Retry once more
        const retryButton = await this.findContinueApplicationButton();
        if (retryButton) {
          await this.clickElement(retryButton);
          this.log('🎉 SUCCESS: Continue Application clicked! Automation completed.');
          this.automationCompleted = true;
          this.stopMonitoring();
        } else {
          this.log('❌ Could not find Continue Application button. Stopping automation.');
          this.stopMonitoring();
        }
      }
    } catch (error) {
      this.log(`❌ Error in Step 4: ${error.message}`);
      this.stopMonitoring();
    }
  }
  
  async findContinueApplicationButton() {
    const buttonSelectors = [
      // Exact text matches
      '//button[contains(text(), "Continue Application")]',
      '//a[contains(text(), "Continue Application")]',
      '//input[@value="Continue Application"]',
      // Partial text matches
      '//button[contains(text(), "Continue")]',
      '//a[contains(text(), "Continue")]',
      // Data attributes
      '[data-testid*="continue"]',
      '[data-testid*="application"]',
      // Common button patterns
      'button[type="submit"]',
      '.btn-primary',
      '.continue-button',
      '[class*="continue"]'
    ];
    
    for (const selector of buttonSelectors) {
      let button;
      if (selector.startsWith('//')) {
        // XPath selector
        button = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } else {
        // CSS selector
        button = document.querySelector(selector);
      }
      
      if (button && button.offsetParent !== null) {
        // Verify button text contains relevant keywords
        const buttonText = button.textContent.toLowerCase();
        if (buttonText.includes('continue') || buttonText.includes('application') || buttonText.includes('apply')) {
          return button;
        }
      }
    }
    
    return null;
  }
  
  async clickElement(element) {
    return new Promise((resolve) => {
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        
        try {
          element.click();
        } catch (e) {
          
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(event);
        }
        resolve();
      }, 500);
    });
  }
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Amazon Auto-Applier: ${message}`);
    
    
    chrome.runtime.sendMessage({
      action: 'log',
      message: `${timestamp}: ${message}`
    });
  }
}


function initializeExtension() {
  try {
 
    if (!window.location.href.includes('hiring.amazon.ca')) {
      console.log('Not on Amazon hiring page, skipping initialization');
      return;
    }
    
    console.log('Amazon Job Auto-Applier: Initializing on', window.location.href);
    new AmazonJobAutoApplier();
  } catch (error) {
    console.error('Failed to initialize Amazon Job Auto-Applier:', error);
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}


setTimeout(initializeExtension, 2000);

})();