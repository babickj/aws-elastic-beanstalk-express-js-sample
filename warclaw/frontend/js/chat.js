/**
 * WarClaw — Chat Module
 * WebSocket streaming AI chat.
 */

let chatWs = null;
let chatHistory = [];
let isStreaming = false;

const HINTS = [
  'What systems are on this LAN?',
  'Create a navigation dashboard',
  'Build a MODBUS register viewer',
  'Explain NMEA 0183 sentences',
  'Create a ship status overview app',
  'How do I integrate with AIS?',
];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessageContent(text) {
  // Code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return text;
}

function appendMessage(role, content, streaming = false) {
  const container = document.getElementById('chat-messages');
  const id = `msg-${Date.now()}`;

  const isUser = role === 'user';
  const avatarChar = isUser ? '⬡' : '⚙';
  const roleLabel = isUser ? 'CREW' : 'WARCLAW AI';

  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.id = id;
  el.innerHTML = `
    <div class="msg-avatar">${avatarChar}</div>
    <div class="msg-body">
      <div class="msg-role">${roleLabel}</div>
      <div class="msg-content" id="${id}-content">
        ${streaming ? '<span class="typing-cursor"></span>' : formatMessageContent(escapeHtml(content))}
      </div>
    </div>
  `;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateStreamingMessage(msgId, fullText) {
  const el = document.getElementById(`${msgId}-content`);
  if (!el) return;
  el.innerHTML = formatMessageContent(escapeHtml(fullText)) + '<span class="typing-cursor"></span>';
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function finalizeStreamingMessage(msgId, fullText) {
  const el = document.getElementById(`${msgId}-content`);
  if (!el) return;
  el.innerHTML = formatMessageContent(escapeHtml(fullText));
}

function connectChatWs() {
  if (chatWs && chatWs.readyState === WebSocket.OPEN) return chatWs;
  chatWs = API.ws('/api/chat/ws');

  chatWs.onopen = () => {
    document.getElementById('ws-status').textContent = 'CONNECTED';
    document.getElementById('ws-status').style.color = 'var(--accent-green)';
  };

  chatWs.onclose = () => {
    document.getElementById('ws-status').textContent = 'DISCONNECTED';
    document.getElementById('ws-status').style.color = 'var(--accent-red)';
    chatWs = null;
  };

  chatWs.onerror = () => {
    toast('Chat connection error', 'error');
  };

  return chatWs;
}

async function sendChatMessage() {
  if (isStreaming) return;

  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  if (!State.modelReady) {
    toast('No AI model loaded. Go to Hardware tab to load a model.', 'error');
    return;
  }

  input.value = '';
  input.style.height = 'auto';

  appendMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  const ws = connectChatWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Wait for connection
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WS timeout')), 5000);
      ws.onopen = () => { clearTimeout(t); resolve(); };
      ws.onerror = () => { clearTimeout(t); reject(new Error('WS error')); };
    }).catch(e => {
      toast('Could not connect to AI: ' + e.message, 'error');
      return;
    });
  }

  const msgId = appendMessage('assistant', '', true);
  let responseText = '';

  isStreaming = true;
  document.getElementById('chat-send-btn').disabled = true;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.token) {
      responseText += data.token;
      updateStreamingMessage(msgId, responseText);
    } else if (data.done) {
      finalizeStreamingMessage(msgId, responseText);
      chatHistory.push({ role: 'assistant', content: responseText });
      isStreaming = false;
      document.getElementById('chat-send-btn').disabled = false;
    } else if (data.error) {
      finalizeStreamingMessage(msgId, `[Error: ${data.error}]`);
      isStreaming = false;
      document.getElementById('chat-send-btn').disabled = false;
    }
  };

  ws.send(JSON.stringify({
    message,
    history: chatHistory.slice(-10),  // last 10 turns context
    max_tokens: 2048,
    temperature: 0.7,
  }));
}

function initChat() {
  // Hint chips
  const hintContainer = document.querySelector('.chat-hints');
  HINTS.forEach(hint => {
    const chip = document.createElement('span');
    chip.className = 'hint-chip';
    chip.textContent = hint;
    chip.onclick = () => {
      document.getElementById('chat-input').value = hint;
      sendChatMessage();
    };
    hintContainer.appendChild(chip);
  });

  // Send button
  document.getElementById('chat-send-btn').onclick = sendChatMessage;

  // Enter to send (Shift+Enter for newline)
  const input = document.getElementById('chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  // Clear chat
  document.getElementById('chat-clear-btn').onclick = () => {
    document.getElementById('chat-messages').innerHTML = '';
    chatHistory = [];
    toast('Chat cleared', 'info');
  };

  // Welcome message (not added to history)
  setTimeout(() => {
    appendMessage('assistant',
      'WARCLAW AI ONLINE — EdgeRunner Naval LAN OS\n\n' +
      'I can help you:\n' +
      '• Analyze and monitor systems on the ship LAN\n' +
      '• Parse NMEA, MODBUS, and IEC 61162 data\n' +
      '• Generate full-stack applications for ship operations\n\n' +
      'Load a GGUF model in the Hardware tab to begin, or ask me anything.'
    );
  }, 300);

  // Connect WS eagerly
  connectChatWs();
}

document.addEventListener('DOMContentLoaded', initChat);
