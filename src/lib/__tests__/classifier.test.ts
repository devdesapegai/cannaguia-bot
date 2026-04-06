import { classifyComment } from "../classifier";

describe("classifyComment", () => {
  it("classifica zueira", () => {
    expect(classifyComment("kkkkk cedo demais pra isso")).toBe("zueira");
    expect(classifyComment("bora que bora")).toBe("zueira");
  });

  it("classifica elogio", () => {
    expect(classifyComment("amei demais esse post")).toBe("elogio");
    expect(classifyComment("parabens pelo trabalho")).toBe("elogio");
    expect(classifyComment("voce e incrivel")).toBe("elogio");
  });

  it("classifica duvida", () => {
    expect(classifyComment("qual a melhor pra dormir?")).toBe("duvida");
    expect(classifyComment("serve pra ansiedade?")).toBe("duvida");
    expect(classifyComment("como funciona o CBD?")).toBe("duvida");
  });

  it("classifica desabafo", () => {
    expect(classifyComment("to passando por uma fase dificil")).toBe("desabafo");
    expect(classifyComment("me sinto sozinha")).toBe("desabafo");
  });

  it("classifica cultivo", () => {
    expect(classifyComment("minhas meninas tao na flora")).toBe("cultivo");
    expect(classifyComment("o pH ta muito alto")).toBe("cultivo");
    expect(classifyComment("quando comecar a poda?")).toBe("cultivo");
  });

  it("retorna geral quando nao bate", () => {
    expect(classifyComment("bom dia")).toBe("geral");
    expect(classifyComment("oi maria")).toBe("geral");
  });
});
