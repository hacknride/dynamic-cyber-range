{# =========================
   Tunables
   ========================= #}
{% set db_name      = 'vulnapp' %}
{% set db_user      = 'root' %}
{% set db_pass      = 'root' %}      # intentionally weak
{% set backup_dir   = '/opt/db_backups' %}

{# Optionally randomize SYSTEM root password (not DB root) #}

{# =========================
   1. Packages
   ========================= #}

mariadb-server:
  pkg.installed:
    - name: mariadb-server

mariadb-client:
  pkg.installed:
    - name: mariadb-client

openssh-server:
  pkg.installed:
    - name: openssh-server

ssh_service:
  service.running:
    - name: ssh
    - enable: True
    - require:
      - pkg: openssh-server

{# =========================
   2. Start MariaDB first
   ========================= #}

mariadb-service-initial:
  service.running:
    - name: mariadb
    - enable: True
    - require:
      - pkg: mariadb-server

{# =========================
   3. Open MariaDB to 0.0.0.0
   ========================= #}

mariadb-config-open:
  file.replace:
    - name: /etc/mysql/mariadb.conf.d/50-server.cnf
    - pattern: '^bind-address\s*=.*'
    - repl: 'bind-address            = 0.0.0.0'
    - append_if_not_found: True
    - require:
      - service: mariadb-service-initial

mariadb-service:
  service.running:
    - name: mariadb
    - enable: True
    - watch:
      - file: mariadb-config-open
    - require:
      - service: mariadb-service-initial

{# =========================
   4. Create insecure DB + user
   ========================= #}

vuln_db_setup:
  cmd.run:
    - name: >
        mysql -uroot -e "
        CREATE DATABASE IF NOT EXISTS {{ db_name }};
        CREATE USER IF NOT EXISTS '{{ db_user }}'@'%' IDENTIFIED BY '{{ db_pass }}';
        GRANT ALL PRIVILEGES ON {{ db_name }}.* TO '{{ db_user }}'@'%';
        FLUSH PRIVILEGES;"
    - require:
      - service: mariadb-service
    - unless: >
        mysql -uroot -e
        "SELECT User,Host FROM mysql.user WHERE User='{{ db_user }}' AND Host='%';"
        | grep '{{ db_user }}'

{# =========================
   5. Seed DB with 3 users
   ========================= #}

vuln_db_seed:
  cmd.run:
    - name: >
        mysql -u{{ db_user }} -p{{ db_pass }} {{ db_name }} -e "
          CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50),
            password VARCHAR(200),
            email VARCHAR(100)
          );
          INSERT INTO users (username, password, email) VALUES
            ('alice', 'password123', 'alice@example.com'),
            ('bob',   'super-secure-pass1!',   'bob@example.com'),
            ('admin', 'admin123!@#', 'admin@example.com');
        "
    - require:
      - cmd: vuln_db_setup
    - unless: >
        mysql -u{{ db_user }} -p{{ db_pass }} {{ db_name }} -e "SELECT * FROM users LIMIT 1;"

{# =========================
   6. World-readable DB dump
   ========================= #}

vuln_backup_dir:
  file.directory:
    - name: {{ backup_dir }}
    - user: root
    - group: root
    - mode: '0777'          # deliberately over-permissive

vuln_db_dump:
  cmd.run:
    - name: >
        mysqldump -uroot {{ db_name }} > {{ backup_dir }}/{{ db_name }}.sql
        && chmod 0644 {{ backup_dir }}/{{ db_name }}.sql
    - require:
      - cmd: vuln_db_seed
      - file: vuln_backup_dir
    - unless: test -f {{ backup_dir }}/{{ db_name }}.sql

{# =========================
   7. user setup
   ========================= #}

alice_user:
  user.present:
    - name: alice
    - fullname: "Alice"
    - shell: /bin/bash
    - home: /home/alice
    - createhome: True
    # Password is password123
    - password: "$6$dWsrXGxS$uThah.5gGVHUugKjOlexvn0iX1BJtA58mhTqxnKY2y1LkIYWC8aisTO3UzLeYhaU1KLMQ1gwjCOBRAnjObVPw."
    - require:
      - pkg: openssh-server

{# =========================
   8. Randomize system root password
   ========================= #}

{% if salt['pillar.get']('default-database:secure-root-pass', False) %}
root_password_randomized:
  cmd.run:
    - name: |
        NEW_PASS=$(openssl rand -base64 32)
        echo "root:$NEW_PASS" | chpasswd
        echo "Root password set to: $NEW_PASS" > /root/.password_info
        chmod 600 /root/.password_info
    - unless: test -f /root/.password_info
    - require:
      - pkg: openssh-server
{% endif %}

