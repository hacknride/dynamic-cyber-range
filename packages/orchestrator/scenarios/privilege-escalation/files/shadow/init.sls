{# ==============================================================
   PrivEsc Scenario: Group-writable /etc/shadow + shadow-group abuse
   
   For this state, if the user is currently logged in when the state
   is ran, the new group membership won't show up until they log in
   again. Don't think this matters in our use case but it is good
   to know about
   ============================================================== #}


# 1) Make sure the 'shadow' group exists (or create it if missing)
shadow_group_present:
  group.present:
    - name: shadow

# 2) Make /etc/shadow owned by root:shadow and group-writable
shadow_group_writable_shadow:
  file.managed:
    - name: /etc/shadow
    - user: root
    - group: shadow
    - mode: '0660'          # -rw-rw---- root:shadow
    - replace: False        
    - require:
      - group: shadow_group_present

# 3) Add all non-system users (uid >= 1000) to the 'shadow' group
add_all_normal_users_to_shadow:
  cmd.run:
    - name: |
        awk -F: '$3 >= 1000 && $1 != "nobody" {print $1}' /etc/passwd | while read u; do
          # only add if not already in the group
          if ! id -nG "$u" | tr ' ' '\n' | grep -qx shadow; then
            usermod -aG shadow "$u"
          fi
        done
    - runas: root
    - require:
      - group: shadow_group_present
      - file: shadow_group_writable_shadow
