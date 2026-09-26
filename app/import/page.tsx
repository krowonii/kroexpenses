"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell, Panel, PanelHead } from "@/components/ui";
import { UploadArea } from "@/components/import/upload-area";
import { FileReview } from "@/components/import/file-review";
import { ProcessingState } from "@/components/import/processing-state";
import { ImportSummaryView } from "@/components/import/import-summary";
import { ImportHistory, type HistoryRow } from "@/components/import/import-history";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAppData } from "@/lib/app-data";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";
import type { DetectedFile, ImportSummary } from "@/lib/import/types";

type Screen = "upload" | "reviewing" | "processing" | "done";

/**
 * Import flow: Upload → Confirm → Wait → Results → Review exceptions.
 * The pipeline runs server-side; this screen only stages files, shows
 * progress, and reports the actual counts it returns.
 */
export default function ImportPage() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [detected, setDetected] = useState<DetectedFile[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [activeStage, setActiveStage] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const staged = useRef<File[]>([]);

  // Accounts come from the shared store (preloaded at app boot); while
  // the database isn't connected the store is empty and the starter list
  // takes over.
  const { accounts: dbAccounts } = useAppData();
  const accounts = dbAccounts.length > 0 ? dbAccounts : DEFAULT_ACCOUNTS;

  const refreshHistory = useCallback(() => {
    if (!isSupabaseConfigured()) return;
    fetch("/api/import/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHistory(data?.imports ?? []))
      .catch(() => {});
  }, []);

  useEffect(refreshHistory, [refreshHistory]);

  async function handleFiles(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);

    try {
      // In the reviewing screen, added files merge with the staged set.
      const next =
        screen === "reviewing"
          ? [
              ...staged.current.filter(
                (file) => !files.some((added) => added.name === file.name)
              ),
              ...files,
            ]
          : files;
      staged.current = next;

      const formData = new FormData();
      next.forEach((file) => formData.append("files", file));
      const res = await fetch("/api/import/detect", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`File inspection failed (${res.status})`);
      const data = (await res.json()) as { files: DetectedFile[] };

      setDetected(data.files);
      setSelections((prev) => {
        const merged = { ...prev };
        for (const file of data.files) {
          // Preselect the detected account; the user changes it if needed.
          if (!(file.fileName in merged)) {
            merged[file.fileName] = file.suggestedAccountName ?? "";
          }
        }
        return merged;
      });
      setScreen("reviewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScreen("upload");
    } finally {
      setBusy(false);
    }
  }

  function handleAccountChange(fileName: string, accountName: string) {
    setSelections((prev) => ({ ...prev, [fileName]: accountName }));
  }

  function handleRemove(fileName: string) {
    setDetected((prev) => prev.filter((file) => file.fileName !== fileName));
    setSelections((prev) => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    staged.current = staged.current.filter((file) => file.name !== fileName);
    if (staged.current.length === 0) setScreen("upload");
  }

  function reset() {
    setScreen("upload");
    setDetected([]);
    setSelections({});
    setSummary(null);
    setActiveStage(0);
    staged.current = [];
    setError(null);
    refreshHistory();
  }

  async function handleProcess() {
    if (processable.length === 0) return;
    setScreen("processing");
    setActiveStage(0);
    setDetail(null);
    setElapsed(0);
    setError(null);

    // Elapsed ticks every second while the request runs.
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const formData = new FormData();
      for (const file of staged.current) {
        if (!processable.some((p) => p.fileName === file.name)) continue;
        formData.append("files", file);
      }
      formData.append(
        "assignments",
        JSON.stringify(
          processable.map((file) => ({
            fileName: file.fileName,
            accountName: selections[file.fileName],
          }))
        )
      );

      const res = await fetch("/api/import/process", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Import failed (${res.status})`);
      }
      if (!res.body) throw new Error("Import stream unavailable");

      // Server-Sent Events: progress frames drive the stage checklist as
      // the pipeline runs, then either a summary completes the flow or an
      // error fails it.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "").trim();
          if (!line) continue;
          const event = JSON.parse(line) as {
            stage?: number;
            detail?: string;
            summary?: ImportSummary;
            error?: string;
          };
          if (event.error) throw new Error(event.error);
          if (event.summary) {
            setSummary(event.summary);
            setScreen("done");
            refreshHistory();
            return;
          }
          if (event.stage !== undefined) {
            setActiveStage(event.stage);
            setDetail(event.detail ?? null);
          }
        }
      }
      throw new Error("Import ended without a result");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScreen("reviewing");
    } finally {
      clearInterval(timer);
    }
  }

  const processable = detected.filter(
    (file) => !file.parseError && selections[file.fileName]
  );
  const needsAccount = detected.some(
    (file) => !file.parseError && !selections[file.fileName]
  );
  const canProcess = processable.length > 0 && !needsAccount;

  return (
    <PageShell title="Import">
      {error ? (
        <div className="mb-3.5 rounded-md border border-expense/35 bg-expense/8 px-3.5 py-2.5 text-[12.5px] text-expense">
          {error}
        </div>
      ) : null}

      {/* min-w-0 on both columns — grid items keep min-width: auto, so a
          long unbreakable filename would otherwise blow the track out
          before any truncate deeper in could apply. */}
      <div className="grid grid-cols-[1.65fr_1fr] gap-3 max-[860px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-3">
          {screen === "upload" ? <UploadArea onFiles={handleFiles} busy={busy} /> : null}

          {screen === "reviewing" ? (
            <FileReview
              files={detected}
              accounts={accounts.map((account) => ({
                id: account.id,
                name: account.name,
              }))}
              selections={selections}
              onAccountChange={handleAccountChange}
              onRemove={handleRemove}
              onAddFiles={handleFiles}
            />
          ) : null}

          {screen === "processing" ? (
            <ProcessingState activeIndex={activeStage} detail={detail} elapsed={elapsed} />
          ) : null}

          {screen === "done" && summary ? (
            <ImportSummaryView summary={summary} onDone={reset} />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {screen === "reviewing" ? (
            <Panel>
              <PanelHead
                title="Ready to import"
                hint={`${processable.length} file${processable.length === 1 ? "" : "s"}`}
              />
              <p className="mb-3.5 text-[12px] leading-[1.55] text-text-dim">
                The system will read each statement, remove duplicates,
                reconcile internal transfers, and categorize transactions.
                You will only be asked to review what could not be confidently
                categorized.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={!canProcess}
                  className="rounded-sm bg-net px-3.5 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Process {processable.length} file{processable.length === 1 ? "" : "s"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-sm border border-border bg-surface-2 px-3.5 py-1.5 text-[12.5px] hover:border-text-faint"
                >
                  Cancel
                </button>
              </div>
              {needsAccount ? (
                <div className="mt-2.5 text-[11.5px] text-warn">
                  Select an account for every file to continue.
                </div>
              ) : null}
            </Panel>
          ) : null}

          {screen === "processing" ? (
            <Panel>
              <PanelHead title="While you wait" />
              <p className="text-[12px] leading-[1.55] text-text-dim">
                Processing runs on the server. Files are never modified — the
                system only reads them and records transactions.
              </p>
            </Panel>
          ) : null}

          <ImportHistory imports={history} />
        </div>
      </div>
    </PageShell>
  );
}
