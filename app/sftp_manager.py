import stat
import time
from typing import List, Dict, Any
from app.ssh_manager import ssh_manager

class SFTPManager:
    def list_dir(self, host_id: str, remote_path: str = ".") -> Dict[str, Any]:
        client, host = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            # Normalize path
            if not remote_path or remote_path == ".":
                remote_path = sftp.normalize(".")
            else:
                remote_path = sftp.normalize(remote_path)

            file_attrs = sftp.listdir_attr(remote_path)
            items: List[Dict[str, Any]] = []

            for attr in file_attrs:
                is_directory = stat.S_ISDIR(attr.st_mode)
                is_link = stat.S_ISLNK(attr.st_mode)
                mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(attr.st_mtime))
                items.append({
                    "name": attr.filename,
                    "path": f"{remote_path.rstrip('/')}/{attr.filename}",
                    "size": attr.st_size if not is_directory else None,
                    "is_dir": is_directory,
                    "is_link": is_link,
                    "mode": oct(attr.st_mode)[-4:],
                    "mtime": mtime_str,
                })

            # Sort directories first, then alphabetical
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

            # Parent directory path
            parent_path = "/".join(remote_path.rstrip("/").split("/")[:-1])
            if not parent_path:
                parent_path = "/"

            return {
                "current_path": remote_path,
                "parent_path": parent_path,
                "items": items,
            }
        finally:
            client.close()

    def create_directory(self, host_id: str, remote_path: str):
        client, _ = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            sftp.mkdir(remote_path)
        finally:
            client.close()

    def remove_file(self, host_id: str, remote_path: str, is_dir: bool = False):
        client, _ = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            if is_dir:
                sftp.rmdir(remote_path)
            else:
                sftp.remove(remote_path)
        finally:
            client.close()

    def rename_file(self, host_id: str, old_path: str, new_path: str):
        client, _ = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            sftp.rename(old_path, new_path)
        finally:
            client.close()

    def upload_file(self, host_id: str, remote_path: str, file_obj):
        client, _ = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            sftp.putfo(file_obj, remote_path)
        finally:
            client.close()

    def download_file(self, host_id: str, remote_path: str, dest_obj):
        client, _ = ssh_manager.build_ssh_client(host_id)
        try:
            sftp = client.open_sftp()
            sftp.getfo(remote_path, dest_obj)
        finally:
            client.close()

sftp_manager = SFTPManager()
