import { QueueWorker, type WorkerStatus } from "./queue-worker";
import { messageOf } from "./text-model";
import { persistFolder, pickFolder, restoreFolder, type Entry } from "./uxp-fs";

const TOKEN_KEY = "prototype.homeFolderToken";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`panel element ${id} is missing`);
  }
  return found as T;
}

function setText(id: string, text: string): void {
  element(id).textContent = text;
}

let hasRoot = false;
let lastStatus: WorkerStatus = { state: "stopped", currentJob: null, lastResult: "none", processed: 0 };

function render(status: WorkerStatus): void {
  lastStatus = status;
  setText("worker-state", status.state);
  setText("current-job", status.currentJob ?? "none");
  setText("processed-count", String(status.processed));
  setText("last-result", status.lastResult);
  element<HTMLButtonElement>("start-worker").disabled = status.state !== "stopped" || !hasRoot;
  element<HTMLButtonElement>("stop-worker").disabled = status.state === "stopped";
}

const worker = new QueueWorker(render);

function useRoot(root: Entry): void {
  worker.setRoot(root);
  hasRoot = true;
  setText("folder-path", String(root.nativePath ?? root.name));
  render(lastStatus);
}

async function selectFolder(): Promise<void> {
  const folder = await pickFolder();
  if (!folder) {
    return;
  }
  try {
    localStorage.setItem(TOKEN_KEY, await persistFolder(folder));
  } catch (error) {
    setText("last-result", `folder selected, but the token could not be saved: ${messageOf(error)}`);
  }
  useRoot(folder);
}

async function restore(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return;
  }
  try {
    useRoot(await restoreFolder(token));
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
}

element("select-folder").addEventListener("click", () => {
  void selectFolder();
});
element("start-worker").addEventListener("click", () => {
  try {
    worker.start();
  } catch (error) {
    setText("last-result", messageOf(error));
  }
});
element("stop-worker").addEventListener("click", () => {
  worker.stop();
});

render(lastStatus);
void restore();
