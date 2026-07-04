"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type PromptOpts = {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
};
type AlertOpts = { title: string; message: string; okLabel?: string };

type DialogState =
  | ({ kind: "confirm" } & ConfirmOpts)
  | ({ kind: "prompt" } & PromptOpts)
  | ({ kind: "alert" } & AlertOpts)
  | null;

// Hook that provides askConfirm / askPrompt / showAlert (all Promise-based)
// plus <DialogHost />, which must be rendered once in the component.
export function useDialogs() {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: unknown) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const askConfirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
      setState({ kind: "confirm", ...opts });
    });
  }, []);

  const askPrompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
      setValue(opts.defaultValue ?? "");
      setState({ kind: "prompt", ...opts });
    });
  }, []);

  const showAlert = useCallback((opts: AlertOpts) => {
    return new Promise<void>((resolve) => {
      resolver.current = resolve as (v: unknown) => void;
      setState({ kind: "alert", ...opts });
    });
  }, []);

  const finish = useCallback((result: unknown) => {
    const r = resolver.current;
    resolver.current = null;
    setState(null);
    r?.(result);
  }, []);

  // Focus & select the input when the prompt opens.
  useEffect(() => {
    if (state?.kind === "prompt") {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [state]);

  const DialogHost = state ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          finish(state.kind === "confirm" ? false : state.kind === "prompt" ? null : undefined);
        }
      }}
      onMouseDown={(e) => {
        // clicking the backdrop = cancel (except for alerts, which need acknowledgment)
        if (e.target === e.currentTarget && state.kind !== "alert") {
          finish(state.kind === "confirm" ? false : null);
        }
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="mb-3 flex items-start gap-3">
          {state.kind === "confirm" && "danger" in state && state.danger && (
            <span className="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-600">
              <AlertTriangle size={18} />
            </span>
          )}
          <h3 className="flex-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {state.title}
          </h3>
          <button
            onClick={() =>
              finish(
                state.kind === "confirm"
                  ? false
                  : state.kind === "prompt"
                  ? null
                  : undefined
              )
            }
            className="text-gray-400 hover:text-gray-600"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>

        {state.kind === "confirm" && (
          <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">{state.message}</p>
        )}

        {state.kind === "alert" && (
          <p className="mb-5 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
            {state.message}
          </p>
        )}

        {state.kind === "prompt" && (
          <div className="mb-5">
            {state.label && (
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {state.label}
              </label>
            )}
            <input
              ref={inputRef}
              value={value}
              placeholder={state.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) finish(value.trim());
              }}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          {state.kind !== "alert" && (
            <button
              onClick={() => finish(state.kind === "confirm" ? false : null)}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {state.kind === "confirm"
                ? state.cancelLabel ?? "Cancel"
                : "Cancel"}
            </button>
          )}

          {state.kind === "confirm" && (
            <button
              onClick={() => finish(true)}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                state.danger
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {state.confirmLabel ?? "OK"}
            </button>
          )}

          {state.kind === "prompt" && (
            <button
              onClick={() => value.trim() && finish(value.trim())}
              disabled={!value.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {state.confirmLabel ?? "OK"}
            </button>
          )}

          {state.kind === "alert" && (
            <button
              onClick={() => finish(undefined)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {state.okLabel ?? "OK"}
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return { askConfirm, askPrompt, showAlert, DialogHost };
}