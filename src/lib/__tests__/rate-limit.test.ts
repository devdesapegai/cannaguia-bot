const mockQuery = jest.fn();

jest.mock("../supabase", () => ({
  pool: { query: mockQuery },
}));

import { canReply } from "../rate-limit";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("canReply", () => {
  it("permite reply quando count esta abaixo do limite", async () => {
    const recentWindow = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // isRecentPost
      .mockResolvedValueOnce({ rows: [{ window_start: recentWindow, reply_count: 10 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // increment
    expect(await canReply()).toBe(true);
  });

  it("bloqueia quando count atingiu limite (200)", async () => {
    const recentWindow = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // isRecentPost — no burst
      .mockResolvedValueOnce({ rows: [{ window_start: recentWindow, reply_count: 200 }] });
    expect(await canReply()).toBe(false);
  });

  it("permite burst ate 300 quando tem post recente", async () => {
    const recentWindow = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // isRecentPost — burst mode
      .mockResolvedValueOnce({ rows: [{ window_start: recentWindow, reply_count: 250 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // increment
    expect(await canReply()).toBe(true);
  });

  it("reseta window quando expirou (>1h)", async () => {
    const oldWindow = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // isRecentPost
      .mockResolvedValueOnce({ rows: [{ window_start: oldWindow, reply_count: 999 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE reset
    expect(await canReply()).toBe(true);
  });

  it("cria row quando nenhuma existe", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // isRecentPost
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 });
    expect(await canReply()).toBe(true);
  });

  it("permite em caso de erro de DB (fail-open)", async () => {
    mockQuery.mockRejectedValue(new Error("db error"));
    expect(await canReply()).toBe(true);
  });
});
