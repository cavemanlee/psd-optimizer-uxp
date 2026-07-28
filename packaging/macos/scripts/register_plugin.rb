#!/usr/bin/ruby

require "json"

registry_path, plugin_id, plugin_name, plugin_version, host_min_version, plugin_path = ARGV

unless registry_path && plugin_id && plugin_name && plugin_version && host_min_version && plugin_path
  warn "PSD Optimizer: incomplete plugin registry arguments."
  exit 2
end

registry =
  if File.exist?(registry_path)
    JSON.parse(File.read(registry_path, encoding: "UTF-8"))
  else
    { "plugins" => [] }
  end

unless registry.is_a?(Hash)
  warn "PSD Optimizer: Adobe plugin registry is not a JSON object."
  exit 3
end

plugins = registry["plugins"]
plugins = [] unless plugins.is_a?(Array)
plugins.reject! do |plugin|
  next false unless plugin.is_a?(Hash)

  plugin["pluginId"] == plugin_id
end

plugins << {
  "hostMinVersion" => host_min_version,
  "name" => plugin_name,
  "path" => plugin_path,
  "pluginId" => plugin_id,
  "status" => "enabled",
  "type" => "uxp",
  "versionString" => plugin_version,
}

registry["plugins"] = plugins
temporary_path = "#{registry_path}.tmp.#{$$}"

begin
  File.open(temporary_path, "w", 0o644) do |file|
    file.write(JSON.pretty_generate(registry))
    file.write("\n")
    file.flush
    file.fsync
  end
  File.rename(temporary_path, registry_path)
rescue StandardError => error
  File.delete(temporary_path) if File.exist?(temporary_path)
  warn "PSD Optimizer: could not update Adobe plugin registry: #{error}"
  exit 4
end
