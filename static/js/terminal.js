/**
 * Termius Terminal Manager
 * Supports multi-tab interactive SSH terminal sessions with xterm.js & WebSockets
 */

class TerminalSessionManager {
  constructor() {
    this.sessions = new Map(); // id -> { hostId, hostLabel, term, fitAddon, socket, container, status }
    this.activeSessionId = null;
    this.fontSize = 14;
    this.theme = 'termius-dark';
  }

  getThemes() {
    return {
      'termius-dark': {
        background: '#0d0f14',
        foreground: '#f1f2f6',
        cursor: '#6c5ce7',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(108, 92, 231, 0.4)',
        black: '#1e2230',
        red: '#ff7675',
        green: '#00b894',
        yellow: '#fdcb6e',
        blue: '#74b9ff',
        magenta: '#a29bfe',
        cyan: '#00cec9',
        white: '#dfe6e9',
        brightBlack: '#636e84',
        brightRed: '#ff7675',
        brightGreen: '#55efc4',
        brightYellow: '#ffeaa7',
        brightBlue: '#0984e3',
        brightMagenta: '#6c5ce7',
        brightCyan: '#81ecec',
        brightWhite: '#ffffff',
      },
      'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selectionBackground: '#44475a',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
      },
      'nord': {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#88c0d0',
        selectionBackground: '#434c5e',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
      },
      'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        selectionBackground: '#49483e',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
      }
    };
  }

  openSession(hostId, hostLabel) {
    const sessionId = 'term-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    // Switch view to terminals
    if (window.app) {
      window.app.switchView('terminals-view');
    }

    // Create session wrapper container
    const viewport = document.getElementById('xterm-container');
    const sessionDiv = document.createElement('div');
    sessionDiv.id = `session-wrapper-${sessionId}`;
    sessionDiv.style.width = '100%';
    sessionDiv.style.height = '100%';
    sessionDiv.style.display = 'none';
    viewport.appendChild(sessionDiv);

    // Instantiate xterm
    const themes = this.getThemes();
    const currentTheme = themes[this.theme] || themes['termius-dark'];

    const term = new Terminal({
      theme: currentTheme,
      fontSize: this.fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
      lineHeight: 1.25,
      scrollback: 5000,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (window.WebLinksAddon) {
      term.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    term.open(sessionDiv);
    fitAddon.fit();

    const sessionObj = {
      id: sessionId,
      hostId: hostId,
      hostLabel: hostLabel || 'SSH Session',
      term: term,
      fitAddon: fitAddon,
      container: sessionDiv,
      socket: null,
      status: 'connecting',
    };

    this.sessions.set(sessionId, sessionObj);

    // Connect WebSocket
    this.connectWebSocket(sessionObj);

    // Make this the active tab
    this.setActiveSession(sessionId);
    this.renderTabs();

    return sessionObj;
  }

  connectWebSocket(session) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cols = session.term.cols || 80;
    const rows = session.term.rows || 24;
    const wsUrl = `${protocol}//${location.host}/ws/terminal/${session.hostId}?cols=${cols}&rows=${rows}`;

    session.term.write(`\r\n\x1b[35m[TERMIUS]\x1b[0m Connecting to \x1b[1;36m${session.hostLabel}\x1b[0m via SSH...\r\n`);

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    session.socket = socket;

    socket.onopen = () => {
      session.status = 'connected';
      this.updateStatusPill(session);
      session.fitAddon.fit();
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const ctrl = JSON.parse(event.data);
          if (ctrl.type === 'status') {
            session.term.write(`\r\n\x1b[32m✔\x1b[0m ${ctrl.message}\r\n`);
          } else if (ctrl.type === 'error') {
            session.term.write(`\r\n\x1b[31m✘ ${ctrl.message}\x1b[0m\r\n`);
          }
        } catch {
          session.term.write(event.data);
        }
      } else {
        // Binary SSH stream
        session.term.write(new Uint8Array(event.data));
      }
    };

    socket.onclose = () => {
      session.status = 'disconnected';
      session.term.write('\r\n\r\n\x1b[31m[TERMIUS] SSH Connection closed.\x1b[0m\r\n');
      this.updateStatusPill(session);
    };

    socket.onerror = (err) => {
      session.status = 'error';
      session.term.write('\r\n\x1b[31m[TERMIUS] WebSocket connection error.\x1b[0m\r\n');
      this.updateStatusPill(session);
    };

    // Forward user keystrokes to SSH channel
    session.term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data));
      }
    });

    // Resize handler
    session.term.onResize((size) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'resize',
          cols: size.cols,
          rows: size.rows
        }));
      }
    });
  }

  setActiveSession(sessionId) {
    if (!this.sessions.has(sessionId)) return;

    this.activeSessionId = sessionId;

    // Show only active container
    this.sessions.forEach((s, id) => {
      if (id === sessionId) {
        s.container.style.display = 'block';
        setTimeout(() => {
          s.fitAddon.fit();
          s.term.focus();
        }, 50);
      } else {
        s.container.style.display = 'none';
      }
    });

    const activeSession = this.sessions.get(sessionId);
    document.getElementById('term-host-name').textContent = activeSession.hostLabel;
    this.updateStatusPill(activeSession);
    this.renderTabs();
  }

  updateStatusPill(session) {
    if (this.activeSessionId !== session.id) return;
    const dot = document.querySelector('#terminal-session-info .vault-dot');
    if (!dot) return;

    if (session.status === 'connected') {
      dot.style.backgroundColor = 'var(--accent-green)';
      dot.style.boxShadow = '0 0 6px var(--accent-green)';
    } else if (session.status === 'connecting') {
      dot.style.backgroundColor = 'var(--accent-amber)';
      dot.style.boxShadow = '0 0 6px var(--accent-amber)';
    } else {
      dot.style.backgroundColor = 'var(--accent-rose)';
      dot.style.boxShadow = '0 0 6px var(--accent-rose)';
    }
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.socket) {
      try { session.socket.close(); } catch {}
    }
    session.term.dispose();
    session.container.remove();
    this.sessions.delete(sessionId);

    // If closing active session, pick another
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys());
      if (remaining.length > 0) {
        this.setActiveSession(remaining[remaining.length - 1]);
      } else {
        this.activeSessionId = null;
        document.getElementById('term-host-name').textContent = 'Not Connected';
        if (window.app) {
          window.app.switchView('hosts-view');
        }
      }
    }

    this.renderTabs();
  }

  reconnectActiveSession() {
    if (!this.activeSessionId) return;
    const session = this.sessions.get(this.activeSessionId);
    if (!session) return;

    if (session.socket) {
      try { session.socket.close(); } catch {}
    }
    session.term.clear();
    this.connectWebSocket(session);
  }

  clearActive() {
    if (!this.activeSessionId) return;
    const session = this.sessions.get(this.activeSessionId);
    if (session) session.term.clear();
  }

  zoom(delta) {
    this.fontSize = Math.max(10, Math.min(26, this.fontSize + delta));
    this.sessions.forEach((s) => {
      s.term.options.fontSize = this.fontSize;
      s.fitAddon.fit();
    });
  }

  setTheme(themeName) {
    this.theme = themeName;
    const themes = this.getThemes();
    const currentTheme = themes[this.theme] || themes['termius-dark'];
    this.sessions.forEach((s) => {
      s.term.options.theme = currentTheme;
    });
  }

  sendToActive(command) {
    if (!this.activeSessionId) {
      if (window.app) window.app.showToast('No active terminal session. Connect to a host first.', 'error');
      return;
    }
    const session = this.sessions.get(this.activeSessionId);
    if (!session || !session.socket || session.socket.readyState !== WebSocket.OPEN) {
      if (window.app) window.app.showToast('Terminal session is not currently connected.', 'error');
      return;
    }
    // Append newline to command
    const cmdWithEnter = command.endsWith('\n') ? command : command + '\n';
    session.socket.send(new TextEncoder().encode(cmdWithEnter));
    session.term.focus();
    if (window.app) window.app.showToast('Snippet executed in active terminal', 'success');
  }

  renderTabs() {
    const tabsBar = document.getElementById('terminal-tabs-bar');
    const badge = document.getElementById('sessions-count-badge');
    const count = this.sessions.size;

    if (count > 0) {
      tabsBar.style.display = 'flex';
      badge.style.display = 'inline-block';
      badge.textContent = count;
    } else {
      tabsBar.style.display = 'none';
      badge.style.display = 'none';
      return;
    }

    tabsBar.innerHTML = '';
    this.sessions.forEach((session, id) => {
      const tab = document.createElement('div');
      tab.className = `terminal-tab ${id === this.activeSessionId ? 'active' : ''}`;
      
      const statusDot = document.createElement('span');
      statusDot.className = 'terminal-tab-status';
      statusDot.style.background = session.status === 'connected' ? 'var(--accent-green)' : (session.status === 'connecting' ? 'var(--accent-amber)' : 'var(--accent-rose)');
      
      const title = document.createElement('span');
      title.textContent = session.hostLabel;

      const closeBtn = document.createElement('span');
      closeBtn.className = 'terminal-tab-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeSession(id);
      };

      tab.appendChild(statusDot);
      tab.appendChild(title);
      tab.appendChild(closeBtn);

      tab.onclick = () => this.setActiveSession(id);
      tabsBar.appendChild(tab);
    });
  }

  fitAll() {
    if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
      const s = this.sessions.get(this.activeSessionId);
      s.fitAddon.fit();
    }
  }
}

window.terminalManager = new TerminalSessionManager();

// Window resize observer
window.addEventListener('resize', () => {
  window.terminalManager.fitAll();
});
