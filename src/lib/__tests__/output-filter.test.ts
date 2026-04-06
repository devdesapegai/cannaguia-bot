import { validateOutput } from "../output-filter";

describe("validateOutput", () => {
  it("passa texto limpo", () => {
    const result = validateOutput("KKKK essa plantinha e demais 🌱💚");
    expect(result.safe).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it("bloqueia termos proibidos de substancia", () => {
    expect(validateOutput("essa maconha e boa").safe).toBe(false);
    expect(validateOutput("vamos fumar isso").safe).toBe(false);
    expect(validateOutput("fico chapado demais").safe).toBe(false);
    expect(validateOutput("cannabis medicinal").safe).toBe(false);
  });

  it("bloqueia termos de comercio", () => {
    expect(validateOutput("pode comprar aqui").safe).toBe(false);
    expect(validateOutput("preco bom").safe).toBe(false);
    expect(validateOutput("entrega rapida via pix").safe).toBe(false);
  });

  it("bloqueia termos medicos proibidos", () => {
    expect(validateOutput("isso vai curar voce").safe).toBe(false);
    expect(validateOutput("prescrevo 10mg/kg").safe).toBe(false);
  });

  it("retorna quais patterns foram flagged", () => {
    const result = validateOutput("compre maconha delivery");
    expect(result.safe).toBe(false);
    expect(result.flagged.length).toBeGreaterThanOrEqual(2);
  });
});
