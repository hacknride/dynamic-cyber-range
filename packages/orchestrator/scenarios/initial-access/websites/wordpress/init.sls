{% set wp = pillar.get('wordpress', {}) %}
{% set version = wp.get('version', '6.4') %}
{% set install_dir = wp.get('install_dir', '/var/www/wordpress') %}
{% set web_user = wp.get('web_user', 'www-data') %}
{% set web_group = wp.get('web_group', 'www-data') %}
{% set db_name = wp.get('db', {}).get('name', 'wordpress') %}
{% set db_user = wp.get('db', {}).get('user', 'wp_user') %}
{% set db_pass = wp.get('db', {}).get('password', 'password') %}
{% set db_host = wp.get('db', {}).get('host', 'localhost') %}
{% set php_version = wp.get('php_version', '8.3') %}

# --- Packages ---------------------------------------------------------
wordpress_stack:
  pkg.installed:
    - pkgs:
      - nginx
      - php-fpm
      - php-mysql
      - mariadb-server
      - curl
      - tar
      - openssh-server

# --- Install WP-CLI ---------------------------------------------------
install_wpcli:
  cmd.run:
    - name: |
        curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
        chmod +x wp-cli.phar
        mv wp-cli.phar /usr/local/bin/wp
    - creates: /usr/local/bin/wp
    - require:
      - pkg: wordpress_stack

# --- SSH service ------------------------------------------------------
ssh_service:
  service.running:
    - name: ssh
    - enable: True
    - require:
      - pkg: wordpress_stack

# --- Start MariaDB ----------------------------------------------------
mariadb_service:
  service.running:
    - name: mariadb
    - enable: True
    - require:
      - pkg: wordpress_stack

# --- Database setup ---------------------------------------------------
setup_wp_database:
  cmd.run:
    - name: |
        mysql -uroot -e "
        CREATE DATABASE IF NOT EXISTS {{ db_name }};
        CREATE USER IF NOT EXISTS '{{ db_user }}'@'%' IDENTIFIED BY '{{ db_pass }}';
        GRANT ALL PRIVILEGES ON {{ db_name }}.* TO '{{ db_user }}'@'%';
        FLUSH PRIVILEGES;"
    - require:
      - service: mariadb_service
    - unless: mysql -uroot -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{{ db_name }}';" | grep -q {{ db_name }}

# --- Directory --------------------------------------------------------
{{ install_dir }}:
  file.directory:
    - user: {{ web_user }}
    - group: {{ web_group }}
    - mode: "0755"
    - makedirs: True
    - require:
      - pkg: wordpress_stack

# --- Download & extract WordPress (using WP-CLI for exact version) ---
wp_download:
  cmd.run:
    - name: |
        cd {{ install_dir }}
        # Use WP-CLI to download exact version
        sudo -u {{ web_user }} wp core download --version={{ version }} --force
    - unless: test -f {{ install_dir }}/wp-settings.php && grep -q "{{ version }}" {{ install_dir }}/wp-includes/version.php
    - require:
      - file: {{ install_dir }}
      - cmd: install_wpcli

# --- wp-config.php ----------------------------------------------------
{{ install_dir }}/wp-config.php:
  file.managed:
    - contents: |
        <?php
        define('DB_NAME', '{{ db_name }}');
        define('DB_USER', '{{ db_user }}');
        define('DB_PASSWORD', '{{ db_pass }}');
        define('DB_HOST', '{{ db_host }}');
        define('DB_CHARSET', 'utf8');
        define('DB_COLLATE', '');
        define('WP_AUTO_UPDATE_CORE', false);
        define('AUTOMATIC_UPDATER_DISABLED', true);
        $table_prefix = 'wp_';
        define('WP_DEBUG', false);
        if ( !defined('ABSPATH') )
          define('ABSPATH', __DIR__ . '/');
        require_once ABSPATH . 'wp-settings.php';
        ?>
    - user: {{ web_user }}
    - group: {{ web_group }}
    - mode: '0640'
    - require:
      - cmd: wp_download
      - cmd: setup_wp_database

# --- Permissions ------------------------------------------------------
wp_perms:
  cmd.run:
    - name: chown -R {{ web_user }}:{{ web_group }} {{ install_dir }}
    - require:
      - file: {{ install_dir }}/wp-config.php

# --- Nginx site -------------------------------------------------------
/etc/nginx/sites-available/wordpress:
  file.managed:
    - contents: |
        server {
          listen 80;
          server_name _;
          root {{ install_dir }};
          index index.php index.html;

          location / {
            try_files $uri $uri/ /index.php?$args;
          }

          location ~ \.php$ {
            include snippets/fastcgi-php.conf;
            fastcgi_pass unix:/run/php/php{{ php_version }}-fpm.sock;
          }

          location ~* \.(log|conf)$ {
            deny all;
          }
        }
    - require:
      - pkg: wordpress_stack

/etc/nginx/sites-enabled/wordpress:
  file.symlink:
    - target: /etc/nginx/sites-available/wordpress
    - require:
      - file: /etc/nginx/sites-available/wordpress

remove_default_nginx_site:
  file.absent:
    - name: /etc/nginx/sites-enabled/default

# --- Services ---------------------------------------------------------
php_fpm_service:
  service.running:
    - name: php{{ php_version }}-fpm
    - enable: True
    - require:
      - pkg: wordpress_stack

nginx_service:
  service.running:
    - name: nginx
    - enable: True
    - watch:
      - file: /etc/nginx/sites-available/wordpress
      - file: /etc/nginx/sites-enabled/wordpress
    - require:
      - service: php_fpm_service
      - cmd: wp_perms

# --- Auto-install WordPress -------------------------------------------
wordpress_install:
  cmd.run:
    - name: |
        cd {{ install_dir }}
        HOSTNAME=$(hostname)
        
        # Verify WordPress 6.4 is actually present
        CURRENT_VERSION=$(sudo -u {{ web_user }} wp core version 2>/dev/null || echo "not-installed")
        echo "Current WordPress version: $CURRENT_VERSION"
        
        # If not 6.4, force download of 6.4
        if [ "$CURRENT_VERSION" != "{{ version }}" ]; then
          echo "Forcing WordPress {{ version }} download"
          sudo -u {{ web_user }} wp core download --version={{ version }} --force
        fi
        
        # Disable auto-updates BEFORE installation
        sudo -u {{ web_user }} wp config set WP_AUTO_UPDATE_CORE false --raw
        sudo -u {{ web_user }} wp config set AUTOMATIC_UPDATER_DISABLED true --raw
        
        # Check if WordPress is already installed
        if sudo -u {{ web_user }} wp core is-installed 2>/dev/null; then
          echo "WordPress already installed, skipping installation"
        else
          # Install WordPress without triggering updates
          sudo -u {{ web_user }} wp core install \
            --url="http://$(hostname -I | awk '{print $1}')" \
            --title="$HOSTNAME".dcr \
            --admin_user=admin \
            --admin_password=admin \
            --admin_email=admin@"$HOSTNAME".dcr \
            --skip-email
        fi
        
        # Disable plugin/theme auto-updates
        sudo -u {{ web_user }} wp plugin auto-updates disable --all 2>/dev/null || true
        sudo -u {{ web_user }} wp theme auto-updates disable --all 2>/dev/null || true
        # Clean up Sample Page and default plugins
        sudo -u {{ web_user }} wp post delete 2 --force 2>/dev/null || true
        sudo -u {{ web_user }} wp plugin delete akismet hello 2>/dev/null || true
        
        {% set low_priv_user = salt['pillar.get']('wordpress:hiddens:low-privilege-user', '') %}
        {% set low_priv_pass = salt['pillar.get']('wordpress:hiddens:low-privilege-pass', '') %}
        {% if low_priv_user and low_priv_pass %}
        # Create low-privilege WordPress user from hiddens
        sudo -u {{ web_user }} wp user create {{ low_priv_user }} {{ low_priv_user }}@{{ '$(hostname)' }}.dcr \
          --role=editor \
          --user_pass={{ low_priv_pass }} \
          --display_name="{{ low_priv_user }}" 2>/dev/null || echo "User {{ low_priv_user }} may already exist"
        
        # Store plaintext password in usermeta table (discoverable via Adminer)
        sudo -u {{ web_user }} wp user meta update {{ low_priv_user }} backup_password "{{ low_priv_pass }}"
        {% endif %}
    - unless: sudo -u {{ web_user }} wp core is-installed --path={{ install_dir }} 2>/dev/null
    - require:
      - cmd: install_wpcli
      - cmd: wp_perms
      - service: nginx_service

# --- Install Adminer plugin and remove default plugins ----------------
adminer_plugin:
  cmd.run:
    - name: |
        cd {{ install_dir }}
        # Remove default plugins
        sudo -u {{ web_user }} wp plugin delete akismet hello 2>/dev/null || true
        # Install Adminer
        sudo -u {{ web_user }} wp plugin install pexlechris-adminer --activate 2>/dev/null || true
    - onlyif: sudo -u {{ web_user }} wp core is-installed --path={{ install_dir }} 2>/dev/null
    - require:
      - cmd: wordpress_install

# --- Customize WordPress theme and menu ------------------------------
wordpress_customize:
  cmd.run:
    - name: |
        cd {{ install_dir }}
        HOSTNAME=$(hostname)
        
        # Activate Twenty Twenty Four (modern design with good block theme support)
        sudo -u {{ web_user }} wp theme install twentytwentyfour --activate
        
        # Convert hostname from "noun-adjective" to "Noun Adjective" (capitalize each word)
        FORMATTED_NAME=$(echo "$HOSTNAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
        
        # Replace all "Études" instances in theme patterns with formatted hostname
        find wp-content/themes/twentytwentyfour/patterns/ -type f -name "*.php" -exec sed -i "s/Études/$FORMATTED_NAME/g" {} \;
        
        # For block themes, update ALL navigation menus to include Login link
        # Get all navigation IDs
        NAV_IDS=$(sudo -u {{ web_user }} wp post list --post_type=wp_navigation --format=ids)
        
        if [ -z "$NAV_IDS" ]; then
          # No navigation exists, create one
          NAV_ID=$(sudo -u {{ web_user }} wp post create \
            --post_type=wp_navigation \
            --post_status=publish \
            --post_title='Header Navigation' \
            --post_content='<!-- wp:navigation-link {"label":"Login","url":"/wp-login.php"} /-->' \
            --porcelain)
        else
          # Update ALL existing navigations to include Login link
          for NAV_ID in $NAV_IDS; do
            sudo -u {{ web_user }} wp post update $NAV_ID \
              --post_content='<!-- wp:navigation-link {"label":"Login","url":"/wp-login.php"} /-->'
          done
        fi
    - onlyif: sudo -u {{ web_user }} wp core is-installed --path={{ install_dir }} 2>/dev/null
    - require:
      - cmd: wordpress_install

# --- Create Linux user from hiddens (if specified) --------------------
{% set low_priv_user = salt['pillar.get']('wordpress:hiddens:low-privilege-user', '') %}
{% set low_priv_pass = salt['pillar.get']('wordpress:hiddens:low-privilege-pass', '') %}
{% if low_priv_user and low_priv_pass %}
linux_user_from_hiddens:
  cmd.run:
    - name: |
        # Create user if doesn't exist
        if ! id {{ low_priv_user }} &>/dev/null; then
          useradd -m -s /bin/bash {{ low_priv_user }}
        fi
        # Set password
        echo "{{ low_priv_user }}:{{ low_priv_pass }}" | chpasswd
    - require:
      - pkg: wordpress_stack
{% else %}

# --- Randomize system root password -----------------------------------
{% if salt['pillar.get']('wordpress:secure-root-pass', False) %}
root_password_randomized:
  cmd.run:
    - name: |
        NEW_PASS=$(openssl rand -base64 32)
        echo "root:$NEW_PASS" | chpasswd
        echo "Root password set to: $NEW_PASS" > /root/.password_info
        chmod 600 /root/.password_info
    - unless: test -f /root/.password_info
    - require:
      - pkg: wordpress_stack
{% endif %}
