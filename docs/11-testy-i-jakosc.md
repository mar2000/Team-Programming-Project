# 11. Testy, jakość i diagnostyka

## 11.1. Zakres testów

Główny zestaw znajduje się w `routes/tests.py`. Obejmuje 364 testy automatyczne. Sprawdzane są między innymi:

- modele i ograniczenia unikalności;
- dostęp użytkowników do własnych dokumentów;
- tworzenie, aktualizacja i usuwanie obiektów;
- walidacja payloadów;
- dozwolone typy w trybach;
- zależności i usuwanie kaskadowe;
- operacje zbiorcze i atomowość;
- import i eksport JSON;
- generowanie TikZ;
- ustawienia dokumentu;
- konstrukcje geometryczne;
- rejestry typów i komend;
- pluginy;
- wykresy i niepewności;
- rozpoznawanie obrazów;
- zawartość szablonów i statycznego JavaScript.

## 11.2. Uruchamianie

```bash
python manage.py test
```

W zweryfikowanej wersji:

```text
Found 364 test(s).
Ran 364 tests.
OK
```

## 11.3. Znaczenie testów tekstowych frontendu

Część testów sprawdza obecność kontraktów i znaczników w JavaScript lub HTML. Jest to użyteczne jako ochrona przed przypadkowym usunięciem funkcji, ale nie zastępuje testów wykonywanych w prawdziwej przeglądarce.

## 11.4. Rekomendowane rozszerzenia testów

- testy jednostkowe JavaScript;
- testy komponentów DOM;
- testy end-to-end w Playwright lub Selenium;
- testy wizualnej regresji SVG;
- testy wydajności dla dużych dokumentów;
- testy fuzzingowe importu JSON;
- testy zgodności generowanego TikZ przez automatyczną kompilację;
- testy wielu przeglądarek.

## 11.5. Diagnostyka typowych problemów

### Serwer nie startuje

Sprawdzić aktywację środowiska i instalację `requirements.txt`.

### Brak tabeli w bazie

Uruchomić `python manage.py migrate`.

### Brak stylów lub skryptów

Sprawdzić obsługę plików statycznych i konsolę przeglądarki.

### Import obrazu nie rozpoznaje tekstu

Sprawdzić instalację programu Tesseract i jego dostępność w `PATH`.

### Konstrukcja znika po usunięciu punktu

Jest to oczekiwane zachowanie usuwania kaskadowego dla obiektów zależnych.
