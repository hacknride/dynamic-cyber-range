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

# 3) Let ALL users run needrestart via sudo with no password (vulnerable misconfig)
all_users_needrestart_sudo:
  file.managed:
    - name: /etc/sudoers.d/needrestart-all-users
    - user: root
    - group: root
    - mode: '0440'
    - contents: |
        ALL ALL=(ALL) NOPASSWD: /usr/sbin/needrestart
    - require:
      - pkg: sudo_package
      - cmd: needrestart_3_5_installed