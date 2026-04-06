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

  it("corta texto longo na ultima palavra inteira", () => {
    const long = "Perfil indica com mirceno e linalol ajuda demais no sono, experimenta comecar com pouco e vai sentindo o que funciona melhor pra voce 🌱💚";
    const result = postProcess(long);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result).not.toMatch(/\s$/);
  });

  it("lida com texto vazio", () => {
    expect(postProcess("")).toBe("");
  });
});
