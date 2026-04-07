const mockQuery = jest.fn();

jest.mock("../supabase", () => ({
  pool: { query: mockQuery },
}));

import { isDuplicate, isOnCooldown } from "../dedup";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("isDuplicate", () => {
  it("retorna false quando INSERT retorna 1 row (novo)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    expect(await isDuplicate("comment-1")).toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO processed_comments"),
      ["comment-1"],
    );
  });

  it("retorna true quando INSERT retorna 0 rows (ja existia)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    expect(await isDuplicate("comment-1")).toBe(true);
  });

  it("retorna false em caso de erro (fail-open)", async () => {
    mockQuery.mockRejectedValue(new Error("db error"));
    expect(await isDuplicate("comment-1")).toBe(false);
  });
});

describe("isOnCooldown", () => {
  it("retorna false quando nao tem registro (novo)", async () => {
    // SELECT retorna vazio, INSERT acontece
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 });
    expect(await isOnCooldown("user-1", "media-1")).toBe(false);
  });

  it("retorna true quando tem registro recente", async () => {
    const recent = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({ rows: [{ created_at: recent }] });
    expect(await isOnCooldown("user-1", "media-1")).toBe(true);
  });

  it("retorna false quando registro expirou (>30min)", async () => {
    const expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ created_at: expired }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE
    expect(await isOnCooldown("user-1", "media-1")).toBe(false);
  });
});
