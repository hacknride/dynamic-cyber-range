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

# --- Download & extract WordPress -------------------------------------
wp_archive:
  archive.extracted:
    - name: {{ install_dir }}
    - source: https://wordpress.org/wordpress-{{ version }}.tar.gz
    - archive_format: tar
    - options: --strip-components=1
    - enforce_toplevel: False
    - skip_verify: True
    - if_missing: {{ install_dir }}/wp-settings.php
    - require:
      - file: {{ install_dir }}

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
      - archive: wp_archive
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
        sudo -u {{ web_user }} wp core install \
          --url="http://$(hostname -I | awk '{print $1}')" \
          --title="$HOSTNAME" \
          --admin_user=admin \
          --admin_password=admin \
          --admin_email=admin@"$HOSTNAME".dcr \
          --skip-email
        # Clean up Sample Page
        sudo -u {{ web_user }} wp post delete 2 --force 2>/dev/null || true
    - unless: sudo -u {{ web_user }} wp core is-installed --path={{ install_dir }} 2>/dev/null
    - require:
      - cmd: install_wpcli
      - cmd: wp_perms
      - service: nginx_service

# --- Customize WordPress theme and menu ------------------------------
wordpress_customize:
  cmd.run:
    - name: |
        cd {{ install_dir }}
        # Activate Twenty Twenty Four (modern design with good block theme support)
        sudo -u {{ web_user }} wp theme install twentytwentyfour --activate
        
        # For block themes, we need to insert the Login link directly into the header template
        # Get or create navigation menu
        NAV_ID=$(sudo -u {{ web_user }} wp post list --post_type=wp_navigation --format=ids | head -1)
        if [ -z "$NAV_ID" ]; then
          NAV_ID=$(sudo -u {{ web_user }} wp post create \
            --post_type=wp_navigation \
            --post_status=publish \
            --post_title='Header Navigation' \
            --post_content='<!-- wp:navigation-link {"label":"Login","url":"/wp-login.php"} /-->' \
            --porcelain)
        else
          # Update existing navigation to add Login link
          sudo -u {{ web_user }} wp post update $NAV_ID \
            --post_content='<!-- wp:navigation-link {"label":"Login","url":"/wp-login.php"} /-->'
        fi
        
        # Insert the navigation reference into the theme options
        sudo -u {{ web_user }} wp option patch insert core_navigation primary $NAV_ID 2>/dev/null || true
    - unless: sudo -u {{ web_user }} wp theme list --status=active --field=name --path={{ install_dir }} | grep -q twentytwentyfour
    - require:
      - cmd: wordpress_install

# --- Create alice user ------------------------------------------------
alice_user:
  user.present:
    - name: alice
    - fullname: "Alice"
    - shell: /bin/bash
    - home: /home/alice
    - createhome: True
    - password: "$6$dWsrXGxS$uThah.5gGVHUugKjOlexvn0iX1BJtA58mhTqxnKY2y1LkIYWC8aisTO3UzLeYhaU1KLMQ1gwjCOBRAnjObVPw."
    - require:
      - pkg: wordpress_stack

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
