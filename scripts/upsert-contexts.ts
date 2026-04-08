import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const contexts = [
  {
    media_id: "17960495409065655",
    title: "Esperando dar 10h porque antes é vício",
    context_text: `Humor/autoironia sobre horário de fumar. Maria bolando um beck torto enquanto espera dar 10h. O beck torto virou meme nos comentários (pastel, risole, tora, pamonha, tocha). Engajou forte: 60% confissão de horário pessoal, 20% marcação de amigos. Temas: rotina matinal, fumar antes do trabalho, fumar escondido, fumar em jejum. Leads: relatos sobre ansiedade/rotina e uso terapêutico (TEA).`,
  },
  {
    media_id: "18588349438057228",
    title: "Tem tempo ruim não viu (Eu feliz)",
    context_text: `Humor sobre estar feliz fumando. Tom positivo, autoironia. 252k views, 11k shares. Comentários: elogios (diva), emojis de risada, marcação de amigos. Tema: positividade e orgulho do uso. Oportunidade: reforçar posicionamento como consultora autêntica.`,
  },
  {
    media_id: "18137215534505439",
    title: "Não confunda os dinheiros",
    context_text: `Humor sobre separar o dinheiro do uso do dinheiro das contas. 141k views, 5.6k shares. Frase que pegou: "exatamente, as pessoas mistura as coisas". Comentários: concordância, risadas, marcação de amigos. Tema: gestão financeira cômica do uso. Oportunidade: mostrar organização e responsabilidade no uso.`,
  },
  {
    media_id: "18113977552675743",
    title: "Às vezes faço o que quero (Diva)",
    context_text: `Humor sobre liberdade de escolha e ser diva canábica. 193k views, 11k shares. Maria fumando com atitude, piteira longa. Comentários: identificação pessoal, elogios (diva, maravilhosa), concordância. Tema: liberdade e autonomia pessoal, empoderamento. Haters aparecem mas minoria.`,
  },
  {
    media_id: "18106860514769014",
    title: "Mercado chapado",
    context_text: `Humor sobre ir ao mercado depois de fumar e comprar besteira. Tom identificável, vida real. Comentários: histórias pessoais de mercado (esquece o que ia comprar, compra só larica, paranoia na fila, demora horas). Temas: larica + carrinho cheio de besteira + paranoia + esquecimento. Oportunidade: perguntar sobre larica favorita, receitas pós-brisa.`,
  },
  {
    media_id: "18359979352207860",
    title: "O que você faz depois de f1 / Eu lavo a louça sem estresse",
    context_text: `Humor sobre atividades pós-fumo: faxina, cozinha, lavar louça, cuidar da casa. Tom de mãe/mulher multitarefa produtiva. Comentários: confissões de produtividade na brisa, rotinas completas, receitas na brisa. Temas: quebra do estereótipo de preguiça, mãeconheira, faxina + brisa. Oportunidade: perguntar indica ou sativa, qual tarefa rende mais.`,
  },
  {
    media_id: "17876984751514756",
    title: "Eu lavo a louça sem estresse. E tu?",
    context_text: `Humor sobre fazer faxina e tarefas de casa na brisa sem estresse. Tom positivo, produtividade canábica. Comentários: identificação forte (limpo a casa, cozinho, malho, tudo na brisa), rotinas completas, orgulho. Temas: produtividade, mãeconheira, quebra de estereótipo. Leads: pessoas falando de cepas (sativa pra energia), pessoas sensíveis (pausa, fase difícil). Oportunidade: perguntar indica ou sativa, qual atividade rende mais.`,
  },
  {
    media_id: "18093299746888186",
    title: "Celulose / E agora? O que acontece ein?",
    context_text: `Vídeo sobre bolar com seda de celulose. Tom tutorial com humor. Comentários: debates celulose vs seda vs blunt, técnicas de bolar (castelado), elogios ao beck, piadas (celulite/celulose). Temas: acessórios, tipos de seda, preferências pessoais, redução de danos. Leads: pessoas com dor de cabeça/sensibilidade à celulose, perguntas sobre cepas.`,
  },
  {
    media_id: "18095314963839942",
    title: "Bem-vindos / Percebi que chegou muita gente nova",
    context_text: `Post de boas-vindas pra novos seguidores. Tom acolhedor. Comentários: "Eu cheguei" em massa. IMPORTANTE: variar as respostas (veio por qual vídeo? já curte a plantinha? seja bem vindo, puxa uma cadeira). Nunca assumir gênero. Oportunidade: perguntar há quanto tempo usa, o que trouxe pro perfil.`,
  },
  {
    media_id: "18077279402135950",
    title: "Meus superpoderes ativados / Superpoderosa fazendo tudo",
    context_text: `Humor sobre fazer tudo ao mesmo tempo chapada — limpando, cozinhando, organizando. Tom de superpoderosa canábica. 90.8k views. Comentários: identificação forte ("eu faço tudo chapada"), histórias de multitarefa, TDAH + cannabis, erros engraçados (óleo na bucha). Temas: produtividade, modo turbo, sativa vs indica. Oportunidade: perguntar qual cepa dá esse poder, se consegue terminar tudo.`,
  },
  {
    media_id: "18098428252814653",
    title: "Receita de beck / Ingredientes: uma piteira longa...",
    context_text: `Humor de receita culinária mas é receita de beck. Tom comédia com tutorial. Comentários: piadas sobre o tamanho do beck (dedo de macaco, braço do Hulk), elogios, técnicas de bolar, pudim como acompanhamento. Temas: humor, técnica de bolar, acessórios. Oportunidade: perguntar se já testou a receita, bola ou seda.`,
  },
  {
    media_id: "18049630574454785",
    title: "Coisas que você não deveria fazer chapado",
    context_text: `Humor sobre erros engraçados chapado. Tom comédia situacional. Comentários: histórias pessoais de erros (copo na geladeira, sal no café). Temas: situações cômicas do dia a dia. Oportunidade: pedir relatos, série usando histórias dos seguidores como roteiro.`,
  },
  {
    media_id: "17889984846409984",
    title: "Uso medicinal / terapêutico",
    context_text: `Conteúdo sobre uso medicinal/terapêutico da cannabis. Tom educativo e acolhedor, SEM humor. Comentários: relatos de uso pra dor, ansiedade, sono. IMPORTANTE: acolher sem piada, validar a experiência, tom de consultora. Nunca "kkkk" em relatos de saúde.`,
  },
];

async function main() {
  for (const ctx of contexts) {
    await pool.query(
      `INSERT INTO video_contexts (media_id, title, url, context_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (media_id) DO UPDATE SET title = $2, url = $3, context_text = $4, updated_at = now()`,
      [ctx.media_id, ctx.title, `https://www.instagram.com/p/${ctx.media_id}/`, ctx.context_text],
    );
    process.stdout.write(".");
  }
  console.log(`\nDone: ${contexts.length} contexts saved`);
  await pool.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
