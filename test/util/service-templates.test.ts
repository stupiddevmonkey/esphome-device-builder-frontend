import { describe, expect, it } from "vitest";
import { ConfigEntryType } from "../../src/api/types/config-entries.js";
import type {
  ServiceTemplate,
  ServiceTemplateVariable,
} from "../../src/api/types/service-templates.js";
import { ServiceTemplateSource } from "../../src/api/types/service-templates.js";
import {
  buildTemplateVars,
  missingRequiredTemplateVariables,
  SERVICE_TEMPLATE_ID_RE,
  variableAsConfigEntry,
} from "../../src/util/service-templates.js";

function variable(
  name: string,
  options: Partial<ServiceTemplateVariable> = {}
): ServiceTemplateVariable {
  return {
    name,
    default: null,
    label: null,
    description: null,
    type: ConfigEntryType.STRING,
    options: [],
    required: true,
    ...options,
  };
}

function template(variables: ServiceTemplateVariable[]): ServiceTemplate {
  return {
    id: "relay_switch",
    title: "Relay switch",
    source: ServiceTemplateSource.BUILTIN,
    description: null,
    category: null,
    path: null,
    variables,
    supported_platforms: [],
    requires: [],
    version: 1,
    body_sha: "sha",
    modified: false,
    update_available: false,
  };
}

describe("service-template form helpers", () => {
  it("adapts string options to ConfigValueOption objects", () => {
    expect(
      variableAsConfigEntry(
        variable("mode", {
          default: "auto",
          label: "Mode",
          options: ["auto", "manual"],
          required: false,
        })
      )
    ).toMatchObject({
      key: "mode",
      label: "Mode",
      default_value: "auto",
      options: [
        { label: "auto", value: "auto" },
        { label: "manual", value: "manual" },
      ],
    });
  });

  it("omits untouched defaults but keeps required and changed values", () => {
    const item = template([
      variable("relay_pin"),
      variable("restore_mode", {
        default: "ALWAYS_OFF",
        required: false,
      }),
      variable("name", { default: "Relay", required: false }),
    ]);

    expect(
      buildTemplateVars(item, {
        relay_pin: "GPIO4",
        restore_mode: "ALWAYS_ON",
        name: "Relay",
      })
    ).toEqual({
      relay_pin: "GPIO4",
      restore_mode: "ALWAYS_ON",
    });
  });

  it("gates blank required values", () => {
    const item = template([variable("relay_pin"), variable("relay_id")]);
    expect(
      missingRequiredTemplateVariables(item, {
        relay_pin: "GPIO4",
        relay_id: " ",
      })
    ).toEqual(["relay_id"]);
  });

  it("matches the backend template-id grammar", () => {
    expect(SERVICE_TEMPLATE_ID_RE.test("garage_door_2")).toBe(true);
    expect(SERVICE_TEMPLATE_ID_RE.test("2garage")).toBe(false);
    expect(SERVICE_TEMPLATE_ID_RE.test("garage-door")).toBe(false);
    expect(SERVICE_TEMPLATE_ID_RE.test(`${"a".repeat(64)}`)).toBe(true);
    expect(SERVICE_TEMPLATE_ID_RE.test(`${"a".repeat(65)}`)).toBe(false);
    expect(SERVICE_TEMPLATE_ID_RE.test("garage_")).toBe(false);
  });
});
