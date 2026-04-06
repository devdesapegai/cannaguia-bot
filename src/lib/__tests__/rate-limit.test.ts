import { canReply } from "../rate-limit";

describe("canReply", () => {
  it("permite replies dentro do limite", () => {
    // canReply ja foi chamado em outros testes (estado compartilhado),
    // mas como o limite e 500, ainda deve estar longe
    expect(canReply()).toBe(true);
  });
});
