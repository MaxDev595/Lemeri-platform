// Finds a teammate by how people actually refer to them: "Виталик", "Вите",
// "Сашей", "Анну Петрову", "manager Ivan". Russian case endings and common
// diminutives are folded to a stem before comparing.

const DIMINUTIVES: Record<string, string> = {
  виталик: "виталий", витя: "виктор", вить: "виктор", саша: "александр", сашк: "александр", шура: "александр", леша: "алексей", лёша: "алексей", алеш: "алексей",
  дима: "дмитрий", димк: "дмитрий", миша: "михаил", мишк: "михаил", коля: "николай", колян: "николай", петя: "петр", ваня: "иван", ванек: "иван", сережа: "сергей", серёжа: "сергей", серега: "сергей",
  женя: "евгений", паша: "павел", вова: "владимир", володя: "владимир", слава: "вячеслав", костя: "константин", толя: "анатолий", гоша: "георгий", жора: "георгий", гриша: "григорий",
  андрюха: "андрей", антоша: "антон", макс: "максим", стас: "станислав", юра: "юрий", рома: "роман", вадик: "вадим", тёма: "артем", тема: "артем", артём: "артем", егорка: "егор", федя: "федор", ilya: "ilya",
  аня: "анна", анюта: "анна", маша: "мария", машк: "мария", катя: "екатерина", катюш: "екатерина", настя: "анастасия", лена: "елена", оля: "ольга", таня: "татьяна", наташа: "наталья", ира: "ирина",
  юля: "юлия", света: "светлана", вика: "виктория", даша: "дарья", надя: "надежда", люба: "любовь", галя: "галина", валя: "валентина", лиза: "елизавета", ксюша: "ксения", соня: "софья", поля: "полина", алина: "алина",
};

const norm = (value: string) => value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]+/g, " ").trim();
/** Strips the usual Russian case endings ("Виталику" → "виталик", "Анной" → "анн"). */
function stem(word: string) {
  const w = norm(word);
  if (/[a-z]/.test(w)) return w.replace(/(s|'s)$/, "");
  return w.replace(/(ами|ями|ому|ему|ой|ей|ою|ею|ом|ем|ам|ям|ах|ях|ую|юю|ы|и|у|ю|а|я|е|о|ь|й)$/u, "");
}
function canonical(word: string) {
  const w = norm(word), s = stem(word);
  return DIMINUTIVES[w] ?? DIMINUTIVES[s] ?? Object.entries(DIMINUTIVES).find(([k]) => k.length > 3 && stem(k) === s)?.[1] ?? w;
}

const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "" };
const latin = (value: string) => [...value].map(ch => TR[ch] ?? ch).join("");

export type Candidate = { id: string; name: string; email?: string | null; position?: string | null };

/** Returns the best matching member (or several when it is ambiguous). */
export function matchMembers<T extends Candidate>(query: string, members: T[]): T[] {
  const words = norm(query).split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  const scored = members.map(member => {
    const parts = norm(`${member.name} ${member.email?.split("@")[0] ?? ""}`).split(/\s+/).filter(Boolean);
    let score = 0;
    for (const word of words) {
      const ws = stem(word), wc = stem(canonical(word));
      for (const part of parts) {
        const ps = stem(part);
        if (/[a-z]/.test(part) && !/[a-z]/.test(word) && latin(ws).length >= 3 && part.startsWith(latin(ws))) score += 5;
        if (part === norm(word)) score += 6;
        else if (ps && (ps === ws || ps === wc || stem(canonical(part)) === wc)) score += 5;
        else if (ps.length >= 3 && ws.length >= 3 && (ps.startsWith(ws.slice(0, 4)) || ws.startsWith(ps.slice(0, 4)))) score += 2;
      }
      if (member.position && norm(member.position).includes(norm(word)) && word.length > 3) score += 1;
    }
    return { member, score };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0]!.score;
  return scored.filter(x => x.score === top).map(x => x.member);
}
