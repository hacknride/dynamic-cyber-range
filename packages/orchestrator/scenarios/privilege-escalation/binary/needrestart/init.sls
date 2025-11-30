{# ============================================================
  Build & install sudo-1.9.17 from source on Ubuntu/Debian.
  - Installs build deps
  - Downloads tarball (URL can be overridden via pillar)
  - Builds to /usr/local (does not remove /usr/bin/sudo)
  - Ensures /usr/local/bin precedes /usr/bin in PATH (profile.d)
  Idempotency: checks /usr/local/bin/sudo --version for '1.9.17'

  Pillar (optional):
    sudo1917:
      url: https://www.sudo.ws/dist/sudo-1.9.17.tar.gz
      sha256: "<official_sha256_here>"   # optional but recommended
# ============================================================ #}

{% if grains['os_family'] != 'Debian' %}
unsupported_os:
  test.fail_without_changes:
    - name: "This state is intended for Ubuntu/Debian only (got {{ grains['os_family'] }})."
{% endif %}

{% set defaults = {
  'url': 'https://www.sudo.ws/dist/sudo-1.9.17.tar.gz',
  'sha256': ''
} %}
{% set cfg = salt['pillar.get']('sudo1917', defaults) %}
{% set tar_url = cfg.get('url', defaults['url']) %}
{% set tar_sha = cfg.get('sha256', defaults['sha256']) %}
{% set src_dir = '/usr/local/src' %}
{% set tar_file = src_dir + '/sudo-1.9.17.tar.gz' %}
{% set build_dir = src_dir + '/sudo-1.9.17' %}
{% set desired_ver = '1.9.17' %}
{% set prefix = '/usr/local' %}
{% set local_sudo = prefix + '/bin/sudo' %}

# --- Build dependencies -------------------------------------------------------

sudo1917-deps:
  pkg.installed:
    - pkgs:
      - build-essential
      - pkg-config
      - libpam0g-dev
      - libaudit-dev
      - libselinux1-dev
      - libssl-dev
      - zlib1g-dev
      - libldap2-dev
      - libsasl2-dev
      - libkrb5-dev
      - libgcrypt20-dev
      - wget
      - tar
      - ca-certificates
    - refresh: True

# --- Fetch tarball (with optional SHA256 verification) -----------------------

sudo1917-src-dir:
  file.directory:
    - name: {{ src_dir }}
    - user: root
    - group: root
    - mode: '0755'

{% if tar_sha %}
sudo1917-tarball:
  cmd.run:
    - name: bash -lc "set -euo pipefail; curl -fsSL '{{ tar_url }}' -o '{{ tar_file }}'; echo '{{ tar_sha }}  {{ tar_file }}' | sha256sum -c -"
    - creates: {{ tar_file }}
    - require:
      - file: sudo1917-src-dir
      - pkg: sudo1917-deps
{% else %}
sudo1917-tarball:
  cmd.run:
    - name: bash -lc "set -euo pipefail; curl -fsSL '{{ tar_url }}' -o '{{ tar_file }}'"
    - creates: {{ tar_file }}
    - require:
      - file: sudo1917-src-dir
      - pkg: sudo1917-deps
{% endif %}

# --- Extract source ----------------------------------------------------------

sudo1917-unpack:
  cmd.run:
    - name: tar -xzf {{ tar_file }} -C {{ src_dir }}
    - cwd: {{ src_dir }}
    - unless: test -d '{{ build_dir }}'
    - require:
      - cmd: sudo1917-tarball

# --- Configure (enable PAM & audit) -----------------------------------------

sudo1917-configure:
  cmd.run:
    - name: ./configure --prefix={{ prefix }} --with-pam --with-audit
    - cwd: {{ build_dir }}
    - unless: test -f 'config.status'
    - require:
      - cmd: sudo1917-unpack

# --- Build -------------------------------------------------------------------

sudo1917-make:
  cmd.run:
    - name: make -j"$(nproc || echo 2)"
    - cwd: {{ build_dir }}
    - unless: test -f 'src/sudo'
    - require:
      - cmd: sudo1917-configure

# --- Install to /usr/local ---------------------------------------------------

sudo1917-install:
  cmd.run:
    - name: make install
    - cwd: {{ build_dir }}
    - unless: "{{ local_sudo }} --version 2>/dev/null | head -1 | awk '{print $3}' | grep -qx '{{ desired_ver }}'"
    - require:
      - cmd: sudo1917-make

# 3) Hold the package to prevent automatic upgrades
needrestart_hold:
  cmd.run:
    - name: apt-mark hold needrestart
    - unless: apt-mark showhold | grep -q needrestart
    - require:
      - cmd: needrestart_3_5_installed

# Ensure sudo is present for later sudoers config
sudo_package:
  pkg.installed:
    - name: sudo

# 4) Enable interpreter scanning in needrestart config (makes it exploitable)
needrestart_config_interpscan:
  file.replace:
    - name: /etc/needrestart/needrestart.conf
    - pattern: '^\$nrconf\{interpscan\}\s*=\s*0;'
    - repl: '$nrconf{interpscan} = 1;'
    - append_if_not_found: True
    - require:
      - cmd: needrestart_hold

# 5) Let ALL users run needrestart via sudo with no password (vulnerable misconfig)
all_users_needrestart_sudo:
  file.managed:
    - name: /etc/profile.d/00-local-bin-first.sh
    - mode: '0644'
    - contents: |
        # Prepend /usr/local/bin so locally built sudo takes precedence
        case ":$PATH:" in
          *:/usr/local/bin:*) ;;
          *) export PATH="/usr/local/bin:$PATH" ;;
        esac

# --- Final assertion: confirm the installed version is 1.9.17 ---------------

sudo1917-assert-version:
  test.fail_without_changes:
    - name: "Expected /usr/local/bin/sudo version {{ desired_ver }} after install"
    - failhard: True
    - unless: "{{ local_sudo }} --version 2>/dev/null | head -1 | awk '{print $3}' | grep -qx '{{ desired_ver }}'"
    - require:
      - pkg: sudo_package
      - cmd: needrestart_hold