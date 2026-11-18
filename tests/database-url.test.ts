import { describe, expect, it } from "vitest";
import {
  localDatabaseDirectory,
  normalizeDatabaseUrl,
} from "@/db/database-url";

describe("PGlite database URL normalization", () => {
  it("accepts the file-dot-slash form commonly used in env files", () => {
    expect(normalizeDatabaseUrl("file:./.repd/repd.db")).toBe(
      "file://.repd/repd.db",
    );
  });

  it("preserves existing PGlite and hosted database URLs", () => {
    expect(normalizeDatabaseUrl("file://.repd/repd.db")).toBe(
      "file://.repd/repd.db",
    );
    expect(normalizeDatabaseUrl("postgres://db.example/repd")).toBe(
      "postgres://db.example/repd",
    );
  });

  it("derives the local directory without treating the file prefix as a path", () => {
    expect(localDatabaseDirectory("file:./.repd/repd.db")).toBe(".repd");
    expect(localDatabaseDirectory("postgres://db.example/repd")).toBeNull();
  });
});
