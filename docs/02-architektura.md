# 2. Architektura i przepływ danych

## 2.1. Ogólny podział systemu

Projekt jest monolityczną aplikacją Django z rozbudowanym frontendem JavaScript.

```text
Przeglądarka
  ├─ szablony HTML
  ├─ CSS
  ├─ edytor SVG w JavaScript
  ├─ rejestr narzędzi i dodatków
  └─ wywołania JSON/HTTP
          │
          ▼
Django
  ├─ uwierzytelnianie
  ├─ widoki stron
  ├─ API ustawień i obiektów
  ├─ walidacja typów i odwołań
  ├─ rozwiązywanie zależności
  ├─ import i eksport
  └─ moduł analizy obrazu
          │
          ▼
SQLite / ORM
  ├─ User
  ├─ Drawing
  └─ DrawingObject
```

## 2.2. Warstwa prezentacji

Szablony w `routes/templates/routes/` odpowiadają za:

- układ stron i nawigację;
- formularze rejestracji i logowania;
- listę dokumentów;
- formularz tworzenia dokumentu;
- osadzenie edytora;
- formularze importu JSON i obrazu;
- ekran potwierdzenia usunięcia.

Najważniejszy szablon to `drawing_detail.html`. Umieszcza on w DOM:

- pasek narzędzi;
- obszar roboczy SVG;
- listę obiektów;
- panel wykresów;
- boczny panel właściwości;
- dane konfiguracyjne i adresy API potrzebne frontendowi;
- skrypty rejestrów, dodatków i edytora.

## 2.3. Warstwa aplikacyjna frontendu

`drawing_editor.js` jest centralnym modułem zachowania interfejsu. Klasa `DrawingEditor` przechowuje stan dokumentu w pamięci przeglądarki, obsługuje zdarzenia i synchronizuje zmiany z backendem.

Warstwa frontendowa odpowiada między innymi za:

- interpretację kliknięć i przeciągnięć;
- renderowanie SVG;
- lokalne obliczanie pozycji obiektów zależnych;
- stan zaznaczenia;
- formularze właściwości;
- walidację interakcji przed wysłaniem danych;
- historię operacji;
- integrację z rejestrem narzędzi i pluginami;
- wizualizację wykresów.

Frontend nie jest jedynym źródłem poprawności. Backend ponownie waliduje typy, strukturę danych i zależności.

## 2.4. Warstwa aplikacyjna backendu

`routes/views.py` łączy funkcje stron HTML i API. Znajdują się tam:

- normalizacja ustawień;
- parsowanie JSON;
- walidacja ogólnego formatu obiektu;
- walidacja zawartości wykresów;
- kontrola odwołań między obiektami;
- walidacja trybu dokumentu;
- import i eksport;
- generowanie TikZ;
- operacje CRUD na obiektach;
- tworzenie atomowe wielu obiektów;
- obsługa stron użytkownika.

## 2.5. Rejestry domenowe

Aplikacja unika wielkiego, zamkniętego bloku instrukcji dla każdego typu obiektu. Zamiast tego używa rejestrów.

### Rejestr typów obiektów

`object_type_registry.py` przechowuje definicje rozszerzonych typów obiektów. Definicja może dostarczać:

- walidator danych;
- funkcję obliczającą pozycję;
- funkcję eksportującą do TikZ.

### Rejestr komend geometrycznych

`geometry_command_registry.py` opisuje komendy dostępne dla użytkownika. Komenda określa typ wynikowego obiektu, liczbę i rodzaj argumentów oraz walidator parametrów.

### Rejestr narzędzi frontendu

`tool_registry.js` opisuje narzędzia paska bocznego. Narzędzia mają identyfikator, etykietę, grupę, obsługiwane tryby, kolejność i opcjonalną komendę geometryczną.

## 2.6. Przepływ tworzenia obiektu

Typowy przepływ wygląda następująco:

1. Użytkownik wybiera narzędzie.
2. Frontend zbiera kliknięcia lub wskazane obiekty.
3. Budowany jest payload zawierający `object_id`, `type`, `data`, `style` i `order`.
4. Dla złożonej konstrukcji może powstać kilka payloadów powiązanych odwołaniami tymczasowymi.
5. Żądanie trafia do API.
6. Backend sprawdza format, tryb, rejestr typu i poprawność odwołań.
7. Obiekty są porządkowane według zależności.
8. Operacja jest wykonywana w transakcji.
9. Backend zwraca serializowane obiekty.
10. Frontend zastępuje dane lokalne odpowiedzią serwera i ponownie renderuje rysunek.

## 2.7. Źródło prawdy

Baza danych i backend są trwałym źródłem prawdy. Stan w JavaScript jest kopią roboczą służącą do interakcji. Po operacjach kaskadowych, importach lub złożonych zapisach frontend odświeża dane na podstawie odpowiedzi serwera.
