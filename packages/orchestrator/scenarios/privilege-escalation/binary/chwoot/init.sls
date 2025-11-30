{# CVE-2025-32463 (chwoot) - Vulnerable sudo 1.9.17 privilege escalation #}
{% set sudo_version = '1.9.17' %}
{% set sudo_tarball_url = 'https://www.sudo.ws/dist/sudo-' ~ sudo_version ~ '.tar.gz' %}
{% set sudo_src_dir = '/usr/local/src/sudo-' ~ sudo_version %}
{% set sudo_tarball = '/usr/local/src/sudo-' ~ sudo_version ~ '.tar.gz' %}

# 1) Install build dependencies for compiling sudo from source
build_deps:
  pkg.installed:
    - pkgs:
      - build-essential
      - wget
      - libpam0g-dev
      - libssl-dev
      - zlib1g-dev

# 2) Download vulnerable sudo 1.9.17 tarball
sudo_tarball_download:
  cmd.run:
    - name: wget -O {{ sudo_tarball }} '{{ sudo_tarball_url }}'
    - creates: {{ sudo_tarball }}
    - require:
      - pkg: build_deps

# 3) Extract the tarball
sudo_extract:
  archive.extracted:
    - name: /usr/local/src
    - source: {{ sudo_tarball }}
    - archive_format: tar
    - if_missing: {{ sudo_src_dir }}
    - require:
      - cmd: sudo_tarball_download

# 4) Build and install sudo 1.9.17 from source
sudo_build_install:
  cmd.run:
    - name: |
        cd {{ sudo_src_dir }}
        ./configure --prefix=/usr --sysconfdir=/etc --with-pam
        make -j$(nproc)
        make install
    - unless: /usr/bin/sudo --version 2>/dev/null | head -1 | grep -q '{{ sudo_version }}'
    - require:
      - archive: sudo_extract

# 5) Hold the sudo package to prevent apt from upgrading it
sudo_hold:
  cmd.run:
    - name: apt-mark hold sudo 2>/dev/null || true
    - require:
      - cmd: sudo_build_install
