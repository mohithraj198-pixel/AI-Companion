import { AppSettings, DisplaySource, ActiveWindowInfo } from '../../shared/types';

declare global {
  interface Window {
    api: any;
  }
}

let settings: AppSettings;
let availableVoices: SpeechSynthesisVoice[] = [];

// DOM Elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const tabTitle = document.getElementById('tab-title') as HTMLElement;
const saveAllBtn = document.getElementById('save-all-btn') as HTMLButtonElement;

// Privacy tab
const privacyConsentToggle = document.getElementById('privacy-consent-toggle') as HTMLInputElement;
const historyRetentionSelect = document.getElementById('history-retention-select') as HTMLSelectElement;
const encryptedCountBadge = document.getElementById('encrypted-count-badge') as HTMLElement;
const purgeHistoryBtn = document.getElementById('purge-history-btn') as HTMLButtonElement;

// Groq tab
const groqApiKeyInput = document.getElementById('groq-api-key-input') as HTMLInputElement;
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility-btn') as HTMLButtonElement;
const saveKeyBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
const deleteKeyBtn = document.getElementById('delete-key-btn') as HTMLButtonElement;
const keyStatusText = document.getElementById('key-status-text') as HTMLElement;
const testConnectionBtn = document.getElementById('test-connection-btn') as HTMLButtonElement;
const testResultIndicator = document.getElementById('test-result-indicator') as HTMLElement;
const groqEndpointInput = document.getElementById('groq-endpoint-input') as HTMLInputElement;
const groqModelInput = document.getElementById('groq-model-input') as HTMLInputElement;
const dailyLimitInput = document.getElementById('daily-limit-input') as HTMLInputElement;
const quotaUsageText = document.getElementById('quota-usage-text') as HTMLElement;
const quotaProgressBar = document.getElementById('quota-progress-bar') as HTMLElement;
const minConfidenceSlider = document.getElementById('min-confidence-slider') as HTMLInputElement;
const confidenceVal = document.getElementById('confidence-val') as HTMLElement;

// Screen tab
const displaySelect = document.getElementById('display-select') as HTMLSelectElement;
const intervalSlider = document.getElementById('interval-slider') as HTMLInputElement;
const intervalVal = document.getElementById('interval-val') as HTMLElement;
const sensitivitySlider = document.getElementById('sensitivity-slider') as HTMLInputElement;
const sensitivityVal = document.getElementById('sensitivity-val') as HTMLElement;

// Voice tab
const speechMuteToggle = document.getElementById('speech-mute-toggle') as HTMLInputElement;
const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedVal = document.getElementById('speed-val') as HTMLElement;
const pitchSlider = document.getElementById('pitch-slider') as HTMLInputElement;
const pitchVal = document.getElementById('pitch-val') as HTMLElement;
const testVoiceBtn = document.getElementById('test-voice-btn') as HTMLButtonElement;

// Shield tab
const activeWinContainer = document.getElementById('active-win-container') as HTMLElement;
const activeWinDot = document.getElementById('active-win-dot') as HTMLElement;
const activeWinProc = document.getElementById('active-win-proc') as HTMLElement;
const activeWinTitle = document.getElementById('active-win-title') as HTMLElement;
const activeWinBadge = document.getElementById('active-win-badge') as HTMLElement;
const processTagsContainer = document.getElementById('process-tags') as HTMLElement;
const addProcessInput = document.getElementById('add-process-input') as HTMLInputElement;
const addProcessBtn = document.getElementById('add-process-btn') as HTMLButtonElement;
const titleTagsContainer = document.getElementById('title-tags') as HTMLElement;
const addTitleInput = document.getElementById('add-title-input') as HTMLInputElement;
const addTitleBtn = document.getElementById('add-title-btn') as HTMLButtonElement;

// Tab Switcher
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    navTabs.forEach(t => t.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    const activePane = document.getElementById(`tab-${target}`);
    if (activePane) activePane.classList.add('active');

    // Update title
    const titles: Record<string, string> = {
      privacy: 'Privacy Consent & Data Policy',
      groq: 'Groq AI Vision Configuration',
      screen: 'Screen Observation & Interval Controls',
      voice: 'Windows Text-to-Speech Settings',
      shield: 'Sensitive App & Window Title Shield',
      shortcuts: 'Global Shortcuts & Diagnostics'
    };
    if (target && titles[target]) {
      tabTitle.innerText = titles[target];
    }
  });
});

// Render Tag Badges
function renderProcessTags() {
  processTagsContainer.innerHTML = '';
  settings.excludedProcesses.forEach((proc, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-badge';
    tag.innerHTML = `${proc} <span class="tag-remove" data-index="${index}">✕</span>`;
    processTagsContainer.appendChild(tag);
  });

  processTagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0', 10);
      settings.excludedProcesses.splice(idx, 1);
      renderProcessTags();
      autoSave();
    });
  });
}

function renderTitleTags() {
  titleTagsContainer.innerHTML = '';
  settings.excludedTitleKeywords.forEach((kw, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag-badge';
    tag.innerHTML = `"${kw}" <span class="tag-remove" data-index="${index}">✕</span>`;
    titleTagsContainer.appendChild(tag);
  });

  titleTagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0', 10);
      settings.excludedTitleKeywords.splice(idx, 1);
      renderTitleTags();
      autoSave();
    });
  });
}

// Populate Windows TTS voices
function populateVoices() {
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices();
  if (availableVoices.length === 0) return;

  voiceSelect.innerHTML = '<option value="">Default System Voice</option>';
  availableVoices.forEach(voice => {
    const opt = document.createElement('option');
    opt.value = voice.voiceURI || voice.name;
    opt.innerText = `${voice.name} (${voice.lang})`;
    if (settings && (settings.selectedVoiceURI === voice.voiceURI || settings.selectedVoiceURI === voice.name)) {
      opt.selected = true;
    }
    voiceSelect.appendChild(opt);
  });
}

// Populate Displays
async function populateDisplays() {
  try {
    const displays: DisplaySource[] = await window.api.getDisplays();
    displaySelect.innerHTML = '';
    displays.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.innerText = d.name;
      if (settings.selectedDisplayId === d.id) {
        opt.selected = true;
      }
      displaySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed fetching displays', err);
  }
}

// Load and populate settings
async function loadSettings() {
  settings = await window.api.getSettings();

  // Privacy
  privacyConsentToggle.checked = settings.privacyConsentGiven;
  historyRetentionSelect.value = String(settings.historyRetentionMinutes);
  encryptedCountBadge.innerText = `${settings.encryptedHistoryCount || 0} Encrypted Files Cached`;

  // Groq
  if (settings.hasApiKey) {
    groqApiKeyInput.placeholder = settings.maskedApiKey || '••••••••••••';
    keyStatusText.innerText = `Key Status: Stored securely (${settings.maskedApiKey})`;
    keyStatusText.className = 'text-green';
  } else {
    groqApiKeyInput.placeholder = 'Paste your Groq API key here (gsk_...)';
    keyStatusText.innerText = 'Key Status: No key configured. Enter Groq key above.';
    keyStatusText.className = '';
  }

  groqEndpointInput.value = settings.groqEndpoint;
  groqModelInput.value = settings.groqModel;
  dailyLimitInput.value = String(settings.dailyLimit);
  updateQuotaUI();

  minConfidenceSlider.value = String(Math.round(settings.minConfidence * 100));
  confidenceVal.innerText = `${minConfidenceSlider.value}%`;

  // Screen
  intervalSlider.value = String(settings.captureIntervalSeconds);
  intervalVal.innerText = `${settings.captureIntervalSeconds} seconds`;
  sensitivitySlider.value = String(settings.sensitivity);
  sensitivityVal.innerText = `${settings.sensitivity}%`;

  // Voice
  speechMuteToggle.checked = settings.speechMuted;
  speedSlider.value = String(settings.speechRate);
  speedVal.innerText = `${settings.speechRate}x`;
  pitchSlider.value = String(settings.speechPitch);
  pitchVal.innerText = `${settings.speechPitch}x`;

  // Shield
  renderProcessTags();
  renderTitleTags();

  await populateDisplays();
  populateVoices();

  // Initial active window status
  try {
    if (window.api.getActiveWindow) {
      const activeInfo: ActiveWindowInfo = await window.api.getActiveWindow();
      if (activeInfo) {
        activeWinProc.innerText = activeInfo.processName || 'Unknown';
        activeWinTitle.innerText = activeInfo.windowTitle || '(No title)';
        if (activeInfo.isShielded) {
          activeWinDot.className = 'preview-dot shielded';
          activeWinBadge.className = 'badge shielded';
          activeWinBadge.innerText = 'Shielded (Capture Paused)';
        } else {
          activeWinDot.className = 'preview-dot';
          activeWinBadge.className = 'badge';
          activeWinBadge.innerText = 'Safe (Observing)';
        }
      }
    }
  } catch {}

  updateGlobalStatusUI();
}

const globalStatusPill = document.getElementById('global-status-pill');
const globalStatusText = document.getElementById('global-status-text');

function updateGlobalStatusUI() {
  if (!globalStatusText || !globalStatusPill) return;
  const dot = globalStatusPill.querySelector('.dot') as HTMLElement;
  if (!settings.monitoringEnabled) {
    globalStatusText.innerText = 'Monitoring Paused';
    if (dot) dot.style.background = '#f59e0b';
  } else if (!settings.privacyConsentGiven) {
    globalStatusText.innerText = 'Awaiting Consent';
    if (dot) dot.style.background = '#f59e0b';
  } else if (!settings.hasApiKey) {
    globalStatusText.innerText = 'API Key Missing';
    if (dot) dot.style.background = '#f43f5e';
  } else {
    globalStatusText.innerText = 'Monitoring Active';
    if (dot) dot.style.background = '#10b981';
  }
}

function updateQuotaUI() {
  const used = settings.requestsToday || 0;
  const limit = settings.dailyLimit || 100;
  quotaUsageText.innerText = `${used} / ${limit} today`;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  quotaProgressBar.style.width = `${pct}%`;
  if (pct >= 90) {
    quotaProgressBar.style.background = '#f43f5e';
  } else {
    quotaProgressBar.style.background = 'linear-gradient(90deg, var(--accent), var(--primary))';
  }
}

async function autoSave() {
  const partial: Partial<AppSettings> = {
    privacyConsentGiven: privacyConsentToggle.checked,
    historyRetentionMinutes: parseInt(historyRetentionSelect.value, 10),
    groqEndpoint: groqEndpointInput.value.trim(),
    groqModel: groqModelInput.value.trim(),
    dailyLimit: parseInt(dailyLimitInput.value, 10) || 100,
    minConfidence: parseInt(minConfidenceSlider.value, 10) / 100,
    selectedDisplayId: displaySelect.value,
    captureIntervalSeconds: parseInt(intervalSlider.value, 10) || 8,
    sensitivity: parseInt(sensitivitySlider.value, 10) || 50,
    speechMuted: speechMuteToggle.checked,
    selectedVoiceURI: voiceSelect.value,
    speechRate: parseFloat(speedSlider.value) || 1.0,
    speechPitch: parseFloat(pitchSlider.value) || 1.0,
    excludedProcesses: settings.excludedProcesses,
    excludedTitleKeywords: settings.excludedTitleKeywords
  };

  settings = await window.api.updateSettings(partial);
  updateGlobalStatusUI();
}

// Event Listeners
saveAllBtn.addEventListener('click', async () => {
  await autoSave();
  saveAllBtn.innerText = '✓ Saved';
  setTimeout(() => { saveAllBtn.innerText = 'Save Changes'; }, 1500);
});

// Privacy Toggle
privacyConsentToggle.addEventListener('change', autoSave);
historyRetentionSelect.addEventListener('change', autoSave);

purgeHistoryBtn.addEventListener('click', async () => {
  const count = await window.api.purgeHistory();
  encryptedCountBadge.innerText = '0 Encrypted Files Cached';
  purgeHistoryBtn.innerText = `Deleted ${count} files`;
  setTimeout(() => { purgeHistoryBtn.innerText = 'Purge Encrypted History Now'; }, 2000);
});

// Groq Key Actions
saveKeyBtn.addEventListener('click', async () => {
  const rawKey = groqApiKeyInput.value.trim();
  if (!rawKey) {
    alert('Please enter a valid Groq API key.');
    return;
  }

  saveKeyBtn.disabled = true;
  saveKeyBtn.innerText = 'Encrypting...';

  const ok = await window.api.saveApiKey(rawKey);
  groqApiKeyInput.value = '';
  await loadSettings();

  saveKeyBtn.disabled = false;
  saveKeyBtn.innerText = ok ? '✓ Saved' : 'Error';
  setTimeout(() => { saveKeyBtn.innerText = 'Save Key'; }, 1800);
});

deleteKeyBtn.addEventListener('click', async () => {
  if (confirm('Delete the stored Groq API key from Windows DPAPI storage?')) {
    await window.api.deleteApiKey();
    await loadSettings();
  }
});

toggleKeyVisibilityBtn.addEventListener('click', () => {
  if (groqApiKeyInput.type === 'password') {
    groqApiKeyInput.type = 'text';
    toggleKeyVisibilityBtn.innerText = '🔒';
  } else {
    groqApiKeyInput.type = 'password';
    toggleKeyVisibilityBtn.innerText = '👁';
  }
});

testConnectionBtn.addEventListener('click', async () => {
  testConnectionBtn.disabled = true;
  testConnectionBtn.innerText = 'Testing...';
  testResultIndicator.className = 'test-result-pill hidden';

  const tempKey = groqApiKeyInput.value.trim() || undefined;
  const endpoint = groqEndpointInput.value.trim();
  const model = groqModelInput.value.trim();

  const res = await window.api.testGroqConnection(tempKey, endpoint, model);

  testResultIndicator.classList.remove('hidden');
  if (res.success) {
    testResultIndicator.className = 'test-result-pill success';
    testResultIndicator.innerText = `✓ ${res.message}`;
  } else {
    testResultIndicator.className = 'test-result-pill error';
    testResultIndicator.innerText = `✕ ${res.message}`;
  }

  testConnectionBtn.disabled = false;
  testConnectionBtn.innerText = '⚡ Test Groq Connection';
});

// Slider Input Handlers
intervalSlider.addEventListener('input', () => {
  intervalVal.innerText = `${intervalSlider.value} seconds`;
  autoSave();
});

sensitivitySlider.addEventListener('input', () => {
  sensitivityVal.innerText = `${sensitivitySlider.value}%`;
  autoSave();
});

minConfidenceSlider.addEventListener('input', () => {
  confidenceVal.innerText = `${minConfidenceSlider.value}%`;
  autoSave();
});

speedSlider.addEventListener('input', () => {
  speedVal.innerText = `${speedSlider.value}x`;
  autoSave();
});

pitchSlider.addEventListener('input', () => {
  pitchVal.innerText = `${pitchSlider.value}x`;
  autoSave();
});

speechMuteToggle.addEventListener('change', autoSave);
displaySelect.addEventListener('change', autoSave);
voiceSelect.addEventListener('change', autoSave);
dailyLimitInput.addEventListener('change', autoSave);
groqEndpointInput.addEventListener('change', autoSave);
groqModelInput.addEventListener('change', autoSave);

// Test Voice Button
testVoiceBtn.addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance('Hello! I am your AI Companion. Ready to help with code!');
  utterance.rate = parseFloat(speedSlider.value) || 1.0;
  utterance.pitch = parseFloat(pitchSlider.value) || 1.0;

  if (voiceSelect.value) {
    const chosen = availableVoices.find(v => v.voiceURI === voiceSelect.value || v.name === voiceSelect.value);
    if (chosen) utterance.voice = chosen;
  }

  window.speechSynthesis.speak(utterance);
});

// Add Excluded Process Tag
addProcessBtn.addEventListener('click', () => {
  const val = addProcessInput.value.trim().toLowerCase().replace('.exe', '');
  if (val && !settings.excludedProcesses.includes(val)) {
    settings.excludedProcesses.push(val);
    addProcessInput.value = '';
    renderProcessTags();
    autoSave();
  }
});

addProcessInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProcessBtn.click();
});

// Add Excluded Title Keyword Tag
addTitleBtn.addEventListener('click', () => {
  const val = addTitleInput.value.trim().toLowerCase();
  if (val && !settings.excludedTitleKeywords.includes(val)) {
    settings.excludedTitleKeywords.push(val);
    addTitleInput.value = '';
    renderTitleTags();
    autoSave();
  }
});

addTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTitleBtn.click();
});

// Live Shield Status update from backend
window.api.onShieldStatus((info: ActiveWindowInfo) => {
  activeWinProc.innerText = info.processName || 'Unknown';
  activeWinTitle.innerText = info.windowTitle || '(No title)';

  if (info.isShielded) {
    activeWinDot.className = 'preview-dot shielded';
    activeWinBadge.className = 'badge shielded';
    activeWinBadge.innerText = 'Shielded (Capture Paused)';
  } else {
    activeWinDot.className = 'preview-dot';
    activeWinBadge.className = 'badge';
    activeWinBadge.innerText = 'Safe (Observing)';
  }
});

// Handle settings updates from other windows
window.api.onSettingsUpdated((updated: AppSettings) => {
  settings = updated;
  updateQuotaUI();
  updateGlobalStatusUI();
  encryptedCountBadge.innerText = `${settings.encryptedHistoryCount || 0} Encrypted Files Cached`;
});

// Listen for speech synthesis voices loaded
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    populateVoices();
  };
}

loadSettings();
