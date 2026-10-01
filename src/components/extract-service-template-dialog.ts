import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { LocalizeFunc } from "../common/localize.js";
import { apiContext, localizeContext } from "../context/index.js";
import { inputStyles } from "../styles/inputs.js";
import { espHomeStyles } from "../styles/shared.js";
import { formatApiError } from "../util/format-api-error.js";
import { notifyError, notifySuccess } from "../util/notify.js";
import {
  SERVICE_TEMPLATE_DEVICE_BLOCKS,
  SERVICE_TEMPLATE_ID_RE,
} from "../util/service-templates.js";
import { parseYamlTopLevelSections } from "../util/yaml-sections.js";

import "@home-assistant/webawesome/dist/components/checkbox/checkbox.js";
import "./base-dialog.js";

@customElement("esphome-extract-service-template-dialog")
export class ESPHomeExtractServiceTemplateDialog extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @property() configuration = "";
  @property() yaml = "";

  @state() private _open = false;
  @state() private _templateId = "";
  @state() private _manifest = "";
  @state() private _selected = new Set<string>();
  @state() private _overwrite = false;
  @state() private _submitting = false;
  @state() private _error = "";

  static styles = [
    espHomeStyles,
    inputStyles,
    css`
      esphome-base-dialog {
        --width: min(620px, 95vw);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-xs);
        margin-bottom: var(--wa-space-m);
      }
      input,
      textarea {
        width: 100%;
        box-sizing: border-box;
      }
      textarea {
        min-height: 110px;
        font-family: var(--wa-font-family-mono);
      }
      .blocks {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--wa-space-xs);
      }
      .help {
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-xs);
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
    `,
  ];

  open(): void {
    this._templateId = "";
    this._manifest = "";
    this._selected = new Set();
    this._overwrite = false;
    this._error = "";
    this._open = true;
  }

  protected render() {
    if (!this._open) return nothing;
    const blocks = [
      ...new Set(
        parseYamlTopLevelSections(this.yaml)
          .map((section) => section.key)
          .filter((key) => !SERVICE_TEMPLATE_DEVICE_BLOCKS.has(key))
      ),
    ];
    const validId = SERVICE_TEMPLATE_ID_RE.test(this._templateId);
    return html`
      <esphome-base-dialog
        ?open=${this._open}
        ?busy=${this._submitting}
        .label=${this._localize("service_templates.extract_title")}
        @request-close=${this._close}
        @after-hide=${this._close}
      >
        <p class="help">${this._localize("service_templates.extract_saved_note")}</p>
        <label class="field">
          <span>${this._localize("service_templates.template_id")}</span>
          <input
            .value=${this._templateId}
            @input=${(event: Event) => {
              this._templateId = (event.currentTarget as HTMLInputElement).value;
              this._error = "";
            }}
          />
          <span class="help">${this._localize("service_templates.id_help")}</span>
        </label>
        <div class="field">
          <span>${this._localize("service_templates.blocks")}</span>
          <div class="blocks">
            ${
              blocks.length
                ? blocks.map(
                    (block) =>
                      html`<wa-checkbox
                        ?checked=${this._selected.has(block)}
                        @change=${(event: Event) =>
                          this._toggleBlock(
                            block,
                            (event.currentTarget as HTMLInputElement).checked
                          )}
                        >${block}</wa-checkbox
                      >`
                  )
                : html`<span class="help" role="status">
                    ${this._localize("service_templates.no_extractable_blocks")}
                  </span>`
            }
          </div>
        </div>
        <label class="field">
          <span>${this._localize("service_templates.manifest_optional")}</span>
          <textarea
            .value=${this._manifest}
            @input=${(event: Event) => {
              this._manifest = (event.currentTarget as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </label>
        <wa-checkbox
          ?checked=${this._overwrite}
          @change=${(event: Event) => {
            this._overwrite = (event.currentTarget as HTMLInputElement).checked;
          }}
          >${this._localize("service_templates.replace_existing")}</wa-checkbox
        >
        ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
        <div class="actions">
          <button type="button" @click=${this._close}>
            ${this._localize("layout.cancel")}
          </button>
          <button
            class="primary"
            type="button"
            ?disabled=${this._submitting || !validId || this._selected.size === 0}
            @click=${this._extract}
          >
            ${this._localize("service_templates.save_template")}
          </button>
        </div>
      </esphome-base-dialog>
    `;
  }

  private _toggleBlock(block: string, checked: boolean): void {
    const next = new Set(this._selected);
    if (checked) next.add(block);
    else next.delete(block);
    this._selected = next;
  }

  private _extract = async (): Promise<void> => {
    if (this._submitting || !SERVICE_TEMPLATE_ID_RE.test(this._templateId)) return;
    this._submitting = true;
    this._error = "";
    try {
      const template = await this._api.extractServiceTemplate({
        configuration: this.configuration,
        blocks: [...this._selected],
        template_id: this._templateId,
        ...(this._manifest.trim() ? { manifest: this._manifest } : {}),
        ...(this._overwrite ? { overwrite: true } : {}),
      });
      notifySuccess(
        this._localize("service_templates.created_success", {
          name: template.title,
        })
      );
      this._close();
    } catch (err) {
      this._error = formatApiError(
        err,
        this._localize,
        "service_templates.extract_error"
      );
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
    "esphome-extract-service-template-dialog": ESPHomeExtractServiceTemplateDialog;
  }
}
