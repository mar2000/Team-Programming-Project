# 5. Backend, widoki i API

## 5.1. Routing

Najważniejsze ścieżki aplikacji:

| Metoda | Ścieżka | Funkcja |
|---|---|---|
| GET | `/` | lista rysunków |
| GET/POST | `/drawings/create/` | tworzenie dokumentu |
| GET/POST | `/drawings/import/` | import JSON |
| GET/POST | `/drawings/import/image/` | import obrazu |
| GET | `/drawings/<id>/` | edytor dokumentu |
| POST | `/drawings/<id>/duplicate/` | duplikowanie |
| GET/POST | `/drawings/<id>/delete/` | usuwanie |
| GET | `/drawings/<id>/export/tikz/` | pobranie TikZ |
| GET | `/drawings/<id>/export/json/` | pobranie JSON |
| GET | `/drawings/<id>/export/tikz/preview/` | podgląd TikZ |
| GET/PUT | `/drawings/<id>/settings/` | ustawienia |
| GET/POST | `/drawings/<id>/objects/` | kolekcja obiektów |
| POST | `/drawings/<id>/objects/bulk/` | tworzenie wielu obiektów |
| GET/PUT/PATCH/DELETE | `/drawings/<id>/objects/<object_id>/` | pojedynczy obiekt |

## 5.2. Uwierzytelnianie i autoryzacja

Widoki dokumentów wymagają zalogowania. Każde pobranie dokumentu odbywa się z ograniczeniem `user=request.user`. Dzięki temu nie wystarczy znać liczbowego identyfikatora cudzego rysunku.

## 5.3. Walidacja payloadu

Backend sprawdza:

- czy body jest poprawnym JSON;
- czy obiekt główny jest słownikiem;
- czy `object_id` ma poprawny format i długość;
- czy typ jest tekstem;
- czy `data` i `style` są obiektami JSON;
- czy `order` jest liczbą;
- czy typ jest dozwolony w trybie dokumentu;
- czy typ jest znany jako typ podstawowy lub zarejestrowany;
- czy pola wymagane przez typ są obecne;
- czy odwołania wskazują istniejące obiekty odpowiednich rodzajów;
- czy obiekt nie odwołuje się do siebie;
- czy nie powstają niedozwolone zależności.

## 5.4. API kolekcji obiektów

### GET

Zwraca wszystkie obiekty dokumentu w kolejności `order`, `id`.

### POST

Tworzy pojedynczy obiekt po pełnej walidacji. Konflikt identyfikatora jest zgłaszany jako błąd zamiast cichego nadpisania.

## 5.5. API pojedynczego obiektu

### GET

Zwraca aktualny stan obiektu.

### PUT/PATCH

Aktualizuje dane i styl. Po zmianie nadal weryfikowana jest integralność odwołań.

### DELETE

Usuwa wskazany obiekt oraz zależne od niego elementy zgodnie z domknięciem zależności. Zapobiega to pozostawieniu obiektów wskazujących nieistniejącą bazę.

## 5.6. Tworzenie zbiorcze

Endpoint `objects/bulk/` jest przeznaczony dla narzędzi tworzących kilka elementów naraz, na przykład punktów sterujących i figury.

Mechanizm:

1. Odczytuje listę payloadów.
2. Wyszukuje odwołania tymczasowe do obiektów tworzonych w tej samej operacji.
3. Ustala kolejność tworzenia na podstawie grafu zależności.
4. Rozwiązuje odwołania na właściwe identyfikatory.
5. Waliduje każdy obiekt.
6. Zapisuje wszystko w jednej transakcji.
7. W razie błędu wycofuje całą operację.

Atomowość jest szczególnie ważna: użytkownik nie powinien otrzymać połowy okręgu lub wielokąta bez punktów sterujących.

## 5.7. Duplikowanie dokumentu

Duplikowanie tworzy nowy `Drawing` należący do tego samego użytkownika i kopiuje wszystkie `DrawingObject` wraz z danymi, stylem i kolejnością. Identyfikatory obiektów mogą pozostać takie same, ponieważ unikalność obowiązuje osobno w każdym dokumencie.

## 5.8. Import JSON

Importer:

- sprawdza wersję i strukturę dokumentu;
- waliduje tryb;
- tworzy nowy dokument;
- sortuje obiekty według zależności;
- waliduje każdy element;
- zapisuje operację transakcyjnie.

Import nie nadpisuje istniejącego dokumentu.

## 5.9. Generowanie TikZ

Funkcja `build_drawing_tikz` przechodzi po obiektach i generuje kod właściwy dla ich typu. Odpowiada za:

- bezpieczne identyfikatory TikZ;
- przeliczenie układu współrzędnych SVG na układ matematyczny;
- skalowanie;
- style linii i wypełnień;
- etykiety;
- strzałki;
- konstrukcje geometryczne;
- wykresy PGFPlots;
- serie, funkcje, legendę i niepewności.

## 5.10. Serializacja

Standardowa odpowiedź obiektu ma postać:

```json
{
  "id": 123,
  "object_id": "p1",
  "type": "geometry.point",
  "data": {},
  "style": {},
  "order": 0,
  "dependencies": [],
  "created_at": "...",
  "updated_at": "..."
}
```

Pole `dependencies` jest wyliczane i nie musi być zapisane w bazie.
