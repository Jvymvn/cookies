// background.js - Service worker for the Chrome Extension

// Listen for installation event
chrome.runtime.onInstalled.addListener(() => {
  console.log('ChatGPT Nested Conversations extension installed');
  
  // Initialize storage with default settings
  chrome.storage.local.set({
    settings: {
      indentationLevel: 'medium', // small, medium, large
      nestedStyle: 'card', // card, indent
      autoCollapse: true,
      saveConversations: true
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'log') {
    console.log('[ChatGPT Nested]:', message.data);
    sendResponse({ status: 'logged' });
  }
  
  if (message.type === 'getSettings') {
    chrome.storage.local.get('settings', (data) => {
      sendResponse({ settings: data.settings });
    });
    return true; // Required for async response
  }
  
  if (message.type === 'saveSettings') {
    chrome.storage.local.set({ settings: message.settings }, () => {
      sendResponse({ status: 'saved' });
    });
    return true; // Required for async response
  }
  
  if (message.type === 'saveConversation') {
    chrome.storage.local.get('conversations', (data) => {
      const conversations = data.conversations || {};
      conversations[message.conversationId] = message.conversation;
      
      chrome.storage.local.set({ conversations }, () => {
        sendResponse({ status: 'saved' });
      });
    });
    return true; // Required for async response
  }
  
  if (message.type === 'getConversation') {
    chrome.storage.local.get('conversations', (data) => {
      const conversations = data.conversations || {};
      const conversation = conversations[message.conversationId] || null;
      
      sendResponse({ conversation });
    });
    return true; // Required for async response
  }
});
