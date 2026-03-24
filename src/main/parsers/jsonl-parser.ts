import fs from "fs";
import fsPromises from "fs/promises";

/**
 * A single parsed line from a JSONL file.
 */
export interface ParsedLine {
  raw: Record<string, unknown>;
  timestamp: number;
}

/**
 * Incrementally tails a JSONL file by tracking byte offset.
 * Each call to `readNewLines()` reads only bytes added since the last call,
 * making it safe and cheap to poll on file-change events.
 */
export class JsonlParser {
  private filePath: string;
  public offset: number;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.offset = 0;
  }

  /**
   * Read lines appended since the last call (synchronous — for bootstrap).
   */
  readNewLines(): ParsedLine[] {
    let fd: number | undefined;

    try {
      const stats = fs.statSync(this.filePath);
      if (stats.size <= this.offset) {
        return [];
      }

      fd = fs.openSync(this.filePath, "r");
      const bytesToRead = stats.size - this.offset;
      const buf = Buffer.allocUnsafe(bytesToRead);
      const bytesRead = fs.readSync(fd, buf, 0, bytesToRead, this.offset);
      this.offset += bytesRead;

      return this.parseChunk(buf.subarray(0, bytesRead).toString("utf8"));
    } catch {
      return [];
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* */
        }
      }
    }
  }

  /**
   * Read lines appended since the last call (async — non-blocking for live use).
   */
  async readNewLinesAsync(): Promise<ParsedLine[]> {
    try {
      const stats = await fsPromises.stat(this.filePath);
      if (stats.size <= this.offset) {
        return [];
      }

      const fh = await fsPromises.open(this.filePath, "r");
      try {
        const bytesToRead = stats.size - this.offset;
        const buf = Buffer.allocUnsafe(bytesToRead);
        const { bytesRead } = await fh.read(buf, 0, bytesToRead, this.offset);
        this.offset += bytesRead;
        return this.parseChunk(buf.subarray(0, bytesRead).toString("utf8"));
      } finally {
        await fh.close();
      }
    } catch {
      return [];
    }
  }

  private parseChunk(chunk: string): ParsedLine[] {
    const lines = chunk.split("\n");
    const now = Date.now();
    const results: ParsedLine[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      // Fast skip: progress events are ~80% of JSONL lines and contain
      // no useful data for the GUI. Skip them before expensive JSON.parse.
      if (trimmed.startsWith('{"type":"progress"')) continue;

      try {
        const raw = JSON.parse(trimmed) as Record<string, unknown>;
        results.push({ raw, timestamp: now });
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  }

  /**
   * Reset the byte offset to 0, causing the next read to
   * re-read the entire file from the start.
   */
  reset(): void {
    this.offset = 0;
  }
}
