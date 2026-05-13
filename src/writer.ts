import fs from "fs/promises";
import path from "path";

export interface WriteTarget {
  filePath: string;
  content: string;
}

export async function writeSnapshots(targets: WriteTarget[]): Promise<void> {
  for (const target of targets) {
    await fs.mkdir(path.dirname(target.filePath), { recursive: true });
    await fs.writeFile(target.filePath, target.content);
  }
}
