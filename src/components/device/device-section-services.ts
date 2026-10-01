import { consume } from "@lit/context";
import { mdiDeleteOutline, mdiPencilOutline, mdiPuzzleOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../../api/index.js";
import type { BoardCatalogEntry } from "../../api/types/boards.js";
import type {
  ServiceTemplate,
  ServiceTemplateUsage,
} from "../../api/types/service-templates.js";
import type { LocalizeFunc } from "../../common/localize.js";
import {
  apiContext,
  localizeContext,
  serviceTemplatesContext,
  serviceTemplateUsagesContext,
} from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { formatApiError } from "../../util/format-api-error.js";
import { notifyError, notifySuccess } from "../../util/notify.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import type { ESPHomeAddServiceTemplateDialog } from "../add-service-template-dialog.js";
import type { ESPHomeConfirmDialog } from "../confirm-dialog.js";
import { fireSectionEvent } from "./section-editor.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "../add-service-template-dialog.js";
import "../confirm-dialog.js";

registerMdiIcons({
  "delete-outline": mdiDeleteOutline,
  "pencil-outline": mdiPencilOutline,
  "puzzle-outline": mdiPuzzleOutline,
});

@customElement("esphome-device-section-services")
export class ESPHomeDeviceSectionServices extends LitElement {
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
  @property() packageKey = "";
  @property() platform = "";
  @property() yaml = "";
  @property({ attribute: false }) board: BoardCatalogEntry | null = null;

  @query("esphome-add-service-template-dialog")
  private _dialog!: ESPHomeAddServiceTemplateDialog;

  @query("esphome-confirm-dialog")
  private _confirm!: ESPHomeConfirmDialog;

  @state() private _removing = false;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: block;
        padding: var(--wa-space-l);
      }
      .header {
        display: flex;
        align-items: center;
        gap: var(--wa-space-m);
      }
      .icon {
        font-size: 28px;
        color: var(--esphome-primary);
      }
      h3 {
        margin: 0;
      }
      .meta,
      .empty {
        color: var(--wa-color-text-quiet);
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: var(--wa-space-xs) var(--wa-space-m);
      }
      dt {
        font-weight: var(--wa-font-weight-bold);
      }
      dd {
        margin: 0;
        font-family: var(--wa-font-family-mono);
      }
      .actions {
        display: flex;
        gap: var(--wa-space-s);
        margin-top: var(--wa-space-l);
      }
      button {
        display: inline-flex;
        gap: var(--wa-space-xs);
        align-items: center;
      }
      .danger {
        color: var(--esphome-error);
      }
    `,
  ];

  protected render() {
    const usage = this._usage;
    const template = usage ? this._templates?.get(usage.template_id) : undefined;
    return html`
      <esphome-add-service-template-dialog
        .configuration=${this.configuration}
        .platform=${this.platform}
        .board=${this.board}
        .yaml=${this.yaml}
      ></esphome-add-service-template-dialog>
      <esphome-confirm-dialog
        destructive
        .heading=${this._localize("service_templates.remove_title")}
        .message=${this._localize("service_templates.remove_confirm")}
        .confirmLabel=${this._localize("service_templates.remove")}
        @confirm=${this._remove}
      ></esphome-confirm-dialog>
      ${
        !usage
          ? html`<p class="empty" role="status">
              ${this._localize("service_templates.usage_missing")}
            </p>`
          : html`
              <div class="header">
                <wa-icon class="icon" library="mdi" name="puzzle-outline"></wa-icon>
                <div>
                  <h3>${template?.title ?? usage.template_id}</h3>
                  ${
                    usage.package_key !== usage.template_id
                      ? html`<div class="meta">${usage.package_key}</div>`
                      : nothing
                  }
                </div>
              </div>
              ${
                Object.keys(usage.vars).length
                  ? html`<dl>
                      ${Object.entries(usage.vars).map(
                        ([name, value]) =>
                          html`<dt>${name}</dt>
                            <dd>${value}</dd>`
                      )}
                    </dl>`
                  : html`<p class="empty">
                      ${this._localize("service_templates.using_defaults")}
                    </p>`
              }
              <div class="actions">
                <button type="button" @click=${() => this._dialog.open(usage)}>
                  <wa-icon library="mdi" name="pencil-outline"></wa-icon>
                  ${this._localize("service_templates.reconfigure")}
                </button>
                <button
                  class="danger"
                  type="button"
                  ?disabled=${this._removing}
                  @click=${() => this._confirm.open()}
                >
                  <wa-icon library="mdi" name="delete-outline"></wa-icon>
                  ${this._localize("service_templates.remove")}
                </button>
              </div>
            `
      }
    `;
  }

  private get _usage(): ServiceTemplateUsage | undefined {
    return this._usages?.find(
      (usage) =>
        usage.configuration === this.configuration &&
        usage.package_key === this.packageKey
    );
  }

  private _remove = async (): Promise<void> => {
    const usage = this._usage;
    if (!usage || this._removing) return;
    const basedOn = this.yaml;
    this._removing = true;
    try {
      const result = await this._api.removeServiceTemplate({
        configuration: this.configuration,
        package_key: usage.package_key,
        yaml: basedOn,
      });
      fireSectionEvent(this, "yaml-draft", {
        configuration: this.configuration,
        yaml: result.content,
        basedOn,
        node: this,
      });
      this.dispatchEvent(
        new CustomEvent("service-template-removed", {
          bubbles: true,
          composed: true,
        })
      );
      notifySuccess(this._localize("service_templates.removed_success"));
    } catch (err) {
      notifyError(formatApiError(err, this._localize, "service_templates.remove_error"));
    } finally {
      this._removing = false;
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-section-services": ESPHomeDeviceSectionServices;
  }
}
