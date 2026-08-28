import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "./contracts";

describe("role capability matrix", () => {
  it("keeps anonymous and viewer sessions read-only", () => {
    expect(capabilitiesFor(null)).toMatchObject({
      can_read: false,
      can_write: false,
      can_import: false,
    });
    expect(capabilitiesFor("viewer")).toMatchObject({
      can_read: true,
      can_write: false,
      can_restore: false,
      can_manage_attachments: false,
      can_soft_delete: false,
    });
  });

  it("projects operational read-only mode into discovery and execution capabilities", () => {
    const owner = capabilitiesFor("owner", false, "read_only");
    expect(owner.can_read).toBe(true);
    expect(owner.can_export_portable).toBe(true);
    expect(owner.can_manage_members).toBe(true);
    expect(owner.can_full_backup).toBe(true);
    expect(owner.can_write).toBe(false);
    expect(owner.can_restore).toBe(false);
    expect(owner.can_manage_attachments).toBe(false);
    expect(owner.can_soft_delete).toBe(false);
    expect(owner.can_import).toBe(false);
  });
  it("allows editors to mutate content but not members or full backups", () => {
    expect(capabilitiesFor("editor")).toMatchObject({
      can_read: true,
      can_write: true,
      can_restore: true,
      can_manage_attachments: true,
      can_soft_delete: true,
      can_manage_members: false,
      can_full_backup: false,
      can_import: false,
    });
  });
  it("reserves membership, full backup, and import administration for owners", () => {
    expect(capabilitiesFor("owner")).toMatchObject({
      can_write: true,
      can_manage_members: true,
      can_full_backup: true,
      can_import: true,
    });
  });
  it("grants bootstrap separately from active-wiki permissions", () => {
    expect(capabilitiesFor(null, true)).toMatchObject({
      can_bootstrap: true,
      can_read: false,
      can_write: false,
      can_import: false,
    });
  });
});
