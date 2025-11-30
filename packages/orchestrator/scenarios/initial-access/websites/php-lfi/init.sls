{# ==============================================================
   Initial Access Scenario:
   LFI Web App → Leaked Apache Config → SSH Credentials → Shell
   - Installs Apache + PHP + OpenSSH server
   - Deploys vulnerable PHP app using ?page= include()
   - Creates SSH user "backup" with known password
   - Stores SSH creds in an Apache-related config file
   ============================================================== #}

lfi_ssh_packages:
  pkg.installed:
    - pkgs:
      - apache2
      - php
      - libapache2-mod-php
      - openssh-server

lfi_ssh_apache_service:
  service.running:
    - name: apache2
    - enable: True
    - require:
      - pkg: lfi_ssh_packages

lfi_ssh_ssh_service:
  service.running:
    - name: ssh
    - enable: True
    - require:
      - pkg: lfi_ssh_packages

# --------------------------------------------------------------
# Create SSH user with known password
#   username: webbackup
#   password: Passw0rd!123
# --------------------------------------------------------------
lfi_ssh_backup_user:
  user.present:
    - name: webbackup
    - home: /home/webbackup
    - shell: /bin/bash
    # SHA-512 hash for password "Passw0rd!123"
    - password: "$6$NaCl12345$9JFwdxuqE1Mbam83N0OSmoaHHli0UT95m3sqY7kqsBXAj0WOSYtOeiLwb.2UojS6QLLi6EKlm9bNluWJd0LGw."
    - require:
      - pkg: lfi_ssh_packages

# --------------------------------------------------------------
# Web root & vulnerable PHP app
# --------------------------------------------------------------
lfi_ssh_web_root_dir:
  file.directory:
    - name: /var/www/html
    - user: root
    - group: root
    - mode: '0755'
    - require:
      - pkg: lfi_ssh_packages

lfi_ssh_index_php:
  file.managed:
    - name: /var/www/html/index.php
    - user: root
    - group: root
    - mode: '0644'
    - contents: |
        <?php
        $page = isset($_GET['page']) ? $_GET['page'] : 'home.php';
        ?>
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Intranet Portal</title>
        </head>
        <body>
            <h1>Internal Operations Portal</h1>
            <p>Welcome to the internal tools portal used by the web team.</p>
            <p><a href="?page=home.php">Home</a> | <a href="info.php">PHP Info</a></p>
            <hr>
            <div>
                <?php
                // no validation or path restriction
                @include($page);
                ?>
            </div>
        </body>
        </html>
    - require:
      - file: lfi_ssh_web_root_dir

lfi_ssh_home_php:
  file.managed:
    - name: /var/www/html/home.php
    - user: root
    - group: root
    - mode: '0644'
    - contents: |
        <?php
        echo "<h2>Dashboard</h2>";
        echo "<p>This portal is used for internal automation and deployment tasks.</p>";
        echo "<p>Cron-based sync jobs are managed by the web server configuration.</p>";
        ?>
    - require:
      - file: lfi_ssh_web_root_dir

lfi_ssh_info_php:
  file.managed:
    - name: /var/www/html/info.php
    - user: root
    - group: root
    - mode: '0644'
    - contents: |
        <?php
        phpinfo();
        ?>
    - require:
      - file: lfi_ssh_web_root_dir

# --------------------------------------------------------------
# Insert SSH credentials into the main Apache config file
# (/etc/apache2/apache2.conf), which is always present and
# world-readable.
# --------------------------------------------------------------
lfi_ssh_credentials_in_apache_conf:
  file.append:
    - name: /etc/apache2/apache2.conf
    - text: |
        # -------------------------------------------------------------------
        # INTERNAL SYNC CREDENTIALS
        # -------------------------------------------------------------------
        SetEnv SYNC_USER webbackup
        SetEnv SYNC_PASSWORD Passw0rd!123
    - require:
      - pkg: lfi_ssh_packages

