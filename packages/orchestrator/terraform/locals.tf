locals {
  # turns [ {name="a"}, {name="b"} ] into a map keyed by name, with an index
  machines_map = {
    for idx, m in var.machines :
    m.name => {
      name = m.name
      idx  = idx + 1
    }
  }
}
