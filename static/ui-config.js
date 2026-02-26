// static/ui-config.js — Clean UI configuration object
(function () {
  window.UI_CONFIG = {
    controlNode: "FRA301",
    controlIP: "10.3.3.10",
    playbookRoot: "/var/lib/rundeck/projects/ansible",
    defaultInventory: "target_hosts",
    version: "2.0.0",
    workflows: {
      configbuild: "Config Build (ConfigMain.yaml)",
      postprov: "Post Provisioning",
      quickqc: "Quick QC",
    },
  };
})();
