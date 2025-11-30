{# ============================================================================
   DCR one-file state driven by /srv/salt/dcr/service.yaml

   service.yaml schema:
     difficulty: easy|medium|hard
     os: linux|windows
     services:
       - name: nginx
         enabled: true
       - name: docker
         enabled: true

   Behavior by difficulty (Linux only for CVE-2025-32463):
     easy   -> Mitigate: ensure sudo >= 1.9.17p1 and add a light audit rule
     medium -> Prepare a safe lab chroot and restricted sudoers entry
     hard   -> Same as medium + (optionally) install a specific sudo .deb if provided

   Optional knobs in service.yaml (all optional):
     sudo_vuln_deb_url: "https://example/sudo_1.9.17-1_amd64.deb"
     sudo_vuln_deb_version: "1.9.17-1"
   If not provided, we skip pinning and just require sudo present.

   This file also installs/starts listed services by OS.
   ============================================================================ #}

{# Load spec from master fileserver and parse it #}
{% set spec_str = salt['cp.get_file_str']('salt://dcr/service.yaml') %}
{% if not spec_str %}
service_yaml_missing:
  test.fail_without_changes:
    - name: "Missing service.yaml at salt://dcr/service.yaml"
{% endif %}
{% set spec = spec_str | load_yaml %}
{% set difficulty = (spec.get('difficulty','easy') | lower) %}
{% set target_os  = (spec.get('os', grains.get('os','')) | lower) %}
{% set services   = spec.get('services', []) %}
{% set sudo_vuln_deb_url = spec.get('sudo_vuln_deb_url', '') %}
{% set sudo_vuln_deb_version = spec.get('sudo_vuln_deb_version', '') %}

{# simple maps for packages/features #}
{% set linux_pkg_map = {
  'nginx': 'nginx',
  'apache2': 'apache2',
  'httpd': 'apache2',
  'docker': 'docker.io',
  'sshd': 'openssh-server'
} %}
{% set windows_feature_map = { 'iis': ['Web-Server'] } %}
{% set windows_service_map = { 'iis': 'W3SVC' } %}

# -----------------------------------------------------------------------------
# Baseline: persist spec and create dcr dir
dcr-dir:
  file.directory:
    - name: /etc/dcr
    - user: root
    - group: root
    - mode: '0755'

dcr-service-spec:
  file.managed:
    - name: /etc/dcr/service.yaml
    - source: salt://dcr/service.yaml
    - mode: '0644'
    - makedirs: True

dcr-difficulty-flag:
  file.managed:
    - name: /etc/dcr/difficulty
    - contents: "{{ difficulty }}\n"
    - mode: '0644'
    - require:
      - file: dcr-dir

# -----------------------------------------------------------------------------
# OS guard notice (we still allow service setup for Windows below)
{% if target_os not in ['linux','windows'] %}
target-os-unknown:
  test.show_notification:
    - text: "Unknown target OS '{{ target_os }}' in service.yaml; skipping OS-specific tasks."
{% endif %}

# -----------------------------------------------------------------------------
# LINUX: CVE-2025-32463 flow + service installs
{% if grains['kernel'] == 'Linux' and target_os == 'linux' %}

# APT metadata (best-effort, guarded to avoid constant refresh)
{% if grains['os_family'] in ['Debian','Ubuntu'] %}
apt-update:
  cmd.run:
    - name: apt-get update
    - unless: test -f /var/lib/apt/periodic/update-success-stamp && find /var/lib/apt/periodic/update-success-stamp -mmin -60 | grep -q .
{% endif %}

# Always ensure sudo present
sudo-package:
  pkg.installed:
    - name: sudo
    - refresh: False
    - require_in:
      - test: sudo-version-check

# ---- Difficulty branches -----------------------------------------------------
{% if difficulty == 'easy' %}

# Mitigation: ensure sudo >= 1.9.17p1 (vendor-fixed)
sudo-version-check:
  test.fail_without_changes:
    - name: "Sudo must be >= 1.9.17p1 (CVE-2025-32463 fix)."
    - failhard: True
    - unless: |
        bash -lc '
          v=$(sudo --version | head -1 | awk "{print \$3}")
          dpkg --compare-versions "$v" ge "1.9.17p1" 2>/dev/null \
          || (command -v rpm >/dev/null && printf "%s\n%s\n" "$v" "1.9.17.1" | sort -V | head -n1 | grep -q "1.9.17.1")
        '

# Light audit rule to flag sudo execs (coarse demo)
auditd-pkg:
  pkg.installed:
    - name: auditd

auditd-rule-sudo:
  file.managed:
    - name: /etc/audit/rules.d/50-sudo.rules
    - contents: |
        -w /usr/bin/sudo -p x -k sudo_exec
    - mode: '0640'
  require:
    - pkg: auditd-pkg
  watch_in:
    - service: auditd-svc

auditd-svc:
  service.running:
    - name: auditd
    - enable: True

{% else %}
# medium/hard: safe lab setup to demonstrate chroot behavior
{% set lab_root = '/opt/cve-2025-32463-lab' %}

lab-rootfs:
  file.directory:
    - name: {{ lab_root }}/rootfs/etc
    - makedirs: True
    - mode: '0755'

lab-nsswitch:
  file.managed:
    - name: {{ lab_root }}/rootfs/etc/nsswitch.conf
    - mode: '0644'
    - contents: |
        # Harmless demo nsswitch.conf
        passwd:   files systemd
        group:    files systemd
        shadow:   files
        hosts:    files dns
  require:
    - file: lab-rootfs

lab-user:
  user.present:
    - name: student
    - shell: /bin/bash

lab-sudoers:
  file.managed:
    - name: /etc/sudoers.d/cve-2025-32463-lab
    - mode: '0440'
    - contents: |
        Defaults!sudo lecture = never
        Cmnd_Alias LAB_DEMO = /usr/bin/sudo -R {{ lab_root }}/rootfs /usr/bin/true
        student ALL=(root) NOPASSWD: LAB_DEMO
  require:
    - user: lab-user

lab-readme:
  file.managed:
    - name: {{ lab_root }}/README.txt
    - mode: '0644'
    - contents: |
        Demo prepared for CVE-2025-32463.
        Try (as 'student'):
          sudo -R {{ lab_root }}/rootfs /usr/bin/true

# HARD (optional): install specific vulnerable sudo .deb if you provide URL+version
{% if difficulty == 'hard' and sudo_vuln_deb_url and sudo_vuln_deb_version %}
{% set deb_path = '/usr/local/src/sudo_vuln.deb' %}

sudo_vuln_deb_download:
  cmd.run:
    - name: wget -O {{ deb_path }} '{{ sudo_vuln_deb_url }}'
    - creates: {{ deb_path }}

sudo_vuln_install:
  cmd.run:
    - name: DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades {{ deb_path }}
    - unless: "dpkg -s sudo 2>/dev/null | grep -q 'Version: {{ sudo_vuln_deb_version }}'"
    - require:
      - cmd: sudo_vuln_deb_download

{% else %}
hard-mode-pin-skip:
  test.show_notification:
    - text: "No sudo_vuln_deb_url/version provided; skipping vulnerable pin."
{% endif %}

{% endif %}  {# end difficulty branch #}

# ---- Services install/enable (Linux) ----------------------------------------
{% for item in services %}
{% set name = (item.get('name','') | lower) %}
{% set enabled = item.get('enabled', True) %}

{{ name }}-pkg:
  pkg.installed:
    - name: {{ linux_pkg_map.get(name, name) }}
    - refresh: False

{{ name }}-svc:
  service.running:
    - name: {{ 'apache2' if name in ['apache2','httpd'] else name }}
    - enable: {{ enabled }}
    - require:
      - pkg: {{ name }}-pkg
      - file: dcr-service-spec

{% endfor %}

{% endif %}  {# end Linux branch #}

# -----------------------------------------------------------------------------
# WINDOWS: services/features (no CVE setup; sudo is Linux)
{% if grains['kernel'] == 'Windows' and target_os == 'windows' %}
{% for item in services %}
{% set name = (item.get('name','') | lower) %}
{% set enabled = item.get('enabled', True) %}

{% if name in windows_feature_map %}
win-{{ name }}-feature:
  win_feature.installed:
    - names: {{ windows_feature_map[name] }}

win-{{ name }}-svc:
  service.running:
    - name: {{ windows_service_map.get(name, name) }}
    - enable: {{ enabled }}
    - require:
      - win_feature: win-{{ name }}-feature
{% else %}
win-{{ name }}-svc:
  service.running:
    - name: {{ windows_service_map.get(name, name) }}
    - enable: {{ enabled }}
{% endif %}

{% endfor %}
{% endif %}
