{# =========================
   Sudo misconfig scenario
   ========================= #}

# Grant vim sudo to ALL users (vulnerable misconfig)
all_users_vim_sudo:
  file.managed:
    - name: /etc/sudoers.d/vim-all-users
    - user: root
    - group: root
    - mode: '0440'
    - contents: |
        ALL ALL=(ALL) NOPASSWD: /usr/bin/vim
