import { filterComment } from "../filters";

describe("filterComment", () => {
  it("ignora comentarios vazios", () => {
    expect(filterComment("")).toEqual({ action: "ignore", reason: "empty" });
    expect(filterComment("  ")).toEqual({ action: "ignore", reason: "empty" });
  });

  it("ignora comentarios muito curtos", () => {
    expect(filterComment("oi")).toEqual({ action: "ignore", reason: "too_short" });
  });

  it("responde emoji-only pra puxar conversa", () => {
    expect(filterComment("😂🔥")).toEqual({ action: "respond" });
  });

  it("ignora tags-only", () => {
    expect(filterComment("@fulano @ciclano")).toEqual({ action: "ignore", reason: "tags_only" });
  });

  it("detecta bot por username", () => {
    expect(filterComment("oi amiga", "promo1ofertas")).toEqual({ action: "ignore", reason: "bot_username" });
    expect(filterComment("oi amiga", "spamlinks")).toEqual({ action: "ignore", reason: "bot_username" });
    expect(filterComment("oi amiga", "followbot")).toEqual({ action: "ignore", reason: "bot_username" });
  });

  it("ignora conteudo de risco", () => {
    expect(filterComment("vou me matar")).toEqual({ action: "ignore", reason: "risk" });
    expect(filterComment("falar de suicidio")).toEqual({ action: "ignore", reason: "risk" });
  });

  it("esconde spam", () => {
    expect(filterComment("compre agora no link")).toEqual({ action: "hide", reason: "spam" });
    expect(filterComment("sigam meu perfil")).toEqual({ action: "hide", reason: "spam" });
  });

  it("marca ofensivo como hater", () => {
    expect(filterComment("sua vagabunda")).toEqual({ action: "respond_hater" });
    expect(filterComment("que idiota")).toEqual({ action: "respond_hater" });
  });

  it("responde comentarios normais", () => {
    expect(filterComment("qual a melhor plantinha pra dormir?")).toEqual({ action: "respond" });
    expect(filterComment("adorei o post")).toEqual({ action: "respond" });
  });
});
