import type { ConfigEntry } from "../api/types/config-entries.js";
import type {
  ServiceTemplate,
  ServiceTemplateVariable,
} from "../api/types/service-templates.js";

export const SERVICE_TEMPLATE_ID_RE = /^[a-z](?:[a-z0-9_]{0,62}[a-z0-9])?$/;

export const SERVICE_TEMPLATE_DEVICE_BLOCKS = new Set([
  "api",
  "esphome",
  "esp32",
  "esp8266",
  "ethernet",
  "bk72xx",
  "ln882x",
  "rtl87xx",
  "nrf52",
  "rp2",
  "rp2040",
  "host",
  "libretiny",
  "ota",
  "packages",
  "substitutions",
  "wifi",
]);

export function variableAsConfigEntry(variable: ServiceTemplateVariable): ConfigEntry {
  return {
    key: variable.name,
    type: variable.type,
    label: variable.label ?? variable.name,
    description: variable.description,
    required: variable.required,
    default_value: variable.default,
    options:
      variable.options.length > 0
        ? variable.options.map((value) => ({ label: value, value }))
        : null,
  };
}

export function templateVariableEntries(template: ServiceTemplate): ConfigEntry[] {
  return template.variables.map(variableAsConfigEntry);
}

export function initialTemplateValues(
  template: ServiceTemplate,
  overrides: Record<string, string> = {}
): Record<string, unknown> {
  return Object.fromEntries(
    template.variables.flatMap((variable) => {
      const value = overrides[variable.name] ?? variable.default;
      return value === null ? [] : [[variable.name, value]];
    })
  );
}

export function missingRequiredTemplateVariables(
  template: ServiceTemplate,
  values: Record<string, unknown>
): string[] {
  return template.variables
    .filter((variable) => {
      if (!variable.required) return false;
      const value = values[variable.name];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((variable) => variable.name);
}

export function buildTemplateVars(
  template: ServiceTemplate,
  values: Record<string, unknown>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const variable of template.variables) {
    const value = values[variable.name];
    if (value === undefined || value === null) continue;
    const rendered = String(value);
    if (variable.required || rendered !== variable.default) {
      vars[variable.name] = rendered;
    }
  }
  return vars;
}
