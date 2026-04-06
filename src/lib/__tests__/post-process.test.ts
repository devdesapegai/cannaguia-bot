import { postProcess } from "../post-process";

describe("postProcess", () => {
  it("mantem texto normal inalterado", () => {
    expect(postProcess("KKKK adorei 😂🌱")).toBe("KKKK adorei 😂🌱");
  });

  it("corta apos 2 frases", () => {
    expect(postProcess("Primeira frase. Segunda frase. Terceira frase."))
      .toBe("Primeira frase. Segunda frase.");
  });

  it("limita a 3 emojis", () => {
    const result = postProcess("Aii que lindo 😂🔥🌱💚🥹");
    const emojis = result.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu) || [];
    expect(emojis.length).toBeLessThanOrEqual(3);
  });

  it("remove aspas ao redor", () => {
    expect(postProcess('"Adorei essa plantinha 🌱"')).toBe("Adorei essa plantinha 🌱");
  });

  it("lida com texto vazio", () => {
    expect(postProcess("")).toBe("");
  });
});
