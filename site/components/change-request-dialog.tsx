"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, Copy, X } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import {
  buildChangeRequestPrompt,
  changeRequestKindLabel,
  requestKindsForScope,
  type ChangeRequestContext,
  type ChangeRequestKind,
  type ChangeRequestScope,
} from "@/lib/change-request";

export function ChangeRequestDialog({
  contexts,
  initialScope,
  initialKind,
  initialDetails = "",
  onClose,
  onCopy,
}: {
  contexts: Partial<Record<ChangeRequestScope, ChangeRequestContext>>;
  initialScope: ChangeRequestScope;
  initialKind?: ChangeRequestKind;
  initialDetails?: string;
  onClose: () => void;
  onCopy: (prompt: string) => Promise<boolean>;
}) {
  const { language, t } = useI18n();
  const availableScopes = useMemo(
    () =>
      (Object.keys(contexts) as ChangeRequestScope[]).filter(
        (scope) => contexts[scope],
      ),
    [contexts],
  );
  const [scope, setScope] = useState<ChangeRequestScope>(
    contexts[initialScope] ? initialScope : (availableScopes[0] ?? "wiki"),
  );
  const kinds = requestKindsForScope(scope);
  const [kind, setKind] = useState<ChangeRequestKind>(
    initialKind && kinds.includes(initialKind) ? initialKind : kinds[0],
  );
  const [details, setDetails] = useState(initialDetails);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeDialog = useEffectEvent(onClose);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() =>
      dialogRef.current
        ?.querySelector<HTMLElement>(
          ".change-request-fields select, .change-request-fields textarea",
        )
        ?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
      previousFocus.current?.focus();
    };
  }, []);

  const context = contexts[scope]!;
  const prompt = buildChangeRequestPrompt({
    context: { ...context, language },
    kind,
    details,
  });

  async function copyRequest() {
    if (await onCopy(prompt)) onClose();
  }

  return (
    <div
      className="change-request-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="change-request-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-request-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span>
              <Bot aria-hidden="true" /> {t("request.eyebrow")}
            </span>
            <h2 id="change-request-title">{t("request.title")}</h2>
            <p>{t("request.description")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="change-request-fields">
          {availableScopes.length > 1 && (
            <label>
              <span>{t("request.target")}</span>
              <select
                value={scope}
                onChange={(event) => {
                  const nextScope = event.target.value as ChangeRequestScope;
                  const nextKinds = requestKindsForScope(nextScope);
                  setScope(nextScope);
                  if (!nextKinds.includes(kind)) setKind(nextKinds[0]);
                }}
              >
                {availableScopes.map((value) => (
                  <option key={value} value={value}>
                    {value === "wiki"
                      ? t("request.scopeWiki")
                      : value === "topic"
                        ? t("request.scopeTopic")
                        : value === "revision"
                          ? t("request.scopeRevision")
                          : value === "deleted_page"
                            ? t("request.scopeDeletedPage")
                            : t("request.scopePage")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            className="change-request-target"
            aria-label={t("request.target")}
          >
            <span>{t("request.target")}</span>
            <strong>
              {context.page?.title ??
                context.topic?.title ??
                context.wiki.title}
            </strong>
            <small>
              {context.page
                ? `${context.page.path} · v${context.page.version}`
                : context.topic
                  ? context.topic.id
                  : context.wiki.id}
            </small>
          </div>
          {kind === "research" && (scope === "wiki" || scope === "page") && (
            <p className="change-request-scope-hint">
              {t(
                scope === "wiki"
                  ? "request.researchScopeWiki"
                  : "request.researchScopePage",
              )}
            </p>
          )}
          <label>
            <span>{t("request.kind")}</span>
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as ChangeRequestKind)
              }
            >
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {changeRequestKindLabel(language, value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("request.details")}</span>
            <textarea
              value={details}
              maxLength={2000}
              placeholder={t("request.detailsPlaceholder")}
              onChange={(event) => setDetails(event.target.value)}
            />
            <small>
              {t("request.detailsCount", { count: details.length })}
            </small>
          </label>
        </div>

        <details className="change-request-preview">
          <summary>
            <ChevronDown aria-hidden="true" /> {t("request.preview")}
          </summary>
          <pre>{prompt}</pre>
        </details>

        <footer>
          <p>{t("request.copyHint")}</p>
          <div>
            <button type="button" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void copyRequest()}
            >
              <Copy aria-hidden="true" />
              {t("request.copy")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
