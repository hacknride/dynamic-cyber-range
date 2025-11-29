{% set version = salt['pillar.get']('version', '3.5') %}
{% set deb_url = 'https://launchpad.net/ubuntu/+source/needrestart/' ~ version ~ '-5ubuntu2.5/+build/31292937/+files/needrestart_' ~ version ~ '-5ubuntu2.5_all.deb' %}
{% set deb_path = '/usr/local/src/needrestart_' ~ version ~ '-5ubuntu2.5_all.deb' %}
{% set needrestart_version = version ~ '-5ubuntu2.5' %}

# 1) Download the .deb (rough equivalent of wget)
needrestart_deb_downloaded:
  cmd.run:
    - name: wget -O {{ deb_path }} '{{ deb_url }}'
    - creates: {{ deb_path }}

# 2) Install that specific version via apt
# Only runs if the installed version is NOT the target version
needrestart_3_5_installed:
  cmd.run:
    - name: DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades {{ deb_path }}
    - unless: "dpkg -s needrestart 2>/dev/null | grep -q 'Version: {{ needrestart_version }}'"
    - require:
      - cmd: needrestart_deb_downloaded

# Ensure sudo is present for later sudoers config
sudo_package:
  pkg.installed:
    - name: sudo

# 3) Create the "ubuntu" user and give it SSH capability
ubuntu_user:
  user.present:
    - name: ubuntu
    - home: /home/ubuntu
    - shell: /bin/bash
    - password: {{ salt['pillar.get']('password', 'ubuntu') }}
    - hash_password: True
    - require:
      - pkg: sudo_package

# 4) Let ubuntu run needrestart via sudo with no password
ubuntu_needrestart_sudo:
  file.managed:
    - name: /etc/sudoers.d/ubuntu-needrestart
    - user: root
    - group: root
    - mode: '0440'
    - contents: |
        ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/needrestart
    - require:
      - pkg: sudo_package
      - cmd: needrestart_3_5_installed

# Secure root password if requested
{% if salt['pillar.get']('needrestart:secure-root-pass', False) or salt['pillar.get']('secure-root-pass', False) %}
root_password_randomized:
  cmd.run:
    - name: |
        NEW_PASS=$(openssl rand -base64 32)
        echo "root:$NEW_PASS" | chpasswd
        echo "Root password set to: $NEW_PASS" > /root/.password_info
        chmod 600 /root/.password_info
    - unless: test -f /root/.password_info
{% endif %}
