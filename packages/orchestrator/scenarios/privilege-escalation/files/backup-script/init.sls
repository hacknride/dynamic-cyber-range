{# ==============================================================
   PrivEsc Scenario: World-writable root backup script via cron
   - Script looks like a real lightweight config backup
   - Very small storage footprint
   ============================================================== #}

maintenance_bin_dir:
  file.directory:
    - name: /usr/local/bin
    - user: root
    - group: root
    - mode: '0755'

maintenance_script:
  file.managed:
    - name: /usr/local/bin/daily-maintenance.sh
    - user: root
    - group: root
    - mode: '0777'        # <-- world-writable
    - contents: |
        #!/bin/bash
        #
        # Daily System Backup & Maintenance Script
        # ---------------------------------------
        # Backs up key system configuration files and does a very
        # lightweight health check. Intended for small, frequent
        # backups on a single host.

        LOGFILE="/var/log/daily-maintenance.log"
        BACKUP_DIR="/var/backups"
        DATESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

        mkdir -p "$BACKUP_DIR"

        # --- Simple log size cap (~100KB) to avoid growth ---
        if [ -f "$LOGFILE" ] && [ "$(stat -c%s "$LOGFILE" 2>/dev/null)" -gt 102400 ]; then
            mv "$LOGFILE" "$LOGFILE.old"
        fi

        echo "[$DATESTAMP] Starting daily maintenance..." >> "$LOGFILE"

        # --- 1. Tiny config backup (very small footprint) ---
        # Only back up a few critical config files, not entire directories.
        CONFIG_FILES="/etc/hostname /etc/hosts /etc/passwd /etc/group /etc/shadow"
        echo "[$DATESTAMP] Creating config backup archive..." >> "$LOGFILE"
        tar -czf "$BACKUP_DIR/system-config-backup.tgz" $CONFIG_FILES 2>>"$LOGFILE"

        # --- 2. Lightweight health check ---
        echo "[$DATESTAMP] Recording root filesystem usage..." >> "$LOGFILE"
        df -h / >> "$LOGFILE" 2>&1

        echo "[$DATESTAMP] Maintenance complete." >> "$LOGFILE"
    - require:
      - file: maintenance_bin_dir

maintenance_cron:
  cron.present:
    - name: "/usr/local/bin/daily-maintenance.sh"
    - user: root
    - minute: "*/1"        # runs every minute
    - require:
      - file: maintenance_script

