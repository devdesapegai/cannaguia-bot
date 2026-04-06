import { isDuplicate, isOnCooldown } from "../dedup";

describe("isDuplicate", () => {
  it("retorna false na primeira vez e true na segunda", () => {
    const id = `test-dedup-${Date.now()}`;
    expect(isDuplicate(id)).toBe(false);
    expect(isDuplicate(id)).toBe(true);
  });

  it("ids diferentes nao colidem", () => {
    const id1 = `test-a-${Date.now()}`;
    const id2 = `test-b-${Date.now()}`;
    expect(isDuplicate(id1)).toBe(false);
    expect(isDuplicate(id2)).toBe(false);
  });
});

describe("isOnCooldown", () => {
  it("retorna false na primeira vez e true na segunda pra mesmo user+media", () => {
    const userId = `user-${Date.now()}`;
    const mediaId = `media-${Date.now()}`;
    expect(isOnCooldown(userId, mediaId)).toBe(false);
    expect(isOnCooldown(userId, mediaId)).toBe(true);
  });

  it("mesmo user em media diferente nao tem cooldown", () => {
    const userId = `user-cd-${Date.now()}`;
    expect(isOnCooldown(userId, "media-1")).toBe(false);
    expect(isOnCooldown(userId, "media-2")).toBe(false);
  });
});
