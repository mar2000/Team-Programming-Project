# 12. Bezpieczeństwo, ograniczenia i dalszy rozwój

## 12.1. Mocne strony bezpieczeństwa aplikacyjnego

- standardowe uwierzytelnianie Django;
- ochrona CSRF dla formularzy i żądań modyfikujących;
- filtrowanie dokumentów według właściciela;
- walidacja JSON po stronie serwera;
- kontrola typów i odwołań;
- transakcje dla operacji złożonych;
- bezpieczne identyfikatory przy generowaniu TikZ.

## 12.2. Ustawienia wymagające zmiany przed produkcją

- sekret zapisany w repozytorium;
- aktywny tryb debug;
- brak hostów produkcyjnych;
- brak jawnej konfiguracji HTTPS;
- brak limitów rozmiaru importowanych plików opisanych na poziomie aplikacji;
- SQLite jako baza dla instalacji wieloużytkownikowej.

## 12.3. Ryzyko wyrażeń funkcji

Frontend tworzy podgląd funkcji podanych przez użytkownika. Takie wyrażenia powinny być traktowane jako dane nieufne. Nie należy przenosić ich do wykonywania po stronie serwera bez parsera i ograniczonego języka matematycznego.

## 12.4. Ryzyko LaTeX/TikZ

Eksport jest tekstem tworzonym z danych użytkownika. Przy automatycznej kompilacji na serwerze konieczny byłby sandbox, limit czasu i zakaz funkcji umożliwiających dostęp do systemu plików lub poleceń powłoki. Aktualny projekt nie kompiluje LaTeX po stronie serwera.

## 12.5. Skalowalność

Dla małych i średnich dokumentów pełne przesyłanie listy obiektów jest proste i wygodne. Przy tysiącach obiektów mogą pojawić się:

- opóźnienia renderowania SVG;
- kosztowne przeliczanie zależności;
- duże snapshoty historii;
- duże odpowiedzi JSON;
- wolne operacje grupowe.

Możliwe usprawnienia:

- indeksy i cache grafu zależności;
- renderowanie warstwowe lub wirtualizacja;
- przyrostowe aktualizacje;
- ograniczanie historii;
- Web Worker dla obliczeń geometrycznych;
- Canvas/WebGL dla bardzo dużych scen.

## 12.6. Współpraca wielu użytkowników

Aktualna architektura jest jednoosobowa na poziomie dokumentu. Współdzielenie w czasie rzeczywistym wymagałoby:

- modelu uprawnień;
- wersjonowania zmian;
- rozwiązywania konfliktów;
- WebSocketów;
- mechanizmu CRDT lub transformacji operacyjnej;
- historii audytowej.

## 12.7. Priorytetowe kierunki rozwoju

1. Rozdzielenie dużego `drawing_editor.js` na moduły.
2. Testy przeglądarkowe end-to-end.
3. Wydzielenie formalnego schematu JSON.
4. Migracja konfiguracji do zmiennych środowiskowych.
5. Lepsza dostępność klawiaturą i ARIA.
6. Stabilniejszy pipeline analizy zdjęć.
7. Biblioteka gotowych konstrukcji i szablonów.
8. Eksport SVG/PNG bezpośrednio z aktualnej sceny.
9. Wersjonowanie dokumentów.
10. Dokumentowane API pluginów jako osobny pakiet.
