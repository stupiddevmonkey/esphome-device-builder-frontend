import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { ServiceTemplate } from "../api/types/service-templates.js";
import { ServiceTemplateSource } from "../api/types/service-templates.js";
import type { LocalizeFunc } from "../common/localize.js";
import { apiContext, localizeContext } from "../context/index.js";
import { inputStyles } from "../styles/inputs.js";
import { espHomeStyles } from "../styles/shared.js";
import { formatApiError } from "../util/format-api-error.js";
import { notifyError, notifySuccess } from "../util/notify.js";
import { SERVICE_TEMPLATE_ID_RE } from "../util/service-templates.js";

import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "./base-dialog.js";
import "./yaml-editor.js";

@customElement("esphome-service-template-editor-dialog")
export class ESPHomeServiceTemplateEditorDialog extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @state() private _open = false;
  @state() private _template: ServiceTemplate | null = null;
  @state() private _templateId = "";
  @state() private _body = "";
  @state() private _manifest = "";
  @state() private _loading = false;
  @state() private _submitting = false;
  @state() private _error = "";

  static styles = [
    espHomeStyles,
    inputStyles,
    css`
      esphome-base-dialog {
        --width: min(900px, 96vw);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-xs);
        margin-bottom: var(--wa-space-m);
      }
      input {
        width: 100%;
        box-sizing: border-box;
      }
      .editors {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: var(--wa-space-m);
      }
      .editor {
        min-height: 320px;
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        border-radius: var(--wa-border-radius-m);
        overflow: hidden;
      }
      esphome-yaml-editor {
        display: block;
        height: 320px;
      }
      .help,
      .warning {
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-s);
      }
      .warning {
        color: var(--wa-color-warning-on-quiet);
      }
      .error {
        color: var(--esphome-error);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--wa-space-s);
        margin-top: var(--wa-space-l);
      }
      @media (max-width: 750px) {
        .editors {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];

  open(template?: ServiceTemplate): void {
    this._template = template ?? null;
    this._templateId = template?.id ?? "";
    this._body = "";
    this._manifest = "";
    this._error = "";
    this._open = true;
    if (template) void this._load(template.id);
  }

  protected render() {
    const editing = this._template !== null;
    const validId = SERVICE_TEMPLATE_ID_RE.test(this._templateId);
    return html`
      <esphome-base-dialog
        ?open=${this._open}
        ?busy=${this._loading || this._submitting}
        .label=${this._localize(
          editing
            ? "service_templates.edit_template"
            : "service_templates.create_template"
        )}
        @request-close=${this._close}
        @after-hide=${this._close}
      >
        ${
          this._loading
            ? html`<wa-spinner></wa-spinner>`
            : html`
                <label class="field">
                  <span>${this._localize("service_templates.template_id")}</span>
                  <input
                    .value=${this._templateId}
                    ?disabled=${editing}
                    @input=${(event: Event) => {
                      this._templateId = (event.currentTarget as HTMLInputElement).value;
                    }}
                  />
                  <span class="help">${this._localize("service_templates.id_help")}</span>
                </label>
                ${
                  this._template?.source === ServiceTemplateSource.BUILTIN
                    ? html`<p class="warning" role="status">
                        ${this._localize("service_templates.edit_builtin_warning")}
                      </p>`
                    : nothing
                }
                <div class="editors">
                  <label class="field">
                    <span>${this._localize("service_templates.body")}</span>
                    <div class="editor">
                      <esphome-yaml-editor
                        class="body-editor"
                        .value=${this._body}
                        @yaml-change=${(event: CustomEvent<{ value: string }>) => {
                          this._body = event.detail.value;
                        }}
                      ></esphome-yaml-editor>
                    </div>
                  </label>
                  <label class="field">
                    <span>${this._localize("service_templates.manifest")}</span>
                    <div class="editor">
                      <esphome-yaml-editor
                        .value=${this._manifest}
                        @yaml-change=${(event: CustomEvent<{ value: string }>) => {
                          this._manifest = event.detail.value;
                        }}
                      ></esphome-yaml-editor>
                    </div>
                  </label>
                </div>
                ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
                <div class="actions">
                  <button type="button" @click=${this._close}>
                    ${this._localize("layout.cancel")}
                  </button>
                  <button
                    class="primary"
                    type="button"
                    ?disabled=${this._submitting || !validId || !this._body.trim()}
                    @click=${this._save}
                  >
                    ${this._localize("layout.save")}
                  </button>
                </div>
              `
        }
      </esphome-base-dialog>
    `;
  }

  private async _load(templateId: string): Promise<void> {
    this._loading = true;
    try {
      const detail = await this._api.getServiceTemplate(templateId);
      if (!this._open || this._template?.id !== templateId) return;
      this._body = detail.body;
      this._manifest = detail.manifest ?? "";
    } catch (err) {
      this._error = formatApiError(err, this._localize, "service_templates.load_error");
      notifyError(this._error);
    } finally {
      this._loading = false;
    }
  }

  private _save = async (): Promise<void> => {
    if (
      this._submitting ||
      !SERVICE_TEMPLATE_ID_RE.test(this._templateId) ||
      !this._body.trim()
    ) {
      return;
    }
    this._submitting = true;
    this._error = "";
    try {
      const template = this._template
        ? await this._api.updateServiceTemplate({
            template_id: this._templateId,
            body: this._body,
            manifest: this._manifest.trim() ? this._manifest : null,
          })
        : await this._api.createServiceTemplate({
            template_id: this._templateId,
            body: this._body,
            ...(this._manifest.trim() ? { manifest: this._manifest } : {}),
          });
      notifySuccess(
        this._localize(
          this._template
            ? "service_templates.updated_success"
            : "service_templates.created_success",
          { name: template.title }
        )
      );
      this._close();
    } catch (err) {
      this._error = formatApiError(err, this._localize, "service_templates.save_error");
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
    "esphome-service-template-editor-dialog": ESPHomeServiceTemplateEditorDialog;
  }
}
