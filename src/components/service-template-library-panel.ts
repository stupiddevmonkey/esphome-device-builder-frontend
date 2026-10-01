import { consume } from "@lit/context";
import { mdiDeleteOutline, mdiPencilOutline, mdiPlus, mdiUpdate } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { isApiErrorCode } from "../api/api-error.js";
import type { ESPHomeAPI } from "../api/index.js";
import { ErrorCode } from "../api/types/protocol.js";
import type {
  ServiceTemplate,
  ServiceTemplateUsage,
} from "../api/types/service-templates.js";
import { ServiceTemplateSource } from "../api/types/service-templates.js";
import type { LocalizeFunc } from "../common/localize.js";
import {
  apiContext,
  localizeContext,
  serviceTemplatesContext,
  serviceTemplateUsagesContext,
} from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import { formatApiError } from "../util/format-api-error.js";
import { notifyError, notifySuccess } from "../util/notify.js";
import { registerMdiIcons } from "../util/register-icons.js";
import type { ESPHomeConfirmDialog } from "./confirm-dialog.js";
import type { ESPHomeServiceTemplateEditorDialog } from "./service-template-editor-dialog.js";

import "@home-assistant/webawesome/dist/components/badge/badge.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "./confirm-dialog.js";
import "./service-template-editor-dialog.js";

registerMdiIcons({
  "delete-outline": mdiDeleteOutline,
  "pencil-outline": mdiPencilOutline,
  plus: mdiPlus,
  update: mdiUpdate,
});

@customElement("esphome-service-template-library-panel")
export class ESPHomeServiceTemplateLibraryPanel extends LitElement {
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

  @query("esphome-service-template-editor-dialog")
  private _editor!: ESPHomeServiceTemplateEditorDialog;

  @query(".delete-confirm")
  private _deleteConfirm!: ESPHomeConfirmDialog;

  @query(".update-confirm")
  private _updateConfirm!: ESPHomeConfirmDialog;

  @query(".force-delete-confirm")
  private _forceDeleteConfirm!: ESPHomeConfirmDialog;

  @state() private _pending: ServiceTemplate | null = null;
  @state() private _deleteMessage = "";
  @state() private _busyId = "";

  static styles = [
    espHomeStyles,
    css`
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--wa-space-m);
        margin: var(--wa-space-l) 0;
      }
      .toolbar h2 {
        margin: 0;
        font-size: var(--wa-font-size-l);
      }
      button {
        display: inline-flex;
        align-items: center;
        gap: var(--wa-space-xs);
      }
      .group-title {
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-xs);
        text-transform: uppercase;
        margin-top: var(--wa-space-l);
      }
      .template {
        padding: var(--wa-space-m) 0;
        border-bottom: var(--wa-border-width-s) solid var(--wa-color-surface-border);
      }
      .template-head,
      .template-actions,
      .chips {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--wa-space-xs);
      }
      .template-head {
        justify-content: space-between;
      }
      .title {
        font-weight: var(--wa-font-weight-bold);
      }
      .desc,
      .meta,
      .empty {
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-s);
      }
      .chips {
        margin-top: var(--wa-space-xs);
      }
      .template-actions {
        margin-top: var(--wa-space-s);
      }
      .danger {
        color: var(--esphome-error);
      }
    `,
  ];

  protected render() {
    const groups = this._groupedTemplates;
    return html`
      <esphome-service-template-editor-dialog></esphome-service-template-editor-dialog>
      <esphome-confirm-dialog
        class="delete-confirm"
        destructive
        .heading=${this._localize("service_templates.delete_title")}
        .message=${this._deleteMessage}
        .confirmLabel=${this._localize("service_templates.delete")}
        @confirm=${this._confirmDelete}
      ></esphome-confirm-dialog>
      <esphome-confirm-dialog
        class="force-delete-confirm"
        destructive
        .heading=${this._localize("service_templates.delete_title")}
        .message=${this._deleteMessage}
        .confirmLabel=${this._localize("service_templates.delete_anyway")}
        @confirm=${this._confirmForceDelete}
      ></esphome-confirm-dialog>
      <esphome-confirm-dialog
        class="update-confirm"
        .heading=${this._localize("service_templates.accept_update_title")}
        .message=${this._updateMessage}
        .confirmLabel=${this._localize("service_templates.update")}
        @confirm=${this._acceptUpdate}
      ></esphome-confirm-dialog>
      <div class="toolbar">
        <div>
          <h2>${this._localize("service_templates.library_title")}</h2>
          <p class="desc">${this._localize("service_templates.library_desc")}</p>
        </div>
        <button class="primary" type="button" @click=${() => this._editor.open()}>
          <wa-icon library="mdi" name="plus"></wa-icon>
          ${this._localize("service_templates.create_template")}
        </button>
      </div>
      ${
        this._templates === null
          ? html`<p class="empty">${this._localize("service_templates.loading")}</p>`
          : groups.length === 0
            ? html`<p class="empty" role="status">
                ${this._localize("service_templates.library_empty")}
              </p>`
            : groups.map(
                ([category, templates]) => html`
                  <h3 class="group-title">${category}</h3>
                  ${templates.map((template) => this._renderTemplate(template))}
                `
              )
      }
    `;
  }

  private _renderTemplate(template: ServiceTemplate) {
    const usageCount =
      this._usages?.filter((usage) => usage.template_id === template.id).length ?? 0;
    const busy = this._busyId === template.id;
    return html`
      <article class="template">
        <div class="template-head">
          <span class="title">${template.title}</span>
          <span class="meta">
            ${this._localize("service_templates.usage_count", { count: usageCount })}
          </span>
        </div>
        ${template.description ? html`<div class="desc">${template.description}</div>` : nothing}
        <div class="chips">
          <wa-badge pill
            >${this._localize(`service_templates.source.${template.source}`)}</wa-badge
          >
          <wa-badge pill>
            ${this._localize("service_templates.variable_count", {
              count: template.variables.length,
            })}
          </wa-badge>
          ${
            template.modified
              ? html`<wa-badge variant="warning" pill>
                  ${this._localize("service_templates.modified")}
                </wa-badge>`
              : nothing
          }
          ${
            template.update_available
              ? html`<wa-badge variant="brand" pill>
                  ${this._localize("service_templates.update_available")}
                </wa-badge>`
              : nothing
          }
        </div>
        <div class="template-actions">
          <button
            type="button"
            ?disabled=${busy}
            @click=${() => this._editor.open(template)}
          >
            <wa-icon library="mdi" name="pencil-outline"></wa-icon>
            ${this._localize("layout.edit")}
          </button>
          ${
            template.update_available
              ? html`<button
                  type="button"
                  ?disabled=${busy}
                  @click=${() => this._promptUpdate(template)}
                >
                  <wa-icon library="mdi" name="update"></wa-icon>
                  ${this._localize("service_templates.update")}
                </button>`
              : nothing
          }
          ${
            template.source === ServiceTemplateSource.BUILTIN
              ? nothing
              : html`<button
                  class="danger"
                  type="button"
                  ?disabled=${busy}
                  @click=${() => this._promptDelete(template)}
                >
                  <wa-icon library="mdi" name="delete-outline"></wa-icon>
                  ${this._localize("service_templates.delete")}
                </button>`
          }
        </div>
      </article>
    `;
  }

  private get _groupedTemplates(): Array<[string, ServiceTemplate[]]> {
    const groups = new Map<string, ServiceTemplate[]>();
    for (const template of this._templates?.values() ?? []) {
      const category =
        template.category ?? this._localize("service_templates.uncategorized");
      const group = groups.get(category) ?? [];
      group.push(template);
      groups.set(category, group);
    }
    return [...groups.entries()]
      .map(
        ([category, templates]) =>
          [category, templates.sort((a, b) => a.title.localeCompare(b.title))] as [
            string,
            ServiceTemplate[],
          ]
      )
      .sort(([a], [b]) => a.localeCompare(b));
  }

  private _promptDelete(template: ServiceTemplate): void {
    this._pending = template;
    this._deleteMessage = this._localize("service_templates.delete_confirm", {
      name: template.title,
    });
    this._deleteConfirm.open();
  }

  private _confirmDelete = async (): Promise<void> => {
    await this._delete(false);
  };

  private _confirmForceDelete = async (): Promise<void> => {
    await this._delete(true);
  };

  private async _delete(force: boolean): Promise<void> {
    const template = this._pending;
    if (!template) return;
    this._busyId = template.id;
    try {
      await this._api.deleteServiceTemplate(template.id, force);
      notifySuccess(
        this._localize("service_templates.deleted_success", {
          name: template.title,
        })
      );
      this._pending = null;
    } catch (err) {
      if (!force && isApiErrorCode(err, ErrorCode.PRECONDITION_FAILED)) {
        this._deleteMessage = this._localize("service_templates.delete_blocked_confirm", {
          message: err.details,
        });
        await this.updateComplete;
        this._forceDeleteConfirm.open();
      } else {
        notifyError(
          formatApiError(err, this._localize, "service_templates.delete_error")
        );
      }
    } finally {
      this._busyId = "";
    }
  }

  private _promptUpdate(template: ServiceTemplate): void {
    this._pending = template;
    this._updateConfirm.open();
  }

  private get _updateMessage(): string {
    if (!this._pending) return "";
    return this._localize(
      this._pending.modified
        ? "service_templates.accept_modified_update_confirm"
        : "service_templates.accept_update_confirm",
      { name: this._pending.title }
    );
  }

  private _acceptUpdate = async (): Promise<void> => {
    const template = this._pending;
    if (!template) return;
    this._busyId = template.id;
    try {
      await this._api.acceptServiceTemplateUpdate(template.id);
      notifySuccess(
        this._localize("service_templates.updated_success", {
          name: template.title,
        })
      );
      this._pending = null;
    } catch (err) {
      notifyError(formatApiError(err, this._localize, "service_templates.update_error"));
    } finally {
      this._busyId = "";
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-service-template-library-panel": ESPHomeServiceTemplateLibraryPanel;
  }
}
