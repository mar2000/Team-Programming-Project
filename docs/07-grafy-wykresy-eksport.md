# 7. Grafy, wykresy, import i eksport

## 7.1. Grafy

Wierzchołek przechowuje pozycję, etykietę i styl. Krawędź przechowuje identyfikatory końców. Dzięki temu przesunięcie wierzchołka automatycznie zmienia geometrię wszystkich incydentnych krawędzi.

Krawędzie mogą być:

- nieskierowane;
- skierowane;
- stylowane kolorem, grubością, kreskowaniem i przezroczystością;
- opisywane etykietą.

Backend sprawdza, czy oba końce istnieją i są właściwego typu.

## 7.2. Wykres jako obiekt złożony

`plot.chart` jest pojedynczym obiektem zawierającym całą konfigurację wykresu. Pozwala to traktować wykres jako jedną jednostkę na liście i podczas kopiowania, przy zachowaniu wielu serii wewnątrz.

## 7.3. Serie danych

Seria może zawierać:

- nazwę;
- listę punktów `(x, y)`;
- typ wizualizacji;
- kolor i styl;
- niepewności `x` i `y`;
- ustawienia legendy.

Dane są parsowane i walidowane przed zapisem. Backend kontroluje strukturę list i wartości liczbowe.

## 7.4. Funkcje

Wykres może zawierać funkcje opisane wyrażeniem, zakresem i stylem. Frontend generuje podgląd numeryczny, natomiast eksport PGFPlots zachowuje oryginalne wyrażenie użytkownika.

## 7.5. Osie i prezentacja

Konfiguracja obejmuje:

- tytuł wykresu;
- etykietę osi X;
- etykietę osi Y;
- zakresy minimalne i maksymalne;
- automatyczny zakres przy pustych polach;
- widoczność legendy;
- położenie osi wynikające z danych.

## 7.6. Eksport JSON

Eksport JSON służy jako format wymiany i kopii zapasowej. Dokument zawiera:

- wersję formatu;
- tytuł;
- tryb;
- metadane;
- ustawienia;
- listę obiektów.

Każdy obiekt zachowuje logiczny `object_id`, typ, dane, styl i kolejność.

## 7.7. Import JSON

Import tworzy nowy dokument. Wymagane jest zachowanie spójności identyfikatorów i kolejności zależności. Niepoprawny dokument jest odrzucany bez częściowego zapisu.

## 7.8. Eksport TikZ

Eksport geometrii i grafów generuje środowisko `tikzpicture`. Współrzędna Y jest odwracana względem SVG, ponieważ w przeglądarce rośnie w dół, a w układzie matematycznym w górę.

Skala TikZ pozwala kontrolować przeliczenie pikseli płótna na jednostki dokumentu.

## 7.9. Eksport PGFPlots

Dla wykresów generowane jest środowisko `axis` oraz polecenia `addplot`. Eksport uwzględnia:

- punkty i linie;
- funkcje;
- legendę;
- podpisy osi;
- zakresy;
- słupki błędów;
- style serii.

## 7.10. Podgląd kodu

Podgląd TikZ umożliwia sprawdzenie i skopiowanie kodu bez pobierania pliku. Jest to tekstowy podgląd źródła, a nie pełna kompilacja LaTeX po stronie serwera.
