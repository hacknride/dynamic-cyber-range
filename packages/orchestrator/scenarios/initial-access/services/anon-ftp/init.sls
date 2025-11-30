{# ==============================================================
   Initial Access: Weak FTP User → Upload Webshell → RCE → SSH
   Components:
     - vsftpd (FTP server)
     - Apache2 + PHP (exec uploaded shells)
     - openssh-server (SSH for same weak user)
   Flow:
     1) FTP login: ftpuser / Passw0rd!123
     2) Upload shell.php into /home/ftpuser/upload
     3) Access it via http://host/upload/shell.php?cmd=...
     4) From shell, read /etc/internal-sync.conf to discover SSH creds
     5) ssh ftpuser@host with same password
   ============================================================== #}

ftp_web_packages:
  pkg.installed:
    - pkgs:
      - vsftpd
      - apache2
      - php
      - libapache2-mod-php
      - ssl-cert          # snakeoil certs for vsftpd TLS paths
      - openssh-server    # SSH so ftpuser can log in

vsftpd_service:
  service.running:
    - name: vsftpd
    - enable: True
    - require:
      - pkg: ftp_web_packages

apache_service:
  service.running:
    - name: apache2
    - enable: True
    - require:
      - pkg: ftp_web_packages

ssh_service:
  service.running:
    - name: ssh
    - enable: True
    - require:
      - pkg: ftp_web_packages

# --------------------------------------------------------------
# Weak login user for FTP/SSH (UID >= 1000 on a normal system)
# --------------------------------------------------------------
ftp_weak_user:
  user.present:
    - name: ftpuser
    - home: /home/ftpuser
    - shell: /bin/bash
    # SHA-512 hash for password "Passw0rd!123"
    - password: "$6$NaCl12345$9JFwdxuqE1Mbam83N0OSmoaHHli0UT95m3sqY7kqsBXAj0WOSYtOeiLwb.2UojS6QLLi6EKlm9bNluWJd0LGw."
    - require:
      - pkg: ftp_web_packages


ftpuser_home_dir:
  file.directory:
    - name: /home/ftpuser
    - user: ftpuser
    - group: ftpuser
    - mode: '0755'
    - require:
      - user: ftp_weak_user


# --------------------------------------------------------------
# Upload dir for FTP user: /home/ftpuser/upload
# --------------------------------------------------------------
ftp_user_upload_dir:
  file.directory:
    - name: /home/ftpuser/upload
    - user: ftpuser
    - group: ftpuser
    - mode: '0777'
    - makedirs: True
    - require:
      - user: ftp_weak_user

# --------------------------------------------------------------
# Symlink /var/www/html/upload → /home/ftpuser/upload
# So anything uploaded via FTP is visible at /upload/
# --------------------------------------------------------------
ftp_web_root_dir:
  file.directory:
    - name: /var/www/html
    - user: root
    - group: root
    - mode: '0755'
    - require:
      - pkg: ftp_web_packages

ftp_web_upload_symlink:
  file.symlink:
    - name: /var/www/html/upload
    - target: /home/ftpuser/upload
    - require:
      - file: ftp_web_root_dir
      - file: ftp_user_upload_dir

# --------------------------------------------------------------
# Insecure vsftpd config with weak local user access
# --------------------------------------------------------------
ftp_vsftpd_conf:
  file.managed:
    - name: /etc/vsftpd.conf
    - user: root
    - group: root
    - mode: '0644'
    - contents: |
        listen=YES
        listen_ipv6=NO

        anonymous_enable=YES
        anon_root=/home/ftpuser
        anon_upload_enable=YES
        anon_umask=022

        local_enable=YES
        write_enable=YES

        local_root=/home/ftpuser/upload
        chroot_local_user=YES
        allow_writeable_chroot=YES

        dirmessage_enable=YES
        use_localtime=YES
        xferlog_enable=YES
        connect_from_port_20=YES

        secure_chroot_dir=/var/run/vsftpd/empty
        pam_service_name=vsftpd

        rsa_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem
        rsa_private_key_file=/etc/ssl/private/ssl-cert-snakeoil.key
    - require:
      - pkg: ftp_web_packages
      - user: ftp_weak_user
      - file: ftp_user_upload_dir
    - watch_in:
      - service: vsftpd_service

# --------------------------------------------------------------
# Internal config file with SSH credentials (leaked via webshell)
# --------------------------------------------------------------
internal_ssh_config:
  file.managed:
    - name: /etc/internal-sync.conf
    - user: root
    - group: root
    - mode: '0644'   # readable by www-data via PHP shell
    - contents: |
        # Internal sync service configuration
        SSH_HOST=127.0.0.1
        SSH_PORT=22
        SSH_USER=ftpuser
        SSH_PASSWORD=Passw0rd!123
    - require:
      - user: ftp_weak_user
      - pkg: ftp_web_packages

# --------------------------------------------------------------
# Simple homepage with hints about FTP and the config file
# --------------------------------------------------------------
ftp_index_page:
  file.managed:
    - name: /var/www/html/index.php
    - user: root
    - group: root
    - mode: '0644'
    - contents: |
        <!DOCTYPE html>
        <html>
        <head><title>Internal Upload Portal</title></head>
        <body>
            <h1>Internal File Drop Portal</h1>
            <p>This server is used for internal file transfers.</p>
            <p>FTP user: <code>ftpuser</code></p>
            <p>Uploads appear under: <code>/upload/</code></p>
            <hr>
            <p><strong>Note:</strong> Legacy sync job configuration is stored at:
               <code>/etc/internal-sync.conf</code></p>
        </body>
        </html>
    - require:
      - file: ftp_web_root_dir
      - file: ftp_web_upload_symlink
      - file: internal_ssh_config

