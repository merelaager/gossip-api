import { spawn } from "node:child_process";

export const probeVideoDurationSeconds = (
  filePath: string,
): Promise<number> => {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    // Fires when the binary itself can't be launched (e.g. ffprobe not installed).
    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      const seconds = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(seconds)) {
        reject(
          new Error(
            `Could not parse duration from ffprobe output: '${stdout.trim()}'`,
          ),
        );
        return;
      }

      resolve(seconds);
    });
  });
};
