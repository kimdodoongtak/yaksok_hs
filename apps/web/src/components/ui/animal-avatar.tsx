const animals = [
  <g key="rabbit"><path d="M22 29C14 8 17 2 22 5C26 7 28 18 28 27M35 27C36 13 42 2 46 6C51 10 45 23 42 30"/><path d="M17 29C10 34 10 48 18 53C25 58 41 58 49 52C57 46 53 34 46 30C37 25 25 25 17 29Z"/></g>,
  <g key="cat"><path d="M14 31L13 11Q22 10 28 21Q32 19 37 21Q44 11 51 12L50 32Q58 49 46 54Q32 59 18 54Q7 49 14 31Z"/><path d="M9 38l10 2m-10 6 10-1m26-5 10-2m-10 7 10 1"/></g>,
  <g key="dog"><path d="M16 27Q11 18 20 17Q19 8 29 12Q35 6 41 13Q51 10 50 20Q59 22 53 30Q61 37 54 43Q59 52 49 53Q46 61 38 56Q29 62 23 56Q13 59 13 50Q4 48 10 40Q3 31 16 27Z"/><path d="M15 28Q7 30 10 41m40-13q10 4 5 14"/></g>,
  <g key="bear"><path d="M16 26C4 23 9 8 19 12Q24 14 25 20Q32 18 39 20C40 8 53 9 55 17Q57 25 48 27Q57 38 51 50Q47 57 32 57Q17 57 12 49Q7 36 16 26Z"/><path d="M15 19q4-4 6 1m22 0q3-5 7-1"/></g>,
  <g key="fox"><path d="M13 31L9 8Q23 11 28 22Q32 20 36 22Q43 10 55 8L51 31Q57 42 46 50L32 59L18 50Q7 42 13 31Z"/><path d="m13 31 13 6m25-6-13 6M16 17l7 10m25-10-7 10" fill="none"/></g>,
  <g key="panda"><circle cx="15" cy="17" r="10" fill="#383B36"/><circle cx="49" cy="17" r="10" fill="#383B36"/><path d="M11 36Q11 18 32 18Q53 18 53 36Q57 56 32 58Q7 56 11 36Z"/><ellipse cx="23" cy="38" rx="7" ry="9" transform="rotate(25 23 38)" fill="#383B36"/><ellipse cx="41" cy="38" rx="7" ry="9" transform="rotate(-25 41 38)" fill="#383B36"/></g>,
  <g key="pig"><path d="M17 29Q7 25 8 12Q21 11 26 24M38 24Q43 11 56 12Q57 25 47 29"/><path d="M10 39Q10 20 32 21Q54 20 54 39Q56 57 32 58Q8 57 10 39Z"/><path d="m14 18 6 6m30-6-6 6" fill="none"/></g>,
  <g key="koala"><path d="M20 23Q12 8 5 18Q0 27 9 33Q0 40 12 45L22 37M44 23Q52 8 59 18Q64 27 55 33Q64 40 52 45L42 37"/><path d="M15 36Q14 20 32 20Q50 20 49 36Q56 56 32 58Q8 56 15 36Z"/><path d="M10 23q-4 5 2 9m42-9q4 5-2 9" fill="none"/></g>,
  <g key="mouse"><circle cx="14" cy="17" r="12"/><circle cx="50" cy="17" r="12"/><circle cx="14" cy="17" r="7" fill="#F8E3DC" stroke="none"/><circle cx="50" cy="17" r="7" fill="#F8E3DC" stroke="none"/><path d="M13 37Q12 21 32 21Q52 21 51 37Q53 54 32 59Q11 54 13 37Z"/><path d="m7 42 10 1m-9 7 10-3m29-4 10-1m-10 5 9 3" fill="none"/></g>,
  <g key="chick"><path d="M27 20Q23 10 28 7Q34 10 32 19Q37 8 41 12Q43 18 37 22Q54 27 54 43Q55 58 32 58Q9 58 10 43Q10 25 27 20Z"/><path d="M12 42q4 8 9 9m31-9q-4 8-9 9" fill="none"/></g>,
];
/** Stable across views: callers pass the index in the complete, join-ordered participant list. */
export function AnimalAvatar({ index, size = 36 }: { index: number; size?: number }) {
  const animal = index % animals.length;
  const eyeColor = animal === 5 ? "white" : "#383B36";
  return <svg className="animal-avatar" width={size} height={size} viewBox="0 0 64 64" fill="white" stroke="#383B36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {animals[animal]}
    <circle cx="24" cy="39" r="1.5" fill={eyeColor} stroke="none"/><circle cx="40" cy="39" r="1.5" fill={eyeColor} stroke="none"/>
    {animal === 6 ? <g><ellipse cx="32" cy="46" rx="8" ry="6" fill="#F8E3DC"/><circle cx="29" cy="46" r="1" fill="#383B36"/><circle cx="35" cy="46" r="1" fill="#383B36"/></g>
      : animal === 7 ? <g><ellipse cx="32" cy="43" rx="4" ry="6" fill="#383B36"/><path d="M28 51q4 3 8 0" fill="none"/></g>
      : animal === 9 ? <path d="m27 45 5-4 5 4-5 5Z" fill="#F8CAB9"/>
      : <path d="m30 44 2 1.5 2-1.5m-2 1.5v3m-5-1q5 4 10 0" fill="none"/>}
    <ellipse cx="19" cy="45" rx="3" ry="1.4" fill="#F8CAB9" stroke="none"/><ellipse cx="45" cy="45" rx="3" ry="1.4" fill="#F8CAB9" stroke="none"/>
  </svg>;
}
