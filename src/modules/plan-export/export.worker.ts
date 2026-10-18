import type { ExportJob } from "./model";
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ExportJob>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data: job }) => {
  try {
    const progress = (message: string, completed: number, total: number) =>
      scope.postMessage({ type: "progress", message, completed, total });
    const bytes =
      job.options.format === "xlsx"
        ? await (await import("./excel")).exportPlanExcel(job, progress)
        : await (await import("./pdf")).exportPlanPdf(job, progress);
    const buffer = new Uint8Array(bytes).buffer;
    scope.postMessage({ type: "done", buffer }, [buffer]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Không xuất được kế hoạch",
    });
  }
};
