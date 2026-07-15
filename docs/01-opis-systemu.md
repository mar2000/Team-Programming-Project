# 1. Opis systemu i zakres funkcjonalny

## 1.1. Cel aplikacji

Route Editor jest edytorem strukturalnych rysunków matematycznych działającym w przeglądarce. Jego głównym celem jest umożliwienie tworzenia ilustracji, które pozostają edytowalne na poziomie obiektów i relacji matematycznych.

W typowym edytorze bitmapowym rysunek po zapisaniu staje się zbiorem pikseli. W Route Editorze rysunek jest dokumentem zawierającym obiekty. Okrąg zna swój środek i promień, krawędź zna końce, punkt przecięcia zna obiekty, z których wynika, a wykres zna serie danych i ustawienia osi. Dzięki temu aplikacja może:

- odtwarzać rysunek po ponownym otwarciu;
- aktualizować konstrukcje zależne;
- sprawdzać poprawność odwołań;
- eksportować semantycznie poprawny kod TikZ;
- kopiować całe fragmenty wraz z zależnościami;
- rozbudowywać zbiór typów bez zmiany modelu bazy danych.

## 1.2. Tryby rysunku

Każdy dokument ma jeden główny tryb.

### Graf

Tryb służy do budowania grafów skierowanych i nieskierowanych. Podstawowymi obiektami są wierzchołki i krawędzie. Krawędź odwołuje się do identyfikatorów dwóch istniejących wierzchołków, co zapobiega tworzeniu połączeń bez końców.

### Geometria

Tryb służy do budowania konstrukcji geometrycznych. Obsługuje obiekty swobodne, takie jak punkty, odcinki, okręgi i wielokąty, a także obiekty zależne obliczane z innych elementów.

### Wykresy

Tryb służy do tworzenia wykresów danych i funkcji. Jeden obiekt wykresu może zawierać wiele serii, wiele funkcji, ustawienia osi, legendę, tytuły i zakresy.

W kodzie zachowano techniczną stałą trybu mieszanego w celu zgodności ze starszymi dokumentami, ale nie jest ona oferowana podczas tworzenia nowego rysunku.

## 1.3. Główne scenariusze użytkownika

### Tworzenie dokumentu

1. Użytkownik zakłada konto lub loguje się.
2. Wybiera utworzenie nowego rysunku.
3. Podaje tytuł i tryb.
4. Otwiera interaktywny edytor.
5. Dodaje obiekty, modyfikuje ich dane i styl.
6. Zmiany są zapisywane poprzez API aplikacji.

### Edycja geometrii dynamicznej

1. Użytkownik tworzy punkty bazowe.
2. Tworzy obiekt zależny, na przykład środek odcinka lub środek okręgu opisanego.
3. Obiekt zapisuje identyfikatory argumentów konstrukcji.
4. Po przesunięciu punktu bazowego pozycja obiektu wynikowego jest ponownie obliczana.

### Eksport do publikacji

1. Użytkownik przygotowuje rysunek.
2. Otwiera podgląd TikZ.
3. Kopiuje lub pobiera wygenerowany kod.
4. Wstawia kod do dokumentu LaTeX.

### Przenoszenie dokumentu

1. Użytkownik eksportuje rysunek do JSON.
2. Dokument zachowuje typy, identyfikatory, dane, style, kolejność i ustawienia płótna.
3. Plik może zostać ponownie zaimportowany jako nowy rysunek.

## 1.4. Funkcje wspólne edytora

Niezależnie od trybu edytor udostępnia:

- płótno SVG o konfigurowalnym rozmiarze;
- widoczną lub ukrytą siatkę;
- przyciąganie do siatki;
- listę obiektów;
- zaznaczanie kliknięciem;
- zaznaczanie prostokątne;
- zaznaczanie wielu obiektów;
- przeciąganie obiektów możliwych do przesunięcia;
- kopiowanie zaznaczenia;
- usuwanie z uwzględnieniem zależności;
- cofanie i ponawianie operacji w historii lokalnej;
- edycję etykiet i treści;
- edycję koloru, wypełnienia, grubości, kreskowania i widoczności;
- domyślny styl nowych obiektów;
- zapis ustawień dokumentu;
- komunikaty walidacyjne.

## 1.5. Własność danych

Każdy rysunek należy do konkretnego użytkownika. Widoki listy, szczegółów, usuwania, duplikowania, eksportu i API filtrują dane według aktualnie zalogowanego właściciela. Użytkownik nie powinien mieć dostępu do rysunków innych kont poprzez zmianę adresu URL.
