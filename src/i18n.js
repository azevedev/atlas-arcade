// Language layer: UI strings, place-name selection, and the active-language store.
//
// Two kinds of translation live here. UI copy is a plain dictionary. Country and
// capital names come from the dataset (built by scripts/build_data.py), so this
// module only decides which field to read. Region names sit in between: there
// are 29 of them and they never change, so they are dictionary entries keyed by
// the English string the dataset already carries.

export const LANGS = ["en", "pt-BR"];
const STORE_KEY = "aa_lang";

const UI = {
  en: {
    "app.title": "Atlas Arcade: flags, capitals & the globe",
    "app.description": "An arcade geography quiz: name countries from flags & shapes, guess capitals, and locate places on a spinning globe.",
    "app.loading": "Loading Atlas Arcade…",
    "app.tagline": "Name the country. Find it on the globe.",

    "menu.arcade": "Arcade",
    "menu.arcadeSub": "3 lives · chase a high score",
    "menu.daily": "Daily Challenge",
    "menu.dailyNew": "10 puzzles · new every day",
    "menu.dailyPlayed": "played today · replay for fun",
    "menu.worldcup": "World Cup",
    "menu.worldcupSub": "74 past World Cup nations",
    "picker.worldcup": "World Cup",
    "picker.worldcupSub": "74 nations that have played a World Cup. 3 lives.",
    "menu.best": "Best",
    "menu.streak": "Streak",
    "menu.sound": "Sound",
    "menu.muted": "Muted",
    "menu.dark": "Dark",
    "menu.light": "Light",
    "menu.language": "Português",
    "menu.languageAria": "Mudar para português",
    "menu.howto": "How to play",
    "menu.howto1": "<b>Name the country</b> from its flag, its shape, or where it lights up on the globe.",
    "menu.howto2": "<b>Name the capital</b>. A soft blob shows roughly where it sits.",
    "menu.howto3": "<b>Locate it</b> by tapping the spinning globe as close as you can. Pinch, scroll, or use the +/− buttons to zoom in on small countries.",
    "menu.howto4": "Tap a flag or shape to see it full size.",
    "menu.howto5": "Every question starts at full points. Hints and wrong guesses cost you. Chain correct answers for a <b>combo</b>.",

    "diff.group": "Difficulty",
    "diff.easy": "Easy",
    "diff.normal": "Normal",
    "diff.hard": "Hard",
    "diff.easyNote": "Best-known countries. No lives, {n} questions.",
    "diff.normalNote": "Gets harder as you go. 3 lives.",
    "diff.hardNote": "Obscure countries, no hints. 3 lives.",
    "picker.title": "Pick a mode",
    "picker.sub": "3 lives. Chase a high score.",
    "picker.back": "‹ Back",

    "cat.mixed": "Mixed",
    "cat.mixedBlurb": "flags, shapes, capitals & locate",
    "cat.flag": "Flags",
    "cat.flagBlurb": "name the country from its flag",
    "cat.shape": "Shapes",
    "cat.shapeBlurb": "name the country from its outline",
    "cat.capital": "Capitals",
    "cat.capitalBlurb": "name the capital city",
    "cat.locate": "Locate",
    "cat.locateBlurb": "tap where it is on the globe",

    "hud.score": "SCORE",
    "hud.back": "Back to menu",
    "hud.combo": "combo",

    "game.promptCountry": "Name this country",
    "game.promptCapital": "What is the capital of {country}?",
    "game.promptLocate": "Where is {country}?",
    "game.placeholder": "Type your answer…",
    "game.placeholderCountry": "Name the country…",
    "game.placeholderCapital": "Name the capital…",
    "game.tapGlobe": "tap the globe 👆",
    "game.hint": "Hint",
    "game.skip": "Skip",
    "game.continue": "Continue ›",
    "game.noMatch": "No match",
    "game.points": "pts",

    "zoom.group": "Globe zoom",
    "zoom.in": "Zoom in",
    "zoom.out": "Zoom out",
    "zoom.reset": "Reset zoom",

    "clue.enlarge": "Enlarge the clue",
    "clue.title": "Clue",
    "clue.flag": "Flag",
    "clue.shape": "Shape",
    "clue.close": "Close and keep playing",
    "clue.flagAlt": "Flag of the country to guess",
    "clue.shapeAlt": "Outline of the country to guess",
    "clue.flagHint": "Flag hint, enlarge",
    "clue.shapeHint": "Shape hint, enlarge",

    "hint.shape": "Shape revealed",
    "hint.flag": "Flag revealed",
    "hint.region": "Region: {region}",
    "hint.continent": "Located in {region}",
    "hint.first": "Starts with “{letter}”",
    "hint.pattern": "Pattern: {pattern}",
    "hint.letters": "Letters: {pattern}",
    "hint.position": "Location revealed on the globe",
    "hint.unknown": "unknown",

    "reveal.wasCapital": "It was <b>{answer}</b>, {country}",
    "reveal.was": "It was <b>{answer}</b>",
    "reveal.tapped": "<b>{country}</b>. You tapped <b>{tapped}</b>",
    "reveal.ocean": "open ocean",
    "reveal.away": "{km} km away",
    "reveal.skipped": "skipped",
    "reveal.in": "in {time}",

    "results.daily": "Daily complete!",
    "results.over": "Run over!",
    "results.nice": "Nice run!",
    "results.points": "points",
    "results.correct": "correct",
    "results.best": "best",
    "results.record": "New record!",
    "results.streak": "day streak",
    "results.streakOne": "day streak",
    "results.share": "📋 Share result",
    "results.again": "Play again",
    "results.menu": "Menu",
    "results.copied": "Copied to clipboard!",
    "results.copyFailed": "Copy failed",

    "boot.failed": "Couldn't load the game.",
    "boot.hint": "Check your connection and refresh. If you're opening the file directly, run a local server first",

    region: {
      Africa: "Africa", Americas: "Americas", Asia: "Asia", Europe: "Europe", Oceania: "Oceania",
      "Australia and New Zealand": "Australia and New Zealand", Caribbean: "Caribbean",
      "Central America": "Central America", "Central Asia": "Central Asia",
      "Central Europe": "Central Europe", "Eastern Africa": "Eastern Africa",
      "Eastern Asia": "Eastern Asia", "Eastern Europe": "Eastern Europe",
      Melanesia: "Melanesia", Micronesia: "Micronesia", "Middle Africa": "Middle Africa",
      "North America": "North America", "Northern Africa": "Northern Africa",
      "Northern Europe": "Northern Europe", Polynesia: "Polynesia",
      "South America": "South America", "South-Eastern Asia": "South-Eastern Asia",
      "Southeast Europe": "Southeast Europe", "Southern Africa": "Southern Africa",
      "Southern Asia": "Southern Asia", "Southern Europe": "Southern Europe",
      "Western Africa": "Western Africa", "Western Asia": "Western Asia",
      "Western Europe": "Western Europe",
      "the world": "the world",
    },
  },

  "pt-BR": {
    "app.title": "Atlas Arcade: bandeiras, capitais e o globo",
    "app.description": "Um quiz de geografia estilo arcade: descubra países pela bandeira ou pelo contorno, acerte as capitais e ache lugares no globo.",
    "app.loading": "Carregando o Atlas Arcade…",
    "app.tagline": "Descubra o país. Ache no globo.",

    "menu.arcade": "Arcade",
    "menu.arcadeSub": "3 vidas · busque o recorde",
    "menu.daily": "Desafio Diário",
    "menu.dailyNew": "10 perguntas · novas todo dia",
    "menu.dailyPlayed": "já jogou hoje · repita à vontade",
    "menu.worldcup": "Copa do Mundo",
    "menu.worldcupSub": "74 países que já jogaram",
    "picker.worldcup": "Copa do Mundo",
    "picker.worldcupSub": "74 países que já jogaram uma Copa. 3 vidas.",
    "menu.best": "Recorde",
    "menu.streak": "Sequência",
    "menu.sound": "Som",
    "menu.muted": "Mudo",
    "menu.dark": "Escuro",
    "menu.light": "Claro",
    "menu.language": "English",
    "menu.languageAria": "Switch to English",
    "menu.howto": "Como jogar",
    "menu.howto1": "<b>Descubra o país</b> pela bandeira, pelo contorno ou por onde ele acende no globo.",
    "menu.howto2": "<b>Diga a capital</b>. Uma mancha suave mostra mais ou menos onde ela fica.",
    "menu.howto3": "<b>Ache no globo</b> tocando o mais perto que conseguir. Use pinça, rolagem ou os botões +/− para aproximar países pequenos.",
    "menu.howto4": "Toque em uma bandeira ou contorno para vê-los em tamanho grande.",
    "menu.howto5": "Cada pergunta começa com a pontuação cheia. Dicas e erros descontam. Acertos seguidos formam um <b>combo</b>.",

    "diff.group": "Dificuldade",
    "diff.easy": "Fácil",
    "diff.normal": "Normal",
    "diff.hard": "Difícil",
    "diff.easyNote": "Países mais conhecidos. Sem vidas, {n} perguntas.",
    "diff.normalNote": "Fica mais difícil conforme avança. 3 vidas.",
    "diff.hardNote": "Países pouco conhecidos, sem dicas. 3 vidas.",
    "picker.title": "Escolha um modo",
    "picker.sub": "3 vidas. Busque o recorde.",
    "picker.back": "‹ Voltar",

    "cat.mixed": "Misto",
    "cat.mixedBlurb": "bandeiras, contornos, capitais e localizar",
    "cat.flag": "Bandeiras",
    "cat.flagBlurb": "descubra o país pela bandeira",
    "cat.shape": "Contornos",
    "cat.shapeBlurb": "descubra o país pelo contorno",
    "cat.capital": "Capitais",
    "cat.capitalBlurb": "diga o nome da capital",
    "cat.locate": "Localizar",
    "cat.locateBlurb": "toque onde fica no globo",

    "hud.score": "PONTOS",
    "hud.back": "Voltar ao menu",
    "hud.combo": "combo",

    "game.promptCountry": "Que país é este?",
    "game.promptCapital": "Qual é a capital {countryOf}?",
    "game.promptLocate": "Onde fica {countryArt}?",
    "game.placeholder": "Digite sua resposta…",
    "game.placeholderCountry": "Nome do país…",
    "game.placeholderCapital": "Nome da capital…",
    "game.tapGlobe": "toque no globo 👆",
    "game.hint": "Dica",
    "game.skip": "Pular",
    "game.continue": "Continuar ›",
    "game.noMatch": "Nada encontrado",
    "game.points": "pts",

    "zoom.group": "Zoom do globo",
    "zoom.in": "Aproximar",
    "zoom.out": "Afastar",
    "zoom.reset": "Voltar ao zoom normal",

    "clue.enlarge": "Ampliar a pista",
    "clue.title": "Pista",
    "clue.flag": "Bandeira",
    "clue.shape": "Contorno",
    "clue.close": "Fechar e continuar jogando",
    "clue.flagAlt": "Bandeira do país a adivinhar",
    "clue.shapeAlt": "Contorno do país a adivinhar",
    "clue.flagHint": "Dica de bandeira, ampliar",
    "clue.shapeHint": "Dica de contorno, ampliar",

    "hint.shape": "Contorno revelado",
    "hint.flag": "Bandeira revelada",
    "hint.region": "Região: {region}",
    "hint.continent": "Fica {regionIn}",
    "hint.first": "Começa com “{letter}”",
    "hint.pattern": "Padrão: {pattern}",
    "hint.letters": "Letras: {pattern}",
    "hint.position": "Local revelado no globo",
    "hint.unknown": "desconhecida",

    "reveal.wasCapital": "Era <b>{answer}</b>, {country}",
    "reveal.was": "Era <b>{answer}</b>",
    "reveal.tapped": "<b>{country}</b>. Você tocou em <b>{tapped}</b>",
    "reveal.ocean": "mar aberto",
    "reveal.away": "a {km} km",
    "reveal.skipped": "pulou",
    "reveal.in": "em {time}",

    "results.daily": "Desafio concluído!",
    "results.over": "Fim de jogo!",
    "results.nice": "Boa partida!",
    "results.points": "pontos",
    "results.correct": "certas",
    "results.best": "recorde",
    "results.record": "Novo recorde!",
    "results.streak": "dias seguidos",
    "results.streakOne": "dia seguido",
    "results.share": "📋 Compartilhar",
    "results.again": "Jogar de novo",
    "results.menu": "Menu",
    "results.copied": "Copiado!",
    "results.copyFailed": "Não deu para copiar",

    "boot.failed": "Não foi possível carregar o jogo.",
    "boot.hint": "Verifique a conexão e recarregue. Se abriu o arquivo direto, rode um servidor local antes",

    region: {
      Africa: "África", Americas: "Américas", Asia: "Ásia", Europe: "Europa", Oceania: "Oceania",
      "Australia and New Zealand": "Austrália e Nova Zelândia", Caribbean: "Caribe",
      "Central America": "América Central", "Central Asia": "Ásia Central",
      "Central Europe": "Europa Central", "Eastern Africa": "África Oriental",
      "Eastern Asia": "Ásia Oriental", "Eastern Europe": "Europa Oriental",
      Melanesia: "Melanésia", Micronesia: "Micronésia", "Middle Africa": "África Central",
      "North America": "América do Norte", "Northern Africa": "Norte da África",
      "Northern Europe": "Europa Setentrional", Polynesia: "Polinésia",
      "South America": "América do Sul", "South-Eastern Asia": "Sudeste Asiático",
      "Southeast Europe": "Sudeste Europeu", "Southern Africa": "África Austral",
      "Southern Asia": "Sul da Ásia", "Southern Europe": "Europa Meridional",
      "Western Africa": "África Ocidental", "Western Asia": "Ásia Ocidental",
      "Western Europe": "Europa Ocidental",
      "the world": "o mundo",
    },
  },
};

function resolve() {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved && LANGS.includes(saved)) return saved;
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
  return nav.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

let lang = resolve();

export const getLang = () => lang;
export const isPt = () => lang === "pt-BR";

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return false;
  lang = next;
  localStorage.setItem(STORE_KEY, next);
  document.documentElement.lang = next;
  return true;
}

export function t(key, params) {
  const dict = UI[lang] || UI.en;
  let s = dict[key];
  if (s == null) s = UI.en[key];
  if (s == null) return key; // surface the key rather than rendering "undefined"
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

// Region / subregion names. Keyed by the English string the dataset carries, so
// the data file stays language-neutral.
export function tRegion(name) {
  if (!name) return t("hint.unknown");
  const dict = (UI[lang] || UI.en).region;
  return dict[name] || name;
}

// ---- place names -----------------------------------------------------------
export const countryName = (c) => (c ? (isPt() && c.namePt) || c.name : "");
export const capitalName = (c) => (c ? (isPt() && c.capitalPt) || c.capital : "");

// Portuguese contracts the article onto the preposition ("a capital DO Brasil",
// "DA França", "DE Portugal"), and English does not. The article per country is
// curated at build time (see scripts/build_data.py) rather than guessed from the
// ending here: the -a rule is right most of the time but wrong often enough to
// matter, and "a capital da Camboja" is exactly the kind of slip that makes a
// translation feel machine-made.
const CONTRACT = { o: "do", a: "da", os: "dos", as: "das" };

// "capital do Brasil" / "capital da França" / "capital de Portugal"
export function countryOf(c) {
  const name = countryName(c);
  if (!isPt()) return name;
  const art = c && c.artPt;
  return art ? `${CONTRACT[art]} ${name}` : `de ${name}`;
}

// "Onde fica o Brasil?" / "a França?" / "Portugal?"
export function countryArt(c) {
  const name = countryName(c);
  if (!isPt()) return name;
  const art = c && c.artPt;
  return art ? `${art} ${name}` : name;
}

// "Fica na Europa" / "no Sudeste Asiático"
export function regionIn(name) {
  const r = tRegion(name);
  if (!isPt()) return r;
  return /a$|as$/.test(r) ? `n${/as$/.test(r) ? "as" : "a"} ${r}` : `n${/os$/.test(r) ? "os" : "o"} ${r}`;
}

// ---- static markup ---------------------------------------------------------
// Elements carry their key in the markup so the English copy stays readable in
// the HTML (and still shows if this ever fails to run).
//   data-i18n       -> textContent
//   data-i18n-html  -> innerHTML, for the few strings with <b> in them
//   data-i18n-aria  -> aria-label
//   data-i18n-ph    -> placeholder
//   data-i18n-content -> content, for <meta>
export function applyStaticText(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll("[data-i18n-content]"))
    el.setAttribute("content", t(el.dataset.i18nContent));
  document.title = t("app.title");
}

document.documentElement.lang = lang;
