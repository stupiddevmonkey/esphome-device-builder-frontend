import { consume } from "@lit/context";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { BoardCatalogEntry } from "../../api/types/boards.js";
import type {
  DeviceTemplateSelection,
  ServiceTemplate,
} from "../../api/types/service-templates.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext, serviceTemplatesContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import {
  buildTemplateVars,
  initialTemplateValues,
  missingRequiredTemplateVariables,
  templateVariableEntries,
} from "../../util/service-templates.js";
import type { ConfigEntryValueChange } from "../device/config-entry-form.js";

import "@home-assistant/webawesome/dist/components/checkbox/checkbox.js";
import "../device/config-entry-form.js";

@customElement("esphome-wizard-step-services")
export class ESPHomeWizardStepServices extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: serviceTemplatesContext, subscribe: true })
  @state()
  private _templates: Map<string, ServiceTemplate> | null = null;

  @property({ attribute: false }) board: BoardCatalogEntry | null = null;

  @property({ type: Number }) session = 0;

  @state()
  private _values = new Map<string, Record<string, unknown>>();

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
      }
      :host([hidden]) {
        display: none;
      }
      .intro,
      .meta,
      .empty {
        margin: 0;
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-s);
      }
      .template {
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        border-radius: var(--wa-border-radius-m);
        padding: var(--wa-space-m);
      }
      .title {
        font-weight: var(--wa-font-weight-bold);
      }
      esphome-config-entry-form {
        display: block;
        margin-top: var(--wa-space-m);
      }
    `,
  ];

  get canSubmit(): boolean {
    for (const [id, values] of this._values) {
      const template = this._templates?.get(id);
      if (template && missingRequiredTemplateVariables(template, values).length > 0) {
        return false;
      }
    }
    return true;
  }

  get selections(): DeviceTemplateSelection[] {
    const selections: DeviceTemplateSelection[] = [];
    for (const [id, values] of this._values) {
      const template = this._templates?.get(id);
      if (!template) continue;
      const vars = buildTemplateVars(template, values);
      selections.push({
        template_id: id,
        ...(Object.keys(vars).length ? { vars } : {}),
      });
    }
    return selections;
  }

  get hasTemplates(): boolean {
    return this._availableTemplates.length > 0;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("session")) this._values = new Map();
  }

  protected render() {
    const templates = this._availableTemplates;
    return html`
      <div>
        <h3>${this._localize("wizard.services_title")}</h3>
        <p class="intro">${this._localize("wizard.services_desc")}</p>
      </div>
      ${
        templates.length === 0
          ? html`<p class="empty" role="status">
              ${this._localize("wizard.services_empty")}
            </p>`
          : templates.map((template) => this._renderTemplate(template))
      }
    `;
  }

  private get _availableTemplates(): ServiceTemplate[] {
    const platform = this.board?.esphome?.platform;
    return [...(this._templates?.values() ?? [])]
      .filter(
        (template) =>
          template.supported_platforms.length === 0 ||
          !platform ||
          template.supported_platforms.includes(platform)
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  private _renderTemplate(template: ServiceTemplate) {
    const values = this._values.get(template.id);
    return html`
      <div class="template">
        <wa-checkbox
          ?checked=${values !== undefined}
          @change=${(event: Event) =>
            this._toggle(
              template,
              (event.currentTarget as HTMLElement & { checked: boolean }).checked
            )}
          ><span class="title">${template.title}</span></wa-checkbox
        >
        ${
          template.description
            ? html`<p class="meta">${template.description}</p>`
            : nothing
        }
        ${
          values && template.variables.length
            ? html`<esphome-config-entry-form
                .entries=${templateVariableEntries(template)}
                .values=${values}
                .board=${this.board}
                .sectionKey=${`service:${template.id}`}
                @value-change=${(event: CustomEvent<ConfigEntryValueChange>) =>
                  this._onValueChange(template.id, event)}
              ></esphome-config-entry-form>`
            : nothing
        }
      </div>
    `;
  }

  private _toggle(template: ServiceTemplate, checked: boolean): void {
    const next = new Map(this._values);
    if (checked) next.set(template.id, initialTemplateValues(template));
    else next.delete(template.id);
    this._values = next;
    this.dispatchEvent(new Event("services-change", { bubbles: true }));
  }

  private _onValueChange(
    templateId: string,
    event: CustomEvent<ConfigEntryValueChange>
  ): void {
    const [key] = event.detail.path;
    const values = this._values.get(templateId);
    if (!key || !values) return;
    const next = new Map(this._values);
    next.set(templateId, { ...values, [key]: event.detail.value });
    this._values = next;
    this.dispatchEvent(new Event("services-change", { bubbles: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-wizard-step-services": ESPHomeWizardStepServices;
  }
}
