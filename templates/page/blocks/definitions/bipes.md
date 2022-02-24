# BIPES
<category name="BIPES">

# project_metadata
<block type="project_metadata">
  <field name="NAME">Project INFO</field>
  <value name="project_author">
    <shadow type="text">
      <field name="TEXT"></field>
    </shadow>
  </value>
  <value name="project_iot_id">
    <shadow type="math_number">
      <field name="NUM"></field>
    </shadow>
  </value>
  <value name="project_description">
    <shadow type="text">
      <field name="TEXT"></field>
    </shadow>
  </value>
</block>

# bipes_plot
<block type="bipes_plot">
  <field name="NAME">Plot</field>
  <value name="values">
    <shadow type="text">
      <field name="TEXT"></field>
    </shadow>
  </value>
</block>

# localstorage_store
<block type="localstorage_store">
  <value name="ADD0">
    <shadow type="utime.vars">
      <field name="VARS">ticks_ms</field>
    </shadow>
  </value>
</block>

# -