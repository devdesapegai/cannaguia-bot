import { summarizeCaption } from "../caption-summary";

describe("summarizeCaption", () => {
  it("retorna vazio pra caption vazia", () => {
    expect(summarizeCaption("")).toBe("");
  });

  it("retorna caption curta inalterada", () => {
    expect(summarizeCaption("Post sobre plantinha")).toBe("Post sobre plantinha");
  });

  it("remove hashtags genericas mas preserva tags do nicho como contexto", () => {
    const caption = "Bom dia galera #cannabis #medicinal #cultivo e mais texto";
    const result = summarizeCaption(caption);
    expect(result).not.toContain("#");
    expect(result).toContain("[tags: medicinal, cultivo]");
  });

  it("preserva hashtags do nicho de cultivo", () => {
    const caption = "Dia 45 🌱 #flora #indoor #grow";
    const result = summarizeCaption(caption);
    expect(result).toContain("[tags: flora, indoor, grow]");
  });

  it("nao adiciona tags se nenhuma hashtag do nicho", () => {
    const caption = "Post sobre a vida #love #blessed";
    const result = summarizeCaption(caption);
    expect(result).not.toContain("[tags:");
    expect(result).toBe("Post sobre a vida");
  });

  it("corta no fim da primeira frase se caption longa", () => {
    const caption = "Primeira frase sobre plantinha. Segunda frase com mais detalhes sobre o uso medicinal e seus beneficios. " +
      "Terceira frase com ainda mais contexto que ninguem precisa ler inteiro pra responder um comentario.";
    const result = summarizeCaption(caption);
    expect(result).toBe("Primeira frase sobre plantinha.");
    expect(result.length).toBeLessThanOrEqual(150);
  });

  it("corta na quebra de linha se vier antes", () => {
    const caption = "Titulo do post\nTexto longo que continua por varias linhas e tem muita informacao que dilui o contexto do que realmente importa pro bot responder.";
    const result = summarizeCaption(caption);
    expect(result).toBe("Titulo do post");
  });

  it("respeita limite maximo de 150 chars", () => {
    const caption = "A".repeat(300);
    expect(summarizeCaption(caption).length).toBeLessThanOrEqual(150);
  });
});
