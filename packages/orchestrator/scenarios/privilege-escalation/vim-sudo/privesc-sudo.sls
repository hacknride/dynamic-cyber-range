{# =========================
   Sudo misconfig scenario
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

alice_sudoers:
  file.managed:
    - name: /etc/sudoers.d/alice
    - user: root
    - group: root
    - mode: '0440'
    - contents: |
        alice ALL=(ALL) NOPASSWD: /usr/bin/vim
    - require:
      - user: alice

