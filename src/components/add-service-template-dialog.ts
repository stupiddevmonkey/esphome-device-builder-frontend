import { consume } from "@lit/context";
import { mdiArrowLeft, mdiMagnify, mdiPuzzleOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { BoardCatalogEntry } from "../api/types/boards.js";
import type {
  ServiceTemplate,
  ServiceTemplateUsage,
} from "../api/types/service-templates.js";
import type { LocalizeFunc } from "../common/localize.js";
import {
  apiContext,
  localizeContext,
  serviceTemplatesContext,
  serviceTemplateUsagesContext,
} from "../context/index.js";
import { inputStyles } from "../styles/inputs.js";
import { espHomeStyles } from "../styles/shared.js";
import { formatApiError } from "../util/format-api-error.js";
import { notifyError, notifySuccess } from "../util/notify.js";
import { registerMdiIcons } from "../util/register-icons.js";
import {
  buildTemplateVars,
  initialTemplateValues,
  missingRequiredTemplateVariables,
  templateVariableEntries,
} from "../util/service-templates.js";
import type { ConfigEntryValueChange } from "./device/config-entry-form.js";
import { fireSectionEvent } from "./device/section-editor.js";

import "@home-assistant/webawesome/dist/components/badge/badge.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "./base-dialog.js";
import "./device/config-entry-form.js";

registerMdiIcons({
  "arrow-left": mdiArrowLeft,
  magnify: mdiMagnify,
  "puzzle-outline": mdiPuzzleOutline,
});

@customElement("esphome-add-service-template-dialog")
export class ESPHomeAddServiceTemplateDialog extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @consume({ context: serviceTemplatesContext, subscribe: true })
  @state()
  private _templates: Map<string, ServiceTemplate> | null = null;

  @consume({ context: serviceTemplateUsagesContext, subscribe: true })
  @state()
  private _usages: ServiceTemplateUsage[] | null = null;

  @property() configuration = "";
  @property() platform = "";
  @property() yaml = "";
  @property({ attribute: false }) board: BoardCatalogEntry | null = null;

  @state() private _open = false;
  @state() private _selected: ServiceTemplate | null = null;
  @state() private _usage: ServiceTemplateUsage | null = null;
  @state() private _query = "";
  @state() private _values: Record<string, unknown> = {};
  @state() private _submitting = false;
  @state() private _error = "";

  static styles = [
    espHomeStyles,
    inputStyles,
    css`
      esphome-base-dialog {
        --width: min(680px, 95vw);
      }
      .search {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: var(--wa-space-m);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-xs);
        max-height: 55vh;
        overflow-y: auto;
      }
      .template {
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-default);
        border-radius: var(--wa-border-radius-m);
        padding: var(--wa-space-m);
        text-align: left;
        color: inherit;
        cursor: pointer;
      }
      .template:hover {
        border-color: var(--esphome-primary);
      }
      .template-title,
      .form-heading {
        font-weight: var(--wa-font-weight-bold);
      }
      .template-meta,
      .advisory,
      .empty {
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-s);
      }
      .badges {
        display: flex;
        gap: var(--wa-space-xs);
        flex-wrap: wrap;
        margin-top: var(--wa-space-xs);
      }
      .form-header {
        display: flex;
        align-items: center;
        gap: var(--wa-space-s);
        margin-bottom: var(--wa-space-m);
      }
      .icon-button {
        border: 0;
        background: transparent;
        color: var(--esphome-primary);
        cursor: pointer;
      }
      .error {
        color: var(--esphome-error);
        font-size: var(--wa-font-size-s);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--wa-space-s);
        margin-top: var(--wa-space-l);
      }
    `,
  ];

  open(usage?: ServiceTemplateUsage): void {
    this._usage = usage ?? null;
    this._selected = usage ? (this._templates?.get(usage.template_id) ?? null) : null;
    this._values = this._selected
      ? initialTemplateValues(this._selected, usage?.vars)
      : {};
    this._query = "";
    this._error = "";
    this._open = true;
  }

  protected render() {
    if (!this._open) return nothing;
    return html`
      <esphome-base-dialog
        ?open=${this._open}
        ?busy=${this._submitting}
        .label=${this._localize(
          this._usage
            ? "service_templates.reconfigure_title"
            : "service_templates.add_title"
        )}
        @request-close=${() => {
          this._open = false;
        }}
        @after-hide=${() => {
          this._open = false;
        }}
      >
        ${this._selected ? this._renderForm(this._selected) : this._renderPicker()}
      </esphome-base-dialog>
    `;
  }

  private _renderPicker() {
    if (this._templates === null) {
      return html`<wa-spinner></wa-spinner>`;
    }
    const query = this._query.trim().toLocaleLowerCase();
    const templates = [...this._templates.values()]
      .filter((template) =>
        query
          ? `${template.title} ${template.description ?? ""} ${template.category ?? ""}`
              .toLocaleLowerCase()
              .includes(query)
          : true
      )
      .sort((a, b) => {
        const compatibleA = this._supportsPlatform(a) ? 0 : 1;
        const compatibleB = this._supportsPlatform(b) ? 0 : 1;
        return compatibleA - compatibleB || a.title.localeCompare(b.title);
      });
    return html`
      <input
        class="search"
        type="search"
        .value=${this._query}
        placeholder=${this._localize("service_templates.search")}
        @input=${(event: Event) => {
          this._query = (event.currentTarget as HTMLInputElement).value;
        }}
      />
      <div class="list">
        ${
          templates.length === 0
            ? html`<p class="empty" role="status">
                ${this._localize("service_templates.no_matches")}
              </p>`
            : templates.map((template) => this._renderTemplate(template))
        }
      </div>
    `;
  }

  private _renderTemplate(template: ServiceTemplate) {
    const compatible = this._supportsPlatform(template);
    return html`
      <button class="template" type="button" @click=${() => this._select(template)}>
        <div class="template-title">${template.title}</div>
        ${
          template.description
            ? html`<div class="template-meta">${template.description}</div>`
            : nothing
        }
        <div class="badges">
          <wa-badge pill
            >${this._localize(`service_templates.source.${template.source}`)}</wa-badge
          >
          ${
            template.category
              ? html`<wa-badge pill>${template.category}</wa-badge>`
              : nothing
          }
          ${
            compatible
              ? nothing
              : html`<wa-badge variant="warning" pill>
                  ${this._localize("service_templates.platform_advisory")}
                </wa-badge>`
          }
        </div>
      </button>
    `;
  }

  private _renderForm(template: ServiceTemplate) {
    const missing = missingRequiredTemplateVariables(template, this._values);
    const repeat = !this._usage && this._isRepeat(template.id);
    const hasIdVariable = template.variables.some((variable) => variable.type === "id");
    return html`
      <div class="form-header">
        ${
          this._usage
            ? nothing
            : html`<button
                class="icon-button"
                type="button"
                aria-label=${this._localize("layout.back")}
                @click=${() => {
                  this._selected = null;
                  this._error = "";
                }}
              >
                <wa-icon library="mdi" name="arrow-left"></wa-icon>
              </button>`
        }
        <div>
          <div class="form-heading">${template.title}</div>
          ${
            template.description
              ? html`<div class="template-meta">${template.description}</div>`
              : nothing
          }
        </div>
      </div>
      ${
        template.requires.length
          ? html`<p class="advisory">
              ${this._localize("service_templates.requires", {
                components: template.requires.join(", "),
              })}
            </p>`
          : nothing
      }
      ${
        repeat && hasIdVariable
          ? html`<p class="advisory" role="status">
              ${this._localize("service_templates.repeat_id_nudge")}
            </p>`
          : nothing
      }
      ${
        template.variables.length
          ? html`<esphome-config-entry-form
              .entries=${templateVariableEntries(template)}
              .values=${this._values}
              .board=${this.board}
              .configuration=${this.configuration}
              .sectionKey=${`service:${template.id}`}
              @value-change=${this._onValueChange}
            ></esphome-config-entry-form>`
          : html`<p class="empty">${this._localize("service_templates.no_variables")}</p>`
      }
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <div class="actions">
        <button type="button" ?disabled=${this._submitting} @click=${this._close}>
          ${this._localize("layout.cancel")}
        </button>
        <button
          class="primary"
          type="button"
          ?disabled=${this._submitting || missing.length > 0}
          @click=${this._apply}
        >
          ${this._localize(
            this._usage ? "service_templates.reconfigure" : "service_templates.add"
          )}
        </button>
      </div>
    `;
  }

  private _supportsPlatform(template: ServiceTemplate): boolean {
    return (
      template.supported_platforms.length === 0 ||
      !this.platform ||
      template.supported_platforms.includes(this.platform)
    );
  }

  private _isRepeat(templateId: string): boolean {
    return (
      this._usages?.some(
        (usage) =>
          usage.configuration === this.configuration && usage.template_id === templateId
      ) ?? false
    );
  }

  private _select(template: ServiceTemplate): void {
    this._selected = template;
    this._values = initialTemplateValues(template);
    this._error = "";
  }

  private _onValueChange = (event: CustomEvent<ConfigEntryValueChange>): void => {
    const [key] = event.detail.path;
    if (!key) return;
    this._values = { ...this._values, [key]: event.detail.value };
    this._error = "";
  };

  private _apply = async (): Promise<void> => {
    const template = this._selected;
    if (!template || this._submitting) return;
    if (missingRequiredTemplateVariables(template, this._values).length > 0) return;
    const basedOn = this.yaml;
    this._submitting = true;
    this._error = "";
    try {
      const result = await this._api.applyServiceTemplate({
        configuration: this.configuration,
        template_id: template.id,
        ...(this._usage ? { package_key: this._usage.package_key } : {}),
        vars: buildTemplateVars(template, this._values),
        yaml: basedOn,
      });
      fireSectionEvent(this, "yaml-draft", {
        configuration: this.configuration,
        yaml: result.content,
        basedOn,
        node: this,
      });
      this.dispatchEvent(
        new CustomEvent("service-template-applied", {
          detail: {
            packageKey: result.package_key,
            templateId: result.template_id,
          },
          bubbles: true,
          composed: true,
        })
      );
      notifySuccess(
        this._localize(
          this._usage
            ? "service_templates.reconfigured_success"
            : "service_templates.added_success",
          { name: template.title }
        )
      );
      this._close();
    } catch (err) {
      this._error = formatApiError(err, this._localize, "service_templates.apply_error");
      notifyError(this._error);
    } finally {
      this._submitting = false;
    }
  };

  private _close = (): void => {
    this._open = false;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-add-service-template-dialog": ESPHomeAddServiceTemplateDialog;
  }
}
