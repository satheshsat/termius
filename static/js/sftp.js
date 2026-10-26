/**
 * Termius SFTP Remote File Explorer
 */

class SFTPExplorer {
  constructor() {
    this.currentHostId = null;
    this.currentPath = '.';
    this.parentPath = '/';
    this.items = [];
    this.initEventListeners();
  }

  initEventListeners() {
    document.getElementById('sftp-btn-connect').addEventListener('click', () => {
      const select = document.getElementById('sftp-host-select');
      const hostId = select.value;
      if (!hostId) {
        window.app.showToast('Please select a host first', 'error');
        return;
      }
      this.currentHostId = hostId;
      this.loadDirectory('.');
    });

    document.getElementById('sftp-btn-up').addEventListener('click', () => {
      if (!this.currentHostId) return;
      if (this.parentPath && this.parentPath !== this.currentPath) {
        this.loadDirectory(this.parentPath);
      }
    });

    document.getElementById('sftp-btn-refresh').addEventListener('click', () => {
      if (this.currentHostId) {
        this.loadDirectory(this.currentPath);
      }
    });

    document.getElementById('sftp-crumb-root').addEventListener('click', () => {
      if (this.currentHostId) {
        this.loadDirectory('/');
      }
    });

    document.getElementById('sftp-btn-mkdir').addEventListener('click', () => {
      if (!this.currentHostId) {
        window.app.showToast('Connect to a host first', 'error');
        return;
      }
      const folderName = prompt('Enter new directory name:');
      if (folderName && folderName.trim()) {
        this.createDirectory(folderName.trim());
      }
    });

    const fileInput = document.getElementById('sftp-file-input');
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFile(e.target.files[0]);
        fileInput.value = '';
      }
    });
  }

  populateHosts(hosts) {
    const select = document.getElementById('sftp-host-select');
    const prev = select.value;
    select.innerHTML = '<option value="">Select Host...</option>';
    hosts.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.label} (${h.username}@${h.hostname})`;
      select.appendChild(opt);
    });
    if (prev && hosts.some(h => h.id === prev)) {
      select.value = prev;
    }
  }

  async loadDirectory(path) {
    if (!this.currentHostId) return;
    const tbody = document.getElementById('sftp-table-body');
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">
          <span>⏳ Loading remote directory: ${path}...</span>
        </td>
      </tr>
    `;

    try {
      const res = await fetch(`/api/sftp/list?host_id=${encodeURIComponent(this.currentHostId)}&path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to list directory');

      this.currentPath = data.current_path;
      this.parentPath = data.parent_path;
      this.items = data.items || [];

      this.renderBreadcrumbs();
      this.renderTable();
    } catch (err) {
      window.app.showToast(`SFTP Error: ${err.message}`, 'error');
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:30px; color:var(--accent-rose);">
            <span>✘ Failed to read directory: ${err.message}</span>
          </td>
        </tr>
      `;
    }
  }

  renderBreadcrumbs() {
    const pathText = document.getElementById('sftp-current-path-text');
    pathText.textContent = this.currentPath;
  }

  formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  getFileIcon(item) {
    if (item.is_dir) return '📁';
    if (item.is_link) return '🔗';
    const ext = item.name.split('.').pop().toLowerCase();
    if (['zip', 'tar', 'gz', 'bz2', '7z'].includes(ext)) return '📦';
    if (['sh', 'bash', 'py', 'js', 'json', 'yml', 'yaml', 'c', 'cpp', 'html', 'css'].includes(ext)) return '📜';
    if (['log', 'txt', 'md', 'conf', 'cfg', 'ini'].includes(ext)) return '📄';
    if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) return '🖼️';
    return '📄';
  }

  renderTable() {
    const tbody = document.getElementById('sftp-table-body');
    tbody.innerHTML = '';

    if (this.items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">
            Directory is empty.
          </td>
        </tr>
      `;
      return;
    }

    this.items.forEach(item => {
      const tr = document.createElement('tr');

      // Name column
      const tdName = document.createElement('td');
      const nameDiv = document.createElement('div');
      nameDiv.className = 'file-row-name';
      nameDiv.innerHTML = `<span>${this.getFileIcon(item)}</span> <span>${item.name}</span>`;
      
      if (item.is_dir) {
        nameDiv.style.fontWeight = '600';
        nameDiv.style.color = 'var(--text-main)';
        nameDiv.onclick = () => this.loadDirectory(item.path);
      }
      tdName.appendChild(nameDiv);

      // Size
      const tdSize = document.createElement('td');
      tdSize.textContent = this.formatSize(item.size);
      tdSize.style.fontFamily = 'var(--font-mono)';
      tdSize.style.fontSize = '12px';

      // Mode / Permissions
      const tdMode = document.createElement('td');
      tdMode.textContent = item.mode;
      tdMode.style.fontFamily = 'var(--font-mono)';
      tdMode.style.fontSize = '12px';
      tdMode.style.color = 'var(--text-muted)';

      // Modified
      const tdMtime = document.createElement('td');
      tdMtime.textContent = item.mtime;
      tdMtime.style.fontSize = '12px';
      tdMtime.style.color = 'var(--text-muted)';

      // Actions
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';

      if (!item.is_dir) {
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-icon btn-sm';
        downloadBtn.title = 'Download File';
        downloadBtn.textContent = '⬇️';
        downloadBtn.onclick = () => this.downloadFile(item.path);
        tdActions.appendChild(downloadBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-icon btn-sm';
      deleteBtn.title = 'Delete';
      deleteBtn.textContent = '🗑️';
      deleteBtn.style.marginLeft = '6px';
      deleteBtn.onclick = () => this.deleteItem(item.path, item.is_dir);
      tdActions.appendChild(deleteBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdSize);
      tr.appendChild(tdMode);
      tr.appendChild(tdMtime);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }

  async createDirectory(name) {
    const fullPath = `${this.currentPath.replace(/\/$/, '')}/${name}`;
    const fd = new FormData();
    fd.append('host_id', this.currentHostId);
    fd.append('path', fullPath);

    try {
      const res = await fetch('/api/sftp/mkdir', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create directory');
      window.app.showToast(`Directory '${name}' created`, 'success');
      this.loadDirectory(this.currentPath);
    } catch (err) {
      window.app.showToast(`mkdir failed: ${err.message}`, 'error');
    }
  }

  async uploadFile(file) {
    if (!this.currentHostId) {
      window.app.showToast('Connect to a host first', 'error');
      return;
    }
    const fullPath = `${this.currentPath.replace(/\/$/, '')}/${file.name}`;
    window.app.showToast(`Uploading ${file.name}...`, 'info');

    const fd = new FormData();
    fd.append('host_id', this.currentHostId);
    fd.append('remote_path', fullPath);
    fd.append('file', file);

    try {
      const res = await fetch('/api/sftp/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      window.app.showToast(`File ${file.name} uploaded successfully`, 'success');
      this.loadDirectory(this.currentPath);
    } catch (err) {
      window.app.showToast(`Upload failed: ${err.message}`, 'error');
    }
  }

  downloadFile(path) {
    const url = `/api/sftp/download?host_id=${encodeURIComponent(this.currentHostId)}&path=${encodeURIComponent(path)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.app.showToast('Download started', 'info');
  }

  async deleteItem(path, isDir) {
    const itemName = path.split('/').pop();
    if (!confirm(`Are you sure you want to permanently delete "${itemName}"?`)) return;

    const fd = new FormData();
    fd.append('host_id', this.currentHostId);
    fd.append('path', path);
    fd.append('is_dir', isDir);

    try {
      const res = await fetch('/api/sftp/delete', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Delete failed');
      window.app.showToast(`Deleted ${itemName}`, 'success');
      this.loadDirectory(this.currentPath);
    } catch (err) {
      window.app.showToast(`Delete failed: ${err.message}`, 'error');
    }
  }
}

window.sftpExplorer = new SFTPExplorer();
