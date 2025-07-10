export const anonUsernames = new Set([
  "ahven",
  "haug",
  "ogalik",
  "heeringas",
  "kilu",
  "angerjas",
  "koha",
  "hai",
  "lest",
  "tursk",
  "tuun",
  "forell",
  "haigur",
  "kajakas",
  "viires",
  "pelikan",
  "tiir",
  "kurg",
  "part",
  "luik",
  "hani",
]);

export const validateUsername = (username: string) => {
  if (!/^[a-z0-9._]+$/.test(username)) {
    return "Kasutajanimi tohib sisaldada ainult ladina tähestiku tähti, numbreid, punkte ja allkriipse.";
  }

  if (username.length < 2) {
    return "Kasutajanimi peab olema vähemalt kaks tähemärki pikk.";
  }

  if (username.length > 20) {
    return "Kasutajanimi ei tohi olla pikem kui 20 tähemärki.";
  }

  return null;
};
