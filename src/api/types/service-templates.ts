import type { ConfigEntryType } from "./config-entries.js";

/** Where a service template's body lives. */
export enum ServiceTemplateSource {
  BUILTIN = "builtin",
  USER = "user",
  MATERIALIZED = "materialized",
}

/** One substitution accepted by a service template. */
export interface ServiceTemplateVariable {
  name: string;
  default: string | null;
  label: string | null;
  description: string | null;
  type: ConfigEntryType;
  options: string[];
  required: boolean;
}

/** One entry in the service-template catalog. */
export interface ServiceTemplate {
  id: string;
  title: string;
  source: ServiceTemplateSource;
  description: string | null;
  category: string | null;
  path: string | null;
  variables: ServiceTemplateVariable[];
  supported_platforms: string[];
  requires: string[];
  version: number;
  body_sha: string;
  modified: boolean;
  update_available: boolean;
}

export interface ServiceTemplateDetail {
  template: ServiceTemplate;
  body: string;
  manifest: string | null;
}

export interface ServiceTemplateUsage {
  configuration: string;
  package_key: string;
  template_id: string;
  vars: Record<string, string>;
}

export interface ApplyTemplateResponse {
  configuration: string;
  package_key: string;
  template_id: string;
  content: string;
  draft: boolean;
}

export interface RemoveTemplateResponse {
  configuration: string;
  package_key: string;
  content: string;
  draft: boolean;
}

export interface DeviceTemplateSelection {
  template_id: string;
  package_key?: string;
  vars?: Record<string, string>;
}

export interface ServiceTemplateEventData {
  template: ServiceTemplate;
}

export interface ServiceTemplateDeletedEventData {
  template_id: string;
}

export type ServiceTemplateAppliedEventData = ServiceTemplateUsage;

export interface ServiceTemplateRemovedEventData {
  configuration: string;
  package_key: string;
  template_id: string | null;
}
