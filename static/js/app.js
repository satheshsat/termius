/**
 * Termius Clone - Main Application Logic
 */

class TermiusApp {
  constructor() {
    this.currentView = 'hosts-view';
    this.hosts = [];
    this.snippets = [];
    this.tunnels = [];
    this.keys = [];
    this.activeHostGroup = 'all';
    this.activeSnippetTag = 'all';
    this.isVaultUnlocked = true;
    this.hasMasterPassword = false;

    this.init();
  }

  async init() {
    this.bindNavigation();
    this.bindModals();
    this.bindGlobalSearch();
    this.bindSettings();
    this.bindQuickConnect();

    await this.checkAuthStatus();
    await this.refreshAllData();
  }

  // --- View Navigation ---
  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        this.switchView(targetView);
      });
    });

    // Topbar action buttons
    document.getElementById('btn-primary-action').addEventListener('click', () => {
      if (this.currentView === 'hosts-view') this.openHostModal();
      else if (this.currentView === 'snippets-view') this.openSnippetModal();
      else if (this.currentView === 'tunnels-view') this.openTunnelModal();
      else if (this.currentView === 'keys-view') this.openGenKeyModal();
      else this.openHostModal();
    });

    document.getElementById('btn-add-snippet').addEventListener('click', () => this.openSnippetModal());
    document.getElementById('btn-add-tunnel').addEventListener('click', () => this.openTunnelModal());
    document.getElementById('btn-generate-key').addEventListener('click', () => this.openGenKeyModal());
    document.getElementById('btn-import-key').addEventListener('click', () => this.openImportKeyPrompt());

    // Terminal header actions
    document.getElementById('btn-term-zoom-in').addEventListener('click', () => window.terminalManager.zoom(1));
    document.getElementById('btn-term-zoom-out').addEventListener('click', () => window.terminalManager.zoom(-1));
    document.getElementById('btn-term-clear').addEventListener('click', () => window.terminalManager.clearActive());
    document.getElementById('btn-term-reconnect').addEventListener('click', () => window.terminalManager.reconnectActiveSession());
    
    // Terminal snippets drawer toggle
    const drawer = document.getElementById('terminal-snippet-drawer');
    document.getElementById('btn-toggle-snippets').addEventListener('click', () => {
      const isVisible = drawer.style.display !== 'none';
      drawer.style.display = isVisible ? 'none' : 'flex';
      this.renderDrawerSnippets();
    });
    document.getElementById('btn-close-snippet-drawer').addEventListener('click', () => {
      drawer.style.display = 'none';
    });
  }

  switchView(viewId) {
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetEl = document.getElementById(viewId);
    if (targetEl) targetEl.classList.add('active');

    const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (navItem) navItem.classList.add('active');

    this.currentView = viewId;

    // Update title
    const titles = {
      'hosts-view': 'Hosts',
      'terminals-view': 'Terminal Sessions',
      'sftp-view': 'SFTP File Explorer',
      'snippets-view': 'Command Snippets',
      'tunnels-view': 'Port Forwarding (Tunnels)',
      'keys-view': 'SSH Keychain & Keys',
      'settings-view': 'Settings & JSON Vault',
    };
    document.getElementById('current-view-title').textContent = titles[viewId] || 'Termius';

    // Update primary action button text
    const primaryBtn = document.getElementById('btn-primary-action');
    if (viewId === 'hosts-view') primaryBtn.textContent = '+ New Host';
    else if (viewId === 'snippets-view') primaryBtn.textContent = '+ New Snippet';
    else if (viewId === 'tunnels-view') primaryBtn.textContent = '+ New Tunnel';
    else if (viewId === 'keys-view') primaryBtn.textContent = '+ Generate Key';
    else primaryBtn.textContent = '+ New Host';

    // If opening terminals, resize xterm
    if (viewId === 'terminals-view') {
      setTimeout(() => window.terminalManager.fitAll(), 50);
    }
    // If opening SFTP, ensure host select is populated
    if (viewId === 'sftp-view') {
      window.sftpExplorer.populateHosts(this.hosts);
    }
  }

  // --- Auth / Master Password Vault ---
  async checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      this.hasMasterPassword = data.has_master_password;
      this.isVaultUnlocked = data.is_unlocked;
      this.updateVaultStatusUI();
    } catch (err) {
      console.error('Failed to get auth status:', err);
    }
  }

  updateVaultStatusUI() {
    const dot = document.getElementById('vault-status-dot');
    const text = document.getElementById('vault-status-text');
    if (!this.hasMasterPassword) {
      dot.className = 'vault-dot';
      text.textContent = 'Vault Active (Unprotected)';
    } else if (this.isVaultUnlocked) {
      dot.className = 'vault-dot';
      text.textContent = 'Vault Unlocked (AES-256)';
    } else {
      dot.className = 'vault-dot locked';
      text.textContent = 'Vault Locked 🔒';
    }
  }

  // --- Data Loading ---
  async refreshAllData() {
    await Promise.all([
      this.fetchHosts(),
      this.fetchSnippets(),
      this.fetchTunnels(),
      this.fetchKeys(),
    ]);
  }

  // --- Hosts Operations ---
  async fetchHosts() {
    try {
      const res = await fetch('/api/hosts');
      this.hosts = await res.json();
      document.getElementById('hosts-count-badge').textContent = this.hosts.length;
      this.renderHostGroupPills();
      this.renderHostsGrid();
      window.sftpExplorer.populateHosts(this.hosts);
      this.populateTunnelHostsSelect();
      this.populateKeySelect();
    } catch (err) {
      this.showToast('Failed to fetch hosts: ' + err.message, 'error');
    }
  }

  renderHostGroupPills() {
    const pillsContainer = document.getElementById('host-group-pills');
    const groups = new Set(['all']);
    this.hosts.forEach(h => { if (h.group) groups.add(h.group); });

    pillsContainer.innerHTML = '';
    groups.forEach(grp => {
      const pill = document.createElement('button');
      pill.className = `pill ${this.activeHostGroup === grp ? 'active' : ''}`;
      pill.textContent = grp === 'all' ? 'All Hosts' : grp;
      pill.onclick = () => {
        this.activeHostGroup = grp;
        this.renderHostGroupPills();
        this.renderHostsGrid();
      };
      pillsContainer.appendChild(pill);
    });
  }

  renderHostsGrid() {
    const grid = document.getElementById('hosts-grid');
    const filterInput = document.getElementById('host-filter-input').value.toLowerCase().trim();

    let filtered = this.hosts;
    if (this.activeHostGroup !== 'all') {
      filtered = filtered.filter(h => h.group === this.activeHostGroup);
    }
    if (filterInput) {
      filtered = filtered.filter(h => 
        (h.label && h.label.toLowerCase().includes(filterInput)) ||
        (h.hostname && h.hostname.toLowerCase().includes(filterInput)) ||
        (h.tags && h.tags.some(t => t.toLowerCase().includes(filterInput)))
      );
    }

    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:36px; margin-bottom:12px;">💻</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-main);">No Hosts Found</div>
          <p style="margin-top:6px; font-size:13px;">Click "+ New Host" above to add your first SSH connection.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(host => {
      const card = document.createElement('div');
      card.className = 'host-card';

      const initial = (host.label || host.hostname).substring(0, 2).toUpperCase();
      const hostColor = host.color || '#6c5ce7';

      const tagsHtml = (host.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
      const authLabel = host.auth_type === 'key' ? '🔑 Key Auth' : (host.auth_type === 'agent' ? '🛡️ SSH Agent' : '🔒 Password');

      card.innerHTML = `
        <div class="host-card-header">
          <div class="host-identity">
            <div class="host-avatar" style="background:${hostColor}">
              ${initial}
            </div>
            <div>
              <div class="host-label">${host.label}</div>
              <div class="host-address">${host.username}@${host.hostname}:${host.port || 22}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-icon btn-sm" title="Edit Host" onclick="window.app.editHost('${host.id}')">✏️</button>
            <button class="btn btn-icon btn-sm" title="Delete Host" onclick="window.app.deleteHost('${host.id}')">🗑️</button>
          </div>
        </div>

        <div class="host-tags">${tagsHtml}</div>

        <div class="host-meta">
          <span>${authLabel}</span>
          <span id="ping-${host.id}" style="color:var(--text-muted); font-family:var(--font-mono);">
            ${host.last_connected ? 'Connected: ' + new Date(host.last_connected).toLocaleDateString() : 'Never connected'}
          </span>
        </div>

        <div class="host-actions">
          <button class="btn btn-primary btn-sm" onclick="window.terminalManager.openSession('${host.id}', '${host.label.replace(/'/g, "\\'")}')">
            ⚡ Connect
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openHostSFTP('${host.id}')">
            📁 SFTP
          </button>
          <button class="btn btn-secondary btn-sm btn-icon" title="Test Connection & Latency" onclick="window.app.testHostConnection('${host.id}')">
            📶
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  async testHostConnection(hostId) {
    const pingEl = document.getElementById(`ping-${hostId}`);
    if (pingEl) pingEl.textContent = 'Testing connection...';
    try {
      const res = await fetch(`/api/hosts/${hostId}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message, 'success');
        if (pingEl) {
          pingEl.innerHTML = `<span style="color:var(--accent-green); font-weight:600;">● ${data.latency_ms} ms</span>`;
        }
      } else {
        this.showToast(`Connection failed: ${data.message}`, 'error');
        if (pingEl) {
          pingEl.innerHTML = `<span style="color:var(--accent-rose); font-weight:600;">✘ Failed</span>`;
        }
      }
    } catch (err) {
      this.showToast('Test failed: ' + err.message, 'error');
    }
  }

  openHostSFTP(hostId) {
    this.switchView('sftp-view');
    const select = document.getElementById('sftp-host-select');
    select.value = hostId;
    window.sftpExplorer.currentHostId = hostId;
    window.sftpExplorer.loadDirectory('.');
  }

  openHostModal(host = null) {
    document.getElementById('modal-host-title').textContent = host ? 'Edit Host' : 'Add New Host';
    document.getElementById('host-id').value = host ? host.id : '';
    document.getElementById('host-label').value = host ? host.label : '';
    document.getElementById('host-group').value = host ? host.group : 'Default';
    document.getElementById('host-hostname').value = host ? host.hostname : '';
    document.getElementById('host-port').value = host ? host.port : 22;
    document.getElementById('host-username').value = host ? host.username : 'root';
    document.getElementById('host-auth-type').value = host ? host.auth_type : 'password';
    document.getElementById('host-password').value = '';
    document.getElementById('host-passphrase').value = '';
    document.getElementById('host-tags').value = host && host.tags ? host.tags.join(', ') : '';
    document.getElementById('host-color').value = host ? host.color : '#6c5ce7';
    document.getElementById('host-notes').value = host ? (host.notes || '') : '';

    this.toggleAuthTypeFields(host ? host.auth_type : 'password');
    if (host && host.key_id) {
      document.getElementById('host-key-select').value = host.key_id;
    }

    this.openModal('modal-host');
  }

  toggleAuthTypeFields(type) {
    const pwdGroup = document.getElementById('host-auth-password-group');
    const keyGroup = document.getElementById('host-auth-key-group');
    if (type === 'password') {
      pwdGroup.style.display = 'flex';
      keyGroup.style.display = 'none';
    } else if (type === 'key') {
      pwdGroup.style.display = 'none';
      keyGroup.style.display = 'flex';
    } else {
      pwdGroup.style.display = 'none';
      keyGroup.style.display = 'none';
    }
  }

  async editHost(hostId) {
    const host = this.hosts.find(h => h.id === hostId);
    if (host) this.openHostModal(host);
  }

  async deleteHost(hostId) {
    const host = this.hosts.find(h => h.id === hostId);
    if (!host) return;
    if (!confirm(`Delete host "${host.label}"?`)) return;

    try {
      const res = await fetch(`/api/hosts/${hostId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete host');
      this.showToast(`Host "${host.label}" deleted`, 'success');
      await this.fetchHosts();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async saveHost() {
    const id = document.getElementById('host-id').value;
    const label = document.getElementById('host-label').value.trim();
    const hostname = document.getElementById('host-hostname').value.trim();
    const port = parseInt(document.getElementById('host-port').value) || 22;
    const username = document.getElementById('host-username').value.trim();
    const authType = document.getElementById('host-auth-type').value;
    const password = document.getElementById('host-password').value;
    const keyId = document.getElementById('host-key-select').value || null;
    const passphrase = document.getElementById('host-passphrase').value || null;
    const group = document.getElementById('host-group').value.trim() || 'Default';
    const tags = document.getElementById('host-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const color = document.getElementById('host-color').value;
    const notes = document.getElementById('host-notes').value;

    if (!label || !hostname || !username) {
      this.showToast('Please fill in label, hostname, and username', 'error');
      return;
    }

    const payload = {
      label, hostname, port, username, auth_type: authType,
      group, tags, color, notes
    };
    if (password) payload.password = password;
    if (keyId) payload.key_id = keyId;
    if (passphrase) payload.passphrase = passphrase;

    try {
      const url = id ? `/api/hosts/${id}` : '/api/hosts';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save host');

      this.closeModal('modal-host');
      this.showToast(id ? 'Host updated' : 'Host added successfully', 'success');
      await this.fetchHosts();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  }

  // --- Snippets Operations ---
  async fetchSnippets() {
    try {
      const res = await fetch('/api/snippets');
      this.snippets = await res.json();
      document.getElementById('snippets-count-badge').textContent = this.snippets.length;
      this.renderSnippetTagPills();
      this.renderSnippetsGrid();
    } catch (err) {
      this.showToast('Failed to fetch snippets: ' + err.message, 'error');
    }
  }

  renderSnippetTagPills() {
    const container = document.getElementById('snippet-tag-pills');
    const tags = new Set(['all']);
    this.snippets.forEach(s => { if (s.tags) s.tags.forEach(t => tags.add(t)); });

    container.innerHTML = '';
    tags.forEach(tag => {
      const pill = document.createElement('button');
      pill.className = `pill ${this.activeSnippetTag === tag ? 'active' : ''}`;
      pill.textContent = tag === 'all' ? 'All Snippets' : '#' + tag;
      pill.onclick = () => {
        this.activeSnippetTag = tag;
        this.renderSnippetTagPills();
        this.renderSnippetsGrid();
      };
      container.appendChild(pill);
    });
  }

  renderSnippetsGrid() {
    const grid = document.getElementById('snippets-grid');
    let filtered = this.snippets;
    if (this.activeSnippetTag !== 'all') {
      filtered = filtered.filter(s => s.tags && s.tags.includes(this.activeSnippetTag));
    }

    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:36px; margin-bottom:12px;">📋</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-main);">No Snippets Found</div>
        </div>
      `;
      return;
    }

    filtered.forEach(s => {
      const card = document.createElement('div');
      card.className = 'snippet-card';
      const tagsHtml = (s.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">${s.name}</div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-icon btn-sm" title="Edit" onclick="window.app.editSnippet('${s.id}')">✏️</button>
              <button class="btn btn-icon btn-sm" title="Delete" onclick="window.app.deleteSnippet('${s.id}')">🗑️</button>
            </div>
          </div>
          ${s.description ? `<p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">${s.description}</p>` : ''}
          <div class="snippet-code-box">${this.escapeHtml(s.command)}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">${tagsHtml}</div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window.terminalManager.sendToActive('${this.escapeJsString(s.command)}')">
            ⚡ Run in Active Tab
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.copyText('${this.escapeJsString(s.command)}', 'Command copied!')">
            📋 Copy
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  renderDrawerSnippets() {
    const list = document.getElementById('terminal-drawer-snippets');
    list.innerHTML = '';
    if (this.snippets.length === 0) {
      list.innerHTML = `<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px;">No snippets found.</div>`;
      return;
    }
    this.snippets.forEach(s => {
      const item = document.createElement('div');
      item.className = 'snippet-item-quick';
      item.innerHTML = `
        <div class="snippet-item-quick-title">${s.name}</div>
        <div class="snippet-item-quick-cmd">${s.command}</div>
      `;
      item.onclick = () => window.terminalManager.sendToActive(s.command);
      list.appendChild(item);
    });
  }

  openSnippetModal(snippet = null) {
    document.getElementById('modal-snippet-title').textContent = snippet ? 'Edit Snippet' : 'New Snippet';
    document.getElementById('snippet-id').value = snippet ? snippet.id : '';
    document.getElementById('snippet-name').value = snippet ? snippet.name : '';
    document.getElementById('snippet-command').value = snippet ? snippet.command : '';
    document.getElementById('snippet-tags').value = snippet && snippet.tags ? snippet.tags.join(', ') : '';
    document.getElementById('snippet-desc').value = snippet ? (snippet.description || '') : '';
    this.openModal('modal-snippet');
  }

  async editSnippet(id) {
    const s = this.snippets.find(x => x.id === id);
    if (s) this.openSnippetModal(s);
  }

  async deleteSnippet(id) {
    if (!confirm('Delete this snippet?')) return;
    try {
      const res = await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete snippet failed');
      this.showToast('Snippet deleted', 'success');
      await this.fetchSnippets();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async saveSnippet() {
    const id = document.getElementById('snippet-id').value;
    const name = document.getElementById('snippet-name').value.trim();
    const command = document.getElementById('snippet-command').value.trim();
    const tags = document.getElementById('snippet-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const description = document.getElementById('snippet-desc').value.trim();

    if (!name || !command) {
      this.showToast('Please provide a snippet title and command', 'error');
      return;
    }

    const payload = { name, command, tags, description };
    try {
      const url = id ? `/api/snippets/${id}` : '/api/snippets';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Save failed');

      this.closeModal('modal-snippet');
      this.showToast(id ? 'Snippet updated' : 'Snippet created', 'success');
      await this.fetchSnippets();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // --- Port Forwarding Tunnels ---
  async fetchTunnels() {
    try {
      const res = await fetch('/api/tunnels');
      this.tunnels = await res.json();
      document.getElementById('tunnels-count-badge').textContent = this.tunnels.length;
      this.renderTunnelsGrid();
    } catch (err) {
      console.error(err);
    }
  }

  populateTunnelHostsSelect() {
    const select = document.getElementById('tunnel-host-id');
    const prev = select.value;
    select.innerHTML = '<option value="">Select Host...</option>';
    this.hosts.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.label} (${h.hostname})`;
      select.appendChild(opt);
    });
    if (prev && this.hosts.some(h => h.id === prev)) select.value = prev;
  }

  renderTunnelsGrid() {
    const grid = document.getElementById('tunnels-grid');
    grid.innerHTML = '';
    if (this.tunnels.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:36px; margin-bottom:12px;">🔀</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-main);">No Port Forwarding Rules</div>
          <p style="margin-top:6px; font-size:13px;">Forward local ports through an SSH host to access remote databases or internal web apps.</p>
        </div>
      `;
      return;
    }

    this.tunnels.forEach(t => {
      const host = this.hosts.find(h => h.id === t.host_id) || { label: 'Unknown Host' };
      const isRunning = t.status === 'running';

      const card = document.createElement('div');
      card.className = 'tunnel-card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">${t.name}</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Via ${host.label}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <label class="switch">
              <input type="checkbox" ${isRunning ? 'checked' : ''} onchange="window.app.toggleTunnel('${t.id}', this.checked)">
              <span class="slider"></span>
            </label>
            <button class="btn btn-icon btn-sm" onclick="window.app.deleteTunnel('${t.id}')">🗑️</button>
          </div>
        </div>

        <div class="tunnel-diagram">
          <div class="tunnel-node">
            <div class="tunnel-node-title">LOCAL</div>
            <div class="tunnel-node-val">:${t.local_port}</div>
          </div>
          <div class="tunnel-arrow">➔</div>
          <div class="tunnel-node">
            <div class="tunnel-node-title">SSH BASTION</div>
            <div class="tunnel-node-val" style="color:var(--primary);">${host.label}</div>
          </div>
          <div class="tunnel-arrow">➔</div>
          <div class="tunnel-node">
            <div class="tunnel-node-title">REMOTE DEST</div>
            <div class="tunnel-node-val">${t.remote_host}:${t.remote_port}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="color:${isRunning ? 'var(--accent-green)' : 'var(--text-muted)'}; font-weight:600;">
            ● ${isRunning ? 'Active & Forwarding' : 'Stopped'}
          </span>
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">
            http://localhost:${t.local_port}
          </span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  async toggleTunnel(tunnelId, enable) {
    const endpoint = enable ? `/api/tunnels/${tunnelId}/start` : `/api/tunnels/${tunnelId}/stop`;
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to toggle tunnel');
      this.showToast(data.message, 'success');
      await this.fetchTunnels();
    } catch (err) {
      this.showToast(`Tunnel error: ${err.message}`, 'error');
      await this.fetchTunnels();
    }
  }

  openTunnelModal() {
    this.populateTunnelHostsSelect();
    document.getElementById('tunnel-id').value = '';
    document.getElementById('tunnel-name').value = '';
    document.getElementById('tunnel-local-port').value = '8080';
    document.getElementById('tunnel-remote-host').value = '127.0.0.1';
    document.getElementById('tunnel-remote-port').value = '80';
    this.openModal('modal-tunnel');
  }

  async deleteTunnel(tunnelId) {
    if (!confirm('Delete this port forwarding rule?')) return;
    try {
      await fetch(`/api/tunnels/${tunnelId}`, { method: 'DELETE' });
      this.showToast('Tunnel rule deleted', 'success');
      await this.fetchTunnels();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async saveTunnel() {
    const name = document.getElementById('tunnel-name').value.trim();
    const hostId = document.getElementById('tunnel-host-id').value;
    const localPort = parseInt(document.getElementById('tunnel-local-port').value);
    const remoteHost = document.getElementById('tunnel-remote-host').value.trim();
    const remotePort = parseInt(document.getElementById('tunnel-remote-port').value);

    if (!name || !hostId || !localPort || !remoteHost || !remotePort) {
      this.showToast('Please fill out all tunnel fields', 'error');
      return;
    }

    const payload = {
      name, host_id: hostId, local_port: localPort,
      remote_host: remoteHost, remote_port: remotePort
    };

    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Save tunnel failed');
      this.closeModal('modal-tunnel');
      this.showToast('Tunnel created', 'success');
      await this.fetchTunnels();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // --- SSH Keychain & Keys ---
  async fetchKeys() {
    try {
      const res = await fetch('/api/keys');
      this.keys = await res.json();
      document.getElementById('keys-count-badge').textContent = this.keys.length;
      this.renderKeysGrid();
      this.populateKeySelect();
    } catch (err) {
      console.error(err);
    }
  }

  populateKeySelect() {
    const select = document.getElementById('host-key-select');
    const prev = select.value;
    select.innerHTML = '<option value="">Choose stored key...</option>';
    this.keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = `${k.name} (${k.key_type.toUpperCase()})`;
      select.appendChild(opt);
    });
    if (prev && this.keys.some(k => k.id === prev)) select.value = prev;
  }

  renderKeysGrid() {
    const grid = document.getElementById('keys-grid');
    grid.innerHTML = '';
    if (this.keys.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:36px; margin-bottom:12px;">🔑</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-main);">No SSH Keys Stored</div>
          <p style="margin-top:6px; font-size:13px;">Generate an Ed25519 or RSA key pair or import your existing key.</p>
        </div>
      `;
      return;
    }

    this.keys.forEach(k => {
      const card = document.createElement('div');
      card.className = 'key-card';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">${k.name}</div>
            <span class="badge" style="margin-top:4px;">${k.key_type.toUpperCase()}</span>
          </div>
          <button class="btn btn-icon btn-sm" onclick="window.app.deleteKey('${k.id}')">🗑️</button>
        </div>

        <div>
          <label style="font-size:11px; color:var(--text-muted);">SHA256 Fingerprint</label>
          <div class="key-fingerprint">${k.fingerprint || 'N/A'}</div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.app.copyText('${this.escapeJsString(k.public_key)}', 'Public key copied to clipboard!')">
            📋 Copy Public Key
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  openGenKeyModal() {
    document.getElementById('gen-key-name').value = '';
    document.getElementById('gen-key-type').value = 'ed25519';
    document.getElementById('gen-key-passphrase').value = '';
    document.getElementById('gen-key-bits-group').style.display = 'none';
    this.openModal('modal-gen-key');
  }

  async executeGenKey() {
    const name = document.getElementById('gen-key-name').value.trim();
    const keyType = document.getElementById('gen-key-type').value;
    const bits = parseInt(document.getElementById('gen-key-bits').value) || 2048;
    const passphrase = document.getElementById('gen-key-passphrase').value || null;

    if (!name) {
      this.showToast('Please provide a key name', 'error');
      return;
    }

    try {
      const res = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, key_type: keyType, bits, passphrase })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate key');

      this.closeModal('modal-gen-key');
      this.showToast(`SSH Key "${name}" generated and saved`, 'success');
      await this.fetchKeys();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  openImportKeyPrompt() {
    const name = prompt('Key Name:');
    if (!name) return;
    const pubKey = prompt('Paste OpenSSH Public Key:');
    if (!pubKey) return;
    const privKey = prompt('Paste Private Key (PEM format, encrypted in JSON):');
    if (!privKey) return;

    fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        key_type: pubKey.includes('ed25519') ? 'ed25519' : 'rsa',
        public_key: pubKey.trim(),
        private_key: privKey.trim(),
      })
    }).then(res => res.json()).then(data => {
      this.showToast('SSH Key imported successfully', 'success');
      this.fetchKeys();
    }).catch(e => this.showToast(e.message, 'error'));
  }

  async deleteKey(keyId) {
    if (!confirm('Permanently delete this SSH Key?')) return;
    try {
      await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      this.showToast('SSH Key deleted', 'success');
      await this.fetchKeys();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // --- Modals Helper ---
  bindModals() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // Close on overlay backdrop click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal.id);
      });
    });

    // Save buttons
    document.getElementById('btn-save-host').addEventListener('click', () => this.saveHost());
    document.getElementById('btn-save-snippet').addEventListener('click', () => this.saveSnippet());
    document.getElementById('btn-save-tunnel').addEventListener('click', () => this.saveTunnel());
    document.getElementById('btn-execute-gen-key').addEventListener('click', () => this.executeGenKey());
    
    // Auth type change
    document.getElementById('host-auth-type').addEventListener('change', (e) => {
      this.toggleAuthTypeFields(e.target.value);
    });

    // Key type change
    document.getElementById('gen-key-type').addEventListener('change', (e) => {
      document.getElementById('gen-key-bits-group').style.display = e.target.value === 'rsa' ? 'block' : 'none';
    });

    // Vault status click
    document.getElementById('vault-status-btn').addEventListener('click', () => {
      if (!this.hasMasterPassword || !this.isVaultUnlocked) {
        this.openMasterPwdModal();
      } else {
        this.switchView('settings-view');
      }
    });

    document.getElementById('btn-lock-vault').addEventListener('click', (e) => {
      e.stopPropagation();
      this.lockVault();
    });

    document.getElementById('btn-manual-lock').addEventListener('click', () => this.lockVault());
    document.getElementById('btn-setup-change-pwd').addEventListener('click', () => this.openMasterPwdModal());

    document.getElementById('btn-submit-master-pwd').addEventListener('click', () => this.submitMasterPassword());
  }

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  }

  openMasterPwdModal() {
    const title = document.getElementById('modal-pwd-title');
    const desc = document.getElementById('modal-pwd-desc');
    const confirmGroup = document.getElementById('confirm-pwd-group');
    const submitBtn = document.getElementById('btn-submit-master-pwd');

    document.getElementById('input-master-pwd').value = '';
    document.getElementById('input-confirm-pwd').value = '';

    if (!this.hasMasterPassword) {
      title.textContent = 'Set Master Password';
      desc.textContent = 'Protect all stored passwords and SSH keys with AES-256-GCM encryption.';
      confirmGroup.style.display = 'flex';
      submitBtn.textContent = 'Set Password';
    } else {
      title.textContent = 'Unlock Vault';
      desc.textContent = 'Enter your master password to unlock credentials.';
      confirmGroup.style.display = 'none';
      submitBtn.textContent = 'Unlock';
    }

    this.openModal('modal-master-pwd');
  }

  async submitMasterPassword() {
    const pwd = document.getElementById('input-master-pwd').value;
    if (!pwd) {
      this.showToast('Password cannot be empty', 'error');
      return;
    }

    if (!this.hasMasterPassword) {
      const confirm = document.getElementById('input-confirm-pwd').value;
      if (pwd !== confirm) {
        this.showToast('Passwords do not match', 'error');
        return;
      }
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        if (!res.ok) throw new Error('Setup failed');
        this.showToast('Master password created and vault secured', 'success');
        this.closeModal('modal-master-pwd');
        await this.checkAuthStatus();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    } else {
      try {
        const res = await fetch('/api/auth/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        if (!res.ok) throw new Error('Incorrect master password');
        this.showToast('Vault unlocked successfully', 'success');
        this.closeModal('modal-master-pwd');
        await this.checkAuthStatus();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }
  }

  async lockVault() {
    try {
      await fetch('/api/auth/lock', { method: 'POST' });
      this.showToast('Vault locked', 'info');
      await this.checkAuthStatus();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Quick Connect ---
  bindQuickConnect() {
    document.getElementById('btn-quick-connect').addEventListener('click', () => {
      document.getElementById('quick-connect-str').value = '';
      document.getElementById('quick-connect-pwd').value = '';
      this.openModal('modal-quick-connect');
    });

    document.getElementById('btn-exec-quick-connect').addEventListener('click', async () => {
      const str = document.getElementById('quick-connect-str').value.trim();
      const pwd = document.getElementById('quick-connect-pwd').value;
      if (!str) return;

      // Parse user@hostname:port
      let username = 'root';
      let hostname = str;
      let port = 22;

      if (hostname.includes('@')) {
        const parts = hostname.split('@');
        username = parts[0];
        hostname = parts[1];
      }
      if (hostname.includes(':')) {
        const parts = hostname.split(':');
        hostname = parts[0];
        port = parseInt(parts[1]) || 22;
      }

      // Create quick host
      try {
        const res = await fetch('/api/hosts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: `Quick ${hostname}`,
            hostname: hostname,
            port: port,
            username: username,
            auth_type: 'password',
            password: pwd,
            group: 'Quick',
            tags: ['quick']
          })
        });
        const data = await res.json();
        this.closeModal('modal-quick-connect');
        await this.fetchHosts();
        window.terminalManager.openSession(data.host.id, data.host.label);
      } catch (err) {
        this.showToast('Quick connect failed: ' + err.message, 'error');
      }
    });
  }

  // --- Settings & Terminal Prefs ---
  bindSettings() {
    document.getElementById('btn-save-terminal-prefs').addEventListener('click', () => {
      const theme = document.getElementById('pref-term-theme').value;
      const fontSize = parseInt(document.getElementById('pref-font-size').value) || 14;
      const scrollback = parseInt(document.getElementById('pref-scrollback').value) || 5000;

      window.terminalManager.setTheme(theme);
      window.terminalManager.fontSize = fontSize;
      window.terminalManager.zoom(0);

      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminal_theme: theme,
          terminal_font_size: fontSize,
          terminal_scrollback: scrollback,
        })
      }).then(() => this.showToast('Terminal preferences saved', 'success'));
    });

    // Vault import
    const importInput = document.getElementById('vault-import-input');
    importInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch('/api/settings/import', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('Import failed');
          this.showToast('Vault backup imported successfully!', 'success');
          await this.refreshAllData();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
        importInput.value = '';
      }
    });
  }

  // --- Global Search & Keyboard Shortcuts ---
  bindGlobalSearch() {
    const searchInput = document.getElementById('global-search');
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      document.getElementById('host-filter-input').value = val;
      this.renderHostsGrid();
    });

    document.getElementById('host-filter-input').addEventListener('input', () => {
      this.renderHostsGrid();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  // --- Utilities ---
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✔' : (type === 'error' ? '✘' : 'ℹ');
    toast.innerHTML = `<span style="font-weight:bold;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  copyText(text, successMsg = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(successMsg, 'success');
    }).catch(() => {
      this.showToast('Failed to copy', 'error');
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  escapeJsString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new TermiusApp();
});
