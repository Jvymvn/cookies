// content-script.js - Content script that runs in the context of ChatGPT pages

// State for tracking conversations
let nestedConversations = {};
let settings = {
  indentationLevel: 'medium',
  nestedStyle: 'card',
  autoCollapse: true,
  saveConversations: true
};
let conversationId = null;

// Get settings from storage
chrome.runtime.sendMessage({ type: 'getSettings' }, (response) => {
  if (response && response.settings) {
    settings = response.settings;
  }
});

// Helper to log to background console
function logToConsole(data) {
  chrome.runtime.sendMessage({ type: 'log', data });
}

// Generate unique IDs for elements
function generateUniqueId() {
  return 'nested-' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Get the current conversation ID from URL
function getCurrentConversationId() {
  const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

// Main observer to detect new ChatGPT responses
function observeChatGPT() {
  // Target: the main chat container
  const targetNode = document.querySelector('main');
  if (!targetNode) {
    // If main not found, retry after a delay
    setTimeout(observeChatGPT, 1000);
    return;
  }

  // Get conversation ID from URL
  conversationId = getCurrentConversationId();
  
  // Load existing nested conversations for this chat if they exist
  if (conversationId && settings.saveConversations) {
    chrome.runtime.sendMessage(
      { type: 'getConversation', conversationId }, 
      (response) => {
        if (response && response.conversation) {
          nestedConversations = response.conversation;
          // Process existing responses to add nested sections
          processExistingResponses();
        }
      }
    );
  }

  // Configuration for the observer
  const config = { childList: true, subtree: true };

  // Callback to execute when mutations are observed
  const callback = (mutationsList, observer) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // Look for ChatGPT responses (they have markdown content)
        const newResponseNodes = document.querySelectorAll('.markdown');
        
        newResponseNodes.forEach(node => {
          // Check if we've already processed this node
          if (!node.dataset.nestedProcessed) {
            node.dataset.nestedProcessed = 'true';
            processResponse(node);
          }
        });
      }
    }
    
    // Check for URL changes (conversation changes)
    const currentId = getCurrentConversationId();
    if (currentId !== conversationId) {
      conversationId = currentId;
      // Reset conversations for new chat
      nestedConversations = {};
      // Process the new responses
      processExistingResponses();
    }
  };

  // Create and start observer
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
  
  // Process existing responses immediately
  processExistingResponses();
  
  logToConsole('ChatGPT observer started');
}

// Process already existing responses when extension loads or URL changes
function processExistingResponses() {
  const responseNodes = document.querySelectorAll('.markdown');
  responseNodes.forEach(node => {
    if (!node.dataset.nestedProcessed) {
      node.dataset.nestedProcessed = 'true';
      processResponse(node);
    }
  });
}

// Process a ChatGPT response to add nested conversation functionality
function processResponse(responseNode) {
  // Find sections within the response (headings or paragraphs)
  const sections = findSections(responseNode);
  
  // If no sections are found, treat the entire response as one section
  if (sections.length === 0) {
    const sectionId = generateUniqueId();
    addNestedReplyButton(responseNode, sectionId);
    return;
  }
  
  // Add nested reply buttons to each section
  sections.forEach(section => {
    const sectionId = generateUniqueId();
    section.dataset.sectionId = sectionId;
    addNestedReplyButton(section, sectionId);
    
    // If we have stored conversations for this section, restore them
    if (nestedConversations[sectionId]) {
      restoreNestedConversation(section, sectionId, nestedConversations[sectionId]);
    }
  });
}

// Find logical sections within a ChatGPT response
function findSections(responseNode) {
  const sections = [];
  
  // Look for headings with content following them
  const headings = responseNode.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  if (headings.length > 0) {
    headings.forEach((heading, index) => {
      // Create a section div that will contain the heading and its content
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'nested-section';
      
      // Get all elements after this heading but before the next heading
      let nextElement = heading.nextElementSibling;
      const sectionElements = [heading];
      
      while (nextElement && 
             (!nextElement.matches('h1, h2, h3, h4, h5, h6') || 
              (index === headings.length - 1))) {
        // Stop at the next heading unless this is the last heading
        if (nextElement.matches('h1, h2, h3, h4, h5, h6') && index !== headings.length - 1) {
          break;
        }
        
        sectionElements.push(nextElement);
        const tempNext = nextElement.nextElementSibling;
        nextElement = tempNext;
        
        // Stop at the end of parent container
        if (!nextElement) break;
      }
      
      // Don't create empty sections
      if (sectionElements.length > 1) {
        // Clone the elements to the section div
        heading.parentNode.insertBefore(sectionDiv, heading);
        sectionElements.forEach(el => {
          sectionDiv.appendChild(el);
        });
        
        sections.push(sectionDiv);
      }
    });
    
    return sections;
  }
  
  // If no headings found, look for list items or paragraphs
  const listItems = responseNode.querySelectorAll('li');
  if (listItems.length > 0) {
    return Array.from(listItems);
  }
  
  // If no list items, check for paragraphs
  const paragraphs = responseNode.querySelectorAll('p');
  if (paragraphs.length > 0) {
    return Array.from(paragraphs);
  }
  
  // If no structured content, return an empty array
  return [];
}

// Add a nested reply button to a section
function addNestedReplyButton(section, sectionId) {
  // Check if button already exists
  if (section.querySelector('.nested-reply-btn')) {
    return;
  }
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'nested-reply-container';
  
  // Create the button
  const button = document.createElement('button');
  button.className = 'nested-reply-btn';
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="nested-reply-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
    Ask a follow-up question
  `;
  
  // Create the form (hidden initially)
  const replyForm = document.createElement('div');
  replyForm.className = 'nested-reply-form hidden';
  replyForm.innerHTML = `
    <div class="nested-reply-input-container">
      <textarea 
        class="nested-reply-textarea" 
        placeholder="Ask a follow-up question about this section..." 
        rows="2"
      ></textarea>
      <button class="nested-reply-submit">
        <svg xmlns="http://www.w3.org/2000/svg" class="nested-submit-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  `;
  
  // Add event listener to toggle form visibility
  button.addEventListener('click', () => {
    replyForm.classList.toggle('hidden');
    if (!replyForm.classList.contains('hidden')) {
      replyForm.querySelector('textarea').focus();
    }
  });
  
  // Add event listener to submit question
  replyForm.querySelector('.nested-reply-submit').addEventListener('click', () => {
    const textarea = replyForm.querySelector('textarea');
    const question = textarea.value.trim();
    
    if (question) {
      submitNestedQuestion(section, sectionId, question);
      textarea.value = '';
      replyForm.classList.add('hidden');
    }
  });
  
  // Handle enter key in textarea (submit on Enter, new line on Shift+Enter)
  replyForm.querySelector('textarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      replyForm.querySelector('.nested-reply-submit').click();
    }
  });
  
  // Append elements
  buttonContainer.appendChild(button);
  buttonContainer.appendChild(replyForm);
  section.appendChild(buttonContainer);
}

// Submit a nested question and handle the response
async function submitNestedQuestion(section, sectionId, question) {
  // Get or create the nested response area
  let nestedResponseArea = section.querySelector('.nested-response-area');
  
  if (!nestedResponseArea) {
    nestedResponseArea = document.createElement('div');
    nestedResponseArea.className = 'nested-response-area';
    section.appendChild(nestedResponseArea);
  }
  
  // Create a unique ID for this question
  const questionId = generateUniqueId();
  
  // Create user question element
  const userQuestion = document.createElement('div');
  userQuestion.className = 'nested-user-question';
  userQuestion.setAttribute('data-question-id', questionId);
  userQuestion.innerHTML = `
    <div class="nested-user-bubble">
      <div class="nested-user-avatar">
        <span>U</span>
      </div>
      <div class="nested-user-content">
        <p>${escapeHtml(question)}</p>
      </div>
    </div>
  `;
  nestedResponseArea.appendChild(userQuestion);
  
  // Create loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'nested-loading';
  loadingIndicator.innerHTML = `
    <div class="nested-assistant-bubble">
      <div class="nested-assistant-avatar">
        <span>GPT</span>
      </div>
      <div class="nested-assistant-content">
        <div class="nested-loading-dots">
          <span>•</span>
          <span>•</span>
          <span>•</span>
        </div>
      </div>
    </div>
  `;
  nestedResponseArea.appendChild(loadingIndicator);
  
  // Store this conversation
  if (!nestedConversations[sectionId]) {
    nestedConversations[sectionId] = [];
  }
  
  // Extract the section content for context
  const sectionContent = extractSectionContent(section);
  
  // Now we need to send the question to ChatGPT
  // We'll do this by sending it to the main input field, with context about the section
  try {
    // Create the full question with context
    const fullQuestion = `I'm asking about this specific part of your previous response:\n\n${sectionContent}\n\nMy question is: ${question}`;
    
    // Submit the question to the main ChatGPT input
    await submitToChatGPT(fullQuestion);
    
    // The response will appear in the main thread, we need to extract it
    const response = await waitForChatGPTResponse();
    
    // Remove loading indicator
    nestedResponseArea.removeChild(loadingIndicator);
    
    // Create assistant response element
    const assistantResponse = document.createElement('div');
    assistantResponse.className = 'nested-assistant-response';
    assistantResponse.setAttribute('data-response-id', questionId);
    assistantResponse.innerHTML = `
      <div class="nested-assistant-bubble">
        <div class="nested-assistant-avatar">
          <span>GPT</span>
        </div>
        <div class="nested-assistant-content">
          <div class="nested-markdown">${response}</div>
          
          <div class="nested-followup-container">
            <button class="nested-followup-btn">
              <svg xmlns="http://www.w3.org/2000/svg" class="nested-reply-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Ask another follow-up
            </button>
            
            <div class="nested-reply-form hidden">
              <div class="nested-reply-input-container">
                <textarea 
                  class="nested-reply-textarea" 
                  placeholder="Ask another follow-up question..." 
                  rows="2"
                ></textarea>
                <button class="nested-reply-submit">
                  <svg xmlns="http://www.w3.org/2000/svg" class="nested-submit-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    nestedResponseArea.appendChild(assistantResponse);
    
    // Add event listeners for the nested follow-up button
    const followupBtn = assistantResponse.querySelector('.nested-followup-btn');
    const followupForm = assistantResponse.querySelector('.nested-reply-form');
    
    followupBtn.addEventListener('click', () => {
      followupForm.classList.toggle('hidden');
      if (!followupForm.classList.contains('hidden')) {
        followupForm.querySelector('textarea').focus();
      }
    });
    
    // Add event listener to submit nested follow-up
    const submitBtn = followupForm.querySelector('.nested-reply-submit');
    submitBtn.addEventListener('click', () => {
      const textarea = followupForm.querySelector('textarea');
      const followupQuestion = textarea.value.trim();
      
      if (followupQuestion) {
        submitNestedQuestion(section, sectionId, followupQuestion);
        textarea.value = '';
        followupForm.classList.add('hidden');
      }
    });
    
    // Handle enter key in textarea
    followupForm.querySelector('textarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBtn.click();
      }
    });
    
    // Store conversation in memory
    nestedConversations[sectionId].push({
      question: question,
      response: response,
      questionId: questionId
    });
    
    // Save conversations to storage if enabled
    if (settings.saveConversations && conversationId) {
      chrome.runtime.sendMessage({
        type: 'saveConversation',
        conversationId: conversationId,
        conversation: nestedConversations
      });
    }
    
  } catch (error) {
    // Remove loading indicator
    nestedResponseArea.removeChild(loadingIndicator);
    
    // Show error message
    const errorMessage = document.createElement('div');
    errorMessage.className = 'nested-error';
    errorMessage.innerHTML = `
      <div class="nested-assistant-bubble">
        <div class="nested-assistant-avatar">
          <span>GPT</span>
        </div>
        <div class="nested-assistant-content">
          <p>Sorry, there was an error processing your question. Please try again.</p>
          <p class="nested-error-details">${error.message}</p>
        </div>
      </div>
    `;
    nestedResponseArea.appendChild(errorMessage);
    
    logToConsole(`Error: ${error.message}`);
  }
}

// Extract readable content from a section for context
function extractSectionContent(section) {
  // Clone the section to avoid modifying the original
  const sectionClone = section.cloneNode(true);
  
  // Remove the nested reply button and any nested responses
  const replyContainer = sectionClone.querySelector('.nested-reply-container');
  if (replyContainer) {
    replyContainer.remove();
  }
  
  const responseArea = sectionClone.querySelector('.nested-response-area');
  if (responseArea) {
    responseArea.remove();
  }
  
  // Get the text content with some structure preservation
  return sectionClone.innerText.trim();
}

// Submit a question to the main ChatGPT input
async function submitToChatGPT(question) {
  // Find the main input field
  const inputField = document.querySelector('textarea[data-id="root"]');
  if (!inputField) {
    throw new Error('Could not find ChatGPT input field');
  }
  
  // Find the submit button
  const submitButton = inputField.closest('form')?.querySelector('button[data-testid="send-button"]');
  if (!submitButton) {
    throw new Error('Could not find ChatGPT submit button');
  }
  
  // Fill in the question
  // Use InputEvent to trigger any listeners
  inputField.value = question;
  inputField.dispatchEvent(new InputEvent('input', { bubbles: true }));
  
  // Submit the form
  submitButton.click();
  
  // Wait for the submit button to be disabled (indicates sending)
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (submitButton.disabled) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

// Wait for ChatGPT to respond and extract the response
async function waitForChatGPTResponse() {
  return new Promise((resolve, reject) => {
    // Set a timeout in case something goes wrong
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timed out waiting for ChatGPT response'));
    }, 60000); // 60 second timeout
    
    // Find the main chat container
    const chatContainer = document.querySelector('main');
    if (!chatContainer) {
      clearTimeout(timeout);
      reject(new Error('Could not find chat container'));
      return;
    }
    
    // Create an observer to watch for the new response
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Look for new response element
          const lastResponseNode = chatContainer.querySelector('div[data-message-author-role="assistant"]:last-child');
          
          if (lastResponseNode && !lastResponseNode.querySelector('.result-thinking')) {
            // Response is complete, get the content
            const contentNode = lastResponseNode.querySelector('.markdown');
            if (contentNode) {
              observer.disconnect();
              clearTimeout(timeout);
              
              // Get HTML content
              const responseHTML = contentNode.innerHTML;
              resolve(responseHTML);
              
              // Skip the last response from being processed by our main observer
              // since we're handling it specially
              contentNode.dataset.nestedProcessed = 'true';
              
              // Wait a bit then remove the last user question and response
              // since we've captured it for the nested view
              setTimeout(() => {
                try {
                  // Find the last user message
                  const lastUserNode = chatContainer.querySelector('div[data-message-author-role="user"]:last-child');
                  
                  if (lastUserNode) {
                    lastUserNode.style.display = 'none';
                  }
                  
                  if (lastResponseNode) {
                    lastResponseNode.style.display = 'none';
                  }
                } catch (e) {
                  logToConsole('Error hiding messages: ' + e.message);
                }
              }, 500);
              
              return;
            }
          }
        }
      }
    });
    
    // Start observing
    observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });
  });
}

// Restore a nested conversation from storage
function restoreNestedConversation(section, sectionId, conversations) {
  if (!conversations || conversations.length === 0) return;
  
  // Create nested response area
  const nestedResponseArea = document.createElement('div');
  nestedResponseArea.className = 'nested-response-area';
  
  // Add each Q&A pair
  conversations.forEach(conv => {
    // Add user question
    const userQuestion = document.createElement('div');
    userQuestion.className = 'nested-user-question';
    userQuestion.setAttribute('data-question-id', conv.questionId);
    userQuestion.innerHTML = `
      <div class="nested-user-bubble">
        <div class="nested-user-avatar">
          <span>U</span>
        </div>
        <div class="nested-user-content">
          <p>${escapeHtml(conv.question)}</p>
        </div>
      </div>
    `;
    nestedResponseArea.appendChild(userQuestion);
    
    // Add assistant response
    const assistantResponse = document.createElement('div');
    assistantResponse.className = 'nested-assistant-response';
    assistantResponse.setAttribute('data-response-id', conv.questionId);
    assistantResponse.innerHTML = `
      <div class="nested-assistant-bubble">
        <div class="nested-assistant-avatar">
          <span>GPT</span>
        </div>
        <div class="nested-assistant-content">
          <div class="nested-markdown">${conv.response}</div>
          
          <div class="nested-followup-container">
            <button class="nested-followup-btn">
              <svg xmlns="http://www.w3.org/2000/svg" class="nested-reply-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Ask another follow-up
            </button>
            
            <div class="nested-reply-form hidden">
              <div class="nested-reply-input-container">
                <textarea 
                  class="nested-reply-textarea" 
                  placeholder="Ask another follow-up question..." 
                  rows="2"
                ></textarea>
                <button class="nested-reply-submit">
                  <svg xmlns="http://www.w3.org/2000/svg" class="nested-submit-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    nestedResponseArea.appendChild(assistantResponse);
    
    // Add event listeners for the nested follow-up button
    const followupBtn = assistantResponse.querySelector('.nested-followup-btn');
    const followupForm = assistantResponse.querySelector('.nested-reply-form');
    
    followupBtn.addEventListener('click', () => {
      followupForm.classList.toggle('hidden');
      if (!followupForm.classList.contains('hidden')) {
        followupForm.querySelector('textarea').focus();
      }
    });
    
    // Add event listener to submit nested follow-up
    const submitBtn = followupForm.querySelector('.nested-reply-submit');
    submitBtn.addEventListener('click', () => {
      const textarea = followupForm.querySelector('textarea');
      const followupQuestion = textarea.value.trim();
      
      if (followupQuestion) {
        submitNestedQuestion(section, sectionId, followupQuestion);
        textarea.value = '';
        followupForm.classList.add('hidden');
      }
    });
    
    // Handle enter key in textarea
    followupForm.querySelector('textarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBtn.click();
      }
    });
  });
  
  // Append the nested response area to the section
  section.appendChild(nestedResponseArea);
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start observing when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeChatGPT);
} else {
  observeChatGPT();
}
