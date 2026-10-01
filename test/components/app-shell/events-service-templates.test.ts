import { describe, expect, it } from "vitest";
import {
  DeviceEventType,
  type InitialStateEventData,
} from "../../../src/api/types/event-subscription.js";
import {
  type ServiceTemplate,
  ServiceTemplateSource,
} from "../../../src/api/types/service-templates.js";
import type { ESPHomeApp } from "../../../src/components/app-shell.js";
import { handleEvent } from "../../../src/components/app-shell/events.js";

function template(id: string, title = id): ServiceTemplate {
  return {
    id,
    title,
    source: ServiceTemplateSource.BUILTIN,
    description: null,
    category: null,
    path: null,
    variables: [],
    supported_platforms: [],
    requires: [],
    version: 1,
    body_sha: "sha",
    modified: false,
    update_available: false,
  };
}

type Host = Pick<
  ESPHomeApp,
  "_serviceTemplates" | "_serviceTemplateUsages" | "_serviceTemplateUsageRevision"
> & {
  [key: string]: unknown;
};

function host(): Host {
  return {
    _serviceTemplates: null,
    _serviceTemplateUsages: [],
    _serviceTemplateUsageRevision: 0,
    _prefsLoaded: false,
    _prefsWritesInFlight: 0,
    _devices: [],
    _importableDevices: [],
    _devicesLoaded: false,
    _buildServerPeers: null,
    _buildOffloadDiscoveredHosts: null,
    _buildOffloadPairings: null,
    _buildOffloadAlerts: null,
    _buildOffloadJobs: new Map(),
    _offloaderWritesInFlight: 0,
    _remoteBuildSetInFlight: false,
    _offloaderRemoteBuildsEnabled: null,
    _offloaderVersionMatchPolicy: null,
    _offloaderIncludeLocalInPool: null,
  };
}

function dispatch(target: Host, event: DeviceEventType, data: unknown): void {
  handleEvent(target as unknown as ESPHomeApp, event, data);
}

describe("service-template subscription events", () => {
  it("seeds the catalog with absent-vs-empty semantics", () => {
    const target = host();
    dispatch(target, DeviceEventType.INITIAL_STATE, {
      devices: [],
      importable: [],
      service_templates: [template("relay")],
    } as unknown as InitialStateEventData);
    expect(target._serviceTemplates?.get("relay")?.id).toBe("relay");

    const absent = host();
    dispatch(absent, DeviceEventType.INITIAL_STATE, {
      devices: [],
      importable: [],
    } as unknown as InitialStateEventData);
    expect(absent._serviceTemplates).toBeNull();
  });

  it("upserts created and updated rows, including an existing id", () => {
    const target = host();
    target._serviceTemplates = new Map([["relay", template("relay", "Old")]]);

    dispatch(target, DeviceEventType.SERVICE_TEMPLATE_CREATED, {
      template: template("relay", "Created"),
    });
    dispatch(target, DeviceEventType.SERVICE_TEMPLATE_UPDATED, {
      template: template("relay", "Updated"),
    });

    expect(target._serviceTemplates.size).toBe(1);
    expect(target._serviceTemplates.get("relay")?.title).toBe("Updated");
  });

  it("deletes catalog rows", () => {
    const target = host();
    target._serviceTemplates = new Map([["relay", template("relay")]]);
    dispatch(target, DeviceEventType.SERVICE_TEMPLATE_DELETED, {
      template_id: "relay",
    });
    expect(target._serviceTemplates.size).toBe(0);
  });

  it("upserts and removes usages while advancing the refresh revision", () => {
    const target = host();
    target._serviceTemplateUsages = [
      {
        configuration: "garage.yaml",
        package_key: "relay",
        template_id: "relay",
        vars: { pin: "GPIO1" },
      },
    ];

    dispatch(target, DeviceEventType.SERVICE_TEMPLATE_APPLIED, {
      configuration: "garage.yaml",
      package_key: "relay",
      template_id: "relay",
      vars: { pin: "GPIO2" },
    });
    expect(target._serviceTemplateUsages).toEqual([
      {
        configuration: "garage.yaml",
        package_key: "relay",
        template_id: "relay",
        vars: { pin: "GPIO2" },
      },
    ]);

    dispatch(target, DeviceEventType.SERVICE_TEMPLATE_REMOVED, {
      configuration: "garage.yaml",
      package_key: "relay",
      template_id: "relay",
    });
    expect(target._serviceTemplateUsages).toEqual([]);
    expect(target._serviceTemplateUsageRevision).toBe(2);
  });
});
