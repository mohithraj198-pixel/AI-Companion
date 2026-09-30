import { AppSettings, CatAnimationState, GroqSuggestion } from '../../shared/types';

declare global {
  interface Window {
    api: any;
  }
}

let currentSettings: AppSettings | null = null;
let bubbleTimeout: any = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

// DOM Elements
const catWrapper = document.getElementById('cat-container') as HTMLElement;
const speechBubble = document.getElementById('speech-bubble') as HTMLElement;
const bubbleTitle = document.getElementById('bubble-title') as HTMLElement;
const mistakePill = document.getElementById('mistake-pill') as HTMLElement;
const bubbleContent = document.getElementById('bubble-content') as HTMLElement;
const pointingBeam = document.getElementById('pointing-beam') as HTMLElement;
const dismissBtn = document.getElementById('dismiss-btn') as HTMLButtonElement;
const muteQuickBtn = document.getElementById('mute-quick-btn') as HTMLButtonElement;
const toggleMonitorBtn = document.getElementById('toggle-monitor-btn') as HTMLButtonElement;
const openSettingsBtn = document.getElementById('open-settings-btn') as HTMLButtonElement;
const catBody = document.getElementById('cat-body') as HTMLElement;

// Helper to escape HTML and render backticked code snippets safely
function formatSuggestionText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Text-to-Speech Engine
function speakText(text: string) {
  if (!('speechSynthesis' in window)) return;

  // Stop any currently speaking speech
  window.speechSynthesis.cancel();

  if (currentSettings?.speechMuted) {
    // Speech is muted, but text message still appears!
    return;
  }

  // Sanitize text for speech (strip backticks, urls, code symbols)
  const readableText = text
    .replace(/```[\s\S]*?```/g, 'Code snippet provided.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link');

  const utterance = new SpeechSynthesisUtterance(readableText);
  utterance.rate = currentSettings?.speechRate || 1.0;
  utterance.pitch = currentSettings?.speechPitch || 1.0;

  // Select voice if configured
  if (currentSettings?.selectedVoiceURI) {
    const voices = window.speechSynthesis.getVoices();
    const chosenVoice = voices.find(v => v.voiceURI === currentSettings?.selectedVoiceURI || v.name === currentSettings?.selectedVoiceURI);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }
  }

  utterance.onend = () => {
    currentUtterance = null;
    // Stop mouth movement animation while preserving the visible suggestion bubble
    catWrapper.classList.remove('speaking');
  };

  utterance.onerror = () => {
    currentUtterance = null;
    catWrapper.classList.remove('speaking');
  };

  currentUtterance = utterance;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  catWrapper.classList.remove('speaking');
}

function setCatState(state: CatAnimationState, tooltipMsg?: string) {
  catWrapper.className = `cat-wrapper ${state}`;

  if (state === 'idle') {
    pointingBeam.classList.add('hidden');
    mistakePill.classList.add('hidden');
    // If a suggestion is currently being displayed, do NOT hide the speech bubble
    if (!bubbleTimeout) {
      speechBubble.classList.add('hidden');
    }
  } else if (state === 'thinking') {
    pointingBeam.classList.add('hidden');
    // Keep speech bubble hidden during routine background thinking cycles
    // The cat's subtle aura and eyes indicate background processing
    if (!bubbleTimeout) {
      speechBubble.classList.add('hidden');
    }
  } else if (state === 'paused') {
    pointingBeam.classList.add('hidden');
    mistakePill.classList.add('hidden');
    bubbleTitle.innerText = 'Companion Status';
    bubbleContent.innerText = tooltipMsg || 'Monitoring paused';
    bubbleContent.classList.remove('has-mistake');
    speechBubble.classList.remove('hidden');
  } else if (state === 'shielded') {
    pointingBeam.classList.add('hidden');
    mistakePill.classList.add('hidden');
    bubbleTitle.innerText = 'Privacy Shield Active';
    bubbleContent.innerText = tooltipMsg || 'Sensitive application detected. Capture paused.';
    bubbleContent.classList.remove('has-mistake');
    speechBubble.classList.remove('hidden');
  } else if (state === 'error') {
    pointingBeam.classList.add('hidden');
    mistakePill.classList.add('hidden');
    bubbleTitle.innerText = 'Companion Notice';
    bubbleContent.innerText = tooltipMsg || 'Groq request failed. Check API key.';
    bubbleContent.classList.remove('has-mistake');
    speechBubble.classList.remove('hidden');
  }
}

function showSuggestion(suggestion: GroqSuggestion, autoDismissSeconds = 18) {
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }

  speechBubble.classList.remove('hidden');
  const isMistake = suggestion.hasMistake || suggestion.urgency === 'high' || suggestion.urgency === 'medium';

  bubbleContent.innerHTML = formatSuggestionText(suggestion.text);
  bubbleContent.classList.add('has-mistake');

  if (isMistake) {
    // Activate pointing animation and laser pointer
    setCatState('pointing');
    pointingBeam.classList.remove('hidden');
    mistakePill.classList.remove('hidden');
    mistakePill.innerText = suggestion.urgency === 'high' ? '⚠️ Bug Detected' : '💡 Mistake Detected';
    bubbleTitle.innerText = 'Companion Status';
  } else {
    setCatState('speaking');
    pointingBeam.classList.add('hidden');
    mistakePill.classList.add('hidden');
    bubbleTitle.innerText = 'Companion Status';
  }

  speakText(suggestion.text);

  if (autoDismissSeconds > 0) {
    bubbleTimeout = setTimeout(() => {
      resetToObserving();
    }, autoDismissSeconds * 1000);
  }
}

function resetToObserving() {
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  stopSpeech();
  setCatState('idle');
  speechBubble.classList.add('hidden');
}

function updateMuteButtonUI() {
  if (currentSettings?.speechMuted) {
    muteQuickBtn.classList.add('muted');
    muteQuickBtn.title = 'Voice is Muted (Click to Unmute)';
  } else {
    muteQuickBtn.classList.remove('muted');
    muteQuickBtn.title = 'Voice is Active (Click to Mute)';
  }
}

function updateMonitorButtonUI() {
  if (currentSettings?.monitoringEnabled) {
    toggleMonitorBtn.innerText = '⏸';
    toggleMonitorBtn.title = 'Pause Monitoring (Ctrl+Alt+M)';
  } else {
    toggleMonitorBtn.innerText = '▶';
    toggleMonitorBtn.title = 'Resume Monitoring (Ctrl+Alt+M)';
  }
}

// Initial setup
async function init() {
  currentSettings = await window.api.getSettings();
  updateMuteButtonUI();
  updateMonitorButtonUI();

  if (currentSettings?.monitoringEnabled) {
    setCatState('idle');
  } else {
    setCatState('paused', 'Monitoring paused');
  }

  // Pre-load speech voices
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      // Voices loaded
    };
  }

  // Handle Suggestions from Groq
  window.api.onSuggestion((suggestion: GroqSuggestion) => {
    showSuggestion(suggestion, 18);
  });

  // Handle State Changes
  window.api.onStateChange((state: CatAnimationState, message?: string) => {
    if (state === 'pointing' || state === 'speaking') {
      return;
    }
    // If a suggestion is actively visible on screen, do not let routine background idle/thinking wipe it out
    if (bubbleTimeout && (state === 'idle' || state === 'thinking')) {
      return;
    }
    setCatState(state, message);
  });

  // Handle Settings Updates
  window.api.onSettingsUpdated((updated: AppSettings) => {
    currentSettings = updated;
    updateMuteButtonUI();
    updateMonitorButtonUI();
    if (!updated.monitoringEnabled && !catWrapper.classList.contains('shielded')) {
      setCatState('paused');
    } else if (updated.monitoringEnabled && catWrapper.classList.contains('paused')) {
      setCatState('idle');
    }
  });

  // UI Event Listeners
  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetToObserving();
  });

  muteQuickBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentSettings) return;
    const isMuted = !currentSettings.speechMuted;
    if (isMuted) stopSpeech();
    currentSettings = await window.api.updateSettings({ speechMuted: isMuted });
    updateMuteButtonUI();
  });

  toggleMonitorBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const active = await window.api.toggleMonitoring();
    if (currentSettings) {
      currentSettings.monitoringEnabled = active;
      updateMonitorButtonUI();
    }
  });

  openSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.openSettings();
  });

  catBody.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    window.api.openSettings();
  });
}

init();
